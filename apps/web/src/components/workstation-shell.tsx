import { Tabs, TabsList, TabsPanel, TabsTab } from "@ochoit/ui/components/tabs";
import { toast } from "@ochoit/ui/components/toast";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { CircleAlert } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  type ArrangementTextFormat,
  SONG_MAX_SAMPLE_COUNT,
  applySongEdit,
  buildSongShareUrl,
  createEmptySongDocument,
  getOrderedTracks,
  parseSongShareText,
  readSongShareFromHash,
  replaceSampleTrackSampleReference,
  serializeTrackArrangement,
  serializeSongShareText,
  type SongDocument,
  type SongEdit,
  type SongEditResult,
  type TrackId,
} from "ochoit-lib";

import { SampleDeck } from "@/components/sample-deck";
import { SequencerMatrix } from "@/components/sequencer-matrix";
import { ArrangementDialog, reformatArrangementDraft, type ArrangementEditor } from "@/components/shell/arrangement-dialog";
import { clearSongShareFromCurrentUrl, copyTextToClipboard, downloadBlobFile } from "@/components/shell/browser";
import { ConfirmDialog, createShellConfirm, type ConfirmRequest } from "@/components/shell/confirm-dialog";
import { ExamplesDialog } from "@/components/shell/examples-dialog";
import { SongTextDialog, type SongTextEditor } from "@/components/shell/song-text-dialog";
import { TransportBand } from "@/components/shell/transport-band";
import { SongMeta } from "@/components/song-meta";
import { useStableCallback } from "@/components/use-stable-callback";
import { useSampleRecorder } from "@/features/audio/sample-recorder";
import { useAudioEngine } from "@/features/audio/use-audio-engine";
import { getSongExampleById, songExamples } from "@/features/song/song-examples";
import { createSongWavBlob, createSongWavFileName } from "@/features/song/song-wav";
import {
  applySampleTrim,
  getTrimmedFrameCount,
  moveSampleTrimWindow,
  removeSampleAsset,
  resizeSampleTrimWindow,
} from "@/features/song/song-samples";

// One overlay at a time. `open` turns false first so the dialog can animate out with its content.
type Overlay = (
  | { kind: "examples" }
  | ({ kind: "song-text" } & SongTextEditor)
  | ({ kind: "arrangement" } & ArrangementEditor)
) & { open: boolean };

type WorkstationShellProps = {
  initialSong?: SongDocument;
};

type ReplaceSongOptions = {
  message: string;
  stopPlaybackAndClearLink?: boolean;
};

function errorMessageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// Song edits phrase their confirmation as "Question? Consequence."; the dialog shows the two apart.
function toConfirmRequest(message: string, confirmLabel: string): ConfirmRequest {
  const [title = message, ...rest] = message.split(/(?<=\?)\s+/u);

  return { title, description: rest.join(" "), confirmLabel };
}

export function WorkstationShell({ initialSong }: WorkstationShellProps) {
  const [song, setSong] = useState(() => initialSong ?? createEmptySongDocument());
  const [sequencerHoverPreviewEnabled, setSequencerHoverPreviewEnabled] = useState(true);
  const [sequencerRulerVisible, setSequencerRulerVisible] = useState(true);
  const [deckSampleId, setDeckSampleId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [confirm] = useState(createShellConfirm);
  const deckSampleIdRef = useRef<string | null>(null);
  const tracks = getOrderedTracks(song);
  deckSampleIdRef.current = deckSampleId;
  const {
    engine,
    engineState,
    errorMessage,
    initializeAudio,
    playbackState,
    playhead,
    startTransport,
    startTransportAtStep,
    stopTransport,
  } = useAudioEngine(song);
  const {
    errorMessage: recorderErrorMessage,
    permissionState: recorderPermissionState,
    recordingDurationMs,
    startRecording,
    status: recorderStatus,
    stopRecording,
  } = useSampleRecorder({
    existingSamples: song.samples,
    onRecordingComplete: ({ asset }) => {
      if (song.samples.length >= SONG_MAX_SAMPLE_COUNT) {
        toast.error("Sample limit reached", { description: "Delete a clip before recording another one." });
        return;
      }

      setSong((currentSong) => {
        const replacedSampleId = deckSampleIdRef.current ?? currentSong.samples.at(-1)?.id ?? null;
        const recordedSong = {
          ...currentSong,
          meta: {
            ...currentSong.meta,
            updatedAt: new Date().toISOString(),
          },
          samples: [...currentSong.samples, asset],
        };

        return replaceSampleTrackSampleReference(recordedSong, replacedSampleId, asset.id);
      });
      setDeckSampleId(asset.id);
    },
  });
  const isPlaying = playbackState === "playing";
  const deckSample =
    (deckSampleId === null ? null : song.samples.find((sample) => sample.id === deckSampleId) ?? null) ??
    song.samples.at(-1) ??
    null;
  const deckSampleDurationMs =
    deckSample === null || deckSample.sampleRate <= 0
      ? 0
      : Math.round((getTrimmedFrameCount(deckSample) / deckSample.sampleRate) * 1000);

  const previewDeckSample = async () => {
    if (deckSample === null) {
      return;
    }

    const readyEngine = engine ?? (await initializeAudio());

    readyEngine?.previewSampleTrigger(deckSample.id, 1, Math.max(1, deckSampleDurationMs));
  };

  const showEditError = (message: string) => {
    toast.error(message);
  };

  // The check runs on the rendered song so the confirm dialog stays out of the state updater; the
  // updater re-applies against the latest song so several edits from one event still compose.
  const applyEdit = (edit: SongEdit, onRejected: (message: string) => void = showEditError): SongEditResult => {
    const editContext = { defaultSampleId: deckSample?.id ?? null };
    const result = applySongEdit(song, edit, editContext);

    if (result.status === "rejected") {
      onRejected(result.message);
      return result;
    }

    if (result.status === "needs-confirmation") {
      const { confirmedEdit } = result;

      void confirm(toConfirmRequest(result.message, "Shorten pattern")).then((confirmed) => {
        if (confirmed) {
          setSong((currentSong) => applySongEdit(currentSong, confirmedEdit, editContext).song);
        }
      });
      return result;
    }

    setSong((currentSong) => applySongEdit(currentSong, edit, editContext).song);
    return result;
  };

  const moveDeckSampleTrimWindow = (startFrame: number) => {
    if (deckSample === null) {
      return;
    }

    setSong((currentSong) => moveSampleTrimWindow(currentSong, deckSample.id, startFrame));
  };

  const resizeDeckSampleTrimWindow = (frameCount: number) => {
    if (deckSample === null) {
      return;
    }

    setSong((currentSong) => resizeSampleTrimWindow(currentSong, deckSample.id, frameCount));
  };

  const applyDeckSampleTrim = () => {
    if (deckSample === null) {
      return;
    }

    setSong((currentSong) => applySampleTrim(currentSong, deckSample.id));
  };

  const selectDeckSample = (sampleId: string) => {
    setDeckSampleId(sampleId);
  };

  const deleteDeckSample = (sampleId: string) => {
    setSong((currentSong) => removeSampleAsset(currentSong, sampleId));
    setDeckSampleId((currentSampleId) => (currentSampleId === sampleId ? null : currentSampleId));
  };

  const updateDeckSampleBaseNote = (baseNote: string) => {
    if (deckSample === null) {
      return;
    }

    setSong((currentSong) => ({
      ...currentSong,
      meta: {
        ...currentSong.meta,
        updatedAt: new Date().toISOString(),
      },
      samples: currentSong.samples.map((sample) =>
        sample.id === deckSample.id
          ? {
              ...sample,
              baseNote,
            }
          : sample,
      ),
    }));
  };

  const closeOverlay = () => {
    setOverlay((current) => (current === null ? null : { ...current, open: false }));
  };

  const clearClosedOverlay = () => {
    setOverlay((current) => (current?.open === true ? current : null));
  };

  const replaceSong = (nextSong: SongDocument, options: ReplaceSongOptions) => {
    if (options.stopPlaybackAndClearLink) {
      stopTransport();
      clearSongShareFromCurrentUrl();
    }

    startTransition(() => {
      setSong(nextSong);
      setDeckSampleId(nextSong.samples.at(-1)?.id ?? null);
    });
    closeOverlay();
    toast.success(options.message);
  };

  const applySharedSongFromCurrentUrl = (reportMissingSong: boolean) => {
    if (typeof window === "undefined") {
      return;
    }

    const result = readSongShareFromHash(window.location.hash);

    if (result.status === "empty") {
      if (reportMissingSong) {
        toast.error("No song in this link", {
          description: "Open a share link someone sent you, or copy one with Copy share link.",
        });
      }

      return;
    }

    if (result.status === "invalid") {
      toast.error("Couldn't load the song from this link", { description: result.error });
      return;
    }

    replaceSong(result.song, { message: "Loaded the song from the link" });
  };

  const startNewSong = async () => {
    const confirmed = await confirm({
      title: "Start a new song?",
      description: "This clears every note, recording and the current song link.",
      confirmLabel: "Start new song",
    });

    if (!confirmed) {
      return;
    }

    replaceSong(createEmptySongDocument(), {
      message: "Started a new song",
      stopPlaybackAndClearLink: true,
    });
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const shareUrl = buildSongShareUrl(window.location.href, song);
      window.history.replaceState(window.history.state, "", shareUrl);

      if (await copyTextToClipboard(shareUrl)) {
        toast.success("Share link copied");
      } else {
        toast("Share link is in the address bar", { description: "Copy it from there to share the song." });
      }
    } catch (error) {
      toast.error("Couldn't create a share link", {
        description: errorMessageOf(error, "The song could not be packed into a link."),
      });
    }
  };

  const downloadWav = async () => {
    try {
      downloadBlobFile(createSongWavBlob(song), createSongWavFileName(song));
      toast.success("WAV download started");
    } catch (error) {
      toast.error("Couldn't export the WAV", {
        description: errorMessageOf(error, "Try again, or shorten the song."),
      });
    }
  };

  const openArrangementEditor = (trackId: TrackId) => {
    setOverlay({
      kind: "arrangement",
      open: true,
      trackId,
      draft: serializeTrackArrangement(song, trackId, "compact"),
      error: null,
      textFormat: "compact",
    });
  };

  const openSongTextEditor = () => {
    setOverlay({ kind: "song-text", open: true, draft: serializeSongShareText(song), error: null });
  };

  const openExamples = () => {
    setOverlay({ kind: "examples", open: true });
  };

  const loadSongExample = (exampleId: string) => {
    const example = getSongExampleById(exampleId);

    if (example === null) {
      toast.error("That example is no longer available");
      return;
    }

    try {
      replaceSong(parseSongShareText(example.dsl), {
        message: `Loaded ${example.name}`,
        stopPlaybackAndClearLink: true,
      });
    } catch (error) {
      toast.error("Couldn't load the example", { description: errorMessageOf(error, "The example text is invalid.") });
    }
  };

  const updateDraft = (draft: string) => {
    setOverlay((current) =>
      current?.kind === "song-text" || current?.kind === "arrangement" ? { ...current, draft, error: null } : current,
    );
  };

  const showDraftError = (error: string) => {
    setOverlay((current) =>
      current?.kind === "song-text" || current?.kind === "arrangement" ? { ...current, error } : current,
    );
  };

  const copySongText = async () => {
    if (overlay?.kind !== "song-text") {
      return;
    }

    if (await copyTextToClipboard(overlay.draft)) {
      toast.success("Song text copied");
    } else {
      toast("Select the text and copy it", { description: "This browser blocked clipboard access." });
    }
  };

  const applySongText = () => {
    if (overlay?.kind !== "song-text") {
      return;
    }

    try {
      replaceSong(parseSongShareText(overlay.draft), { message: "Loaded the song from text" });
    } catch (error) {
      showDraftError(errorMessageOf(error, "The song text could not be read."));
    }
  };

  const updateArrangementTextFormat = (textFormat: ArrangementTextFormat) => {
    setOverlay((current) => {
      if (current?.kind !== "arrangement" || current.textFormat === textFormat) {
        return current;
      }

      return { ...current, textFormat, draft: reformatArrangementDraft(current.draft, textFormat), error: null };
    });
  };

  const applyArrangement = () => {
    if (overlay?.kind !== "arrangement") {
      return;
    }

    const result = applyEdit(
      { type: "replace-arrangement", trackId: overlay.trackId, text: overlay.draft },
      showDraftError,
    );

    if (result.status !== "rejected") {
      closeOverlay();
    }
  };

  useShortcut("space", () => {
    if (isPlaying) {
      stopTransport();
      return;
    }

    void startTransport();
  });

  useEffect(() => {
    setDeckSampleId((currentSampleId) => {
      if (song.samples.length === 0) {
        return null;
      }

      if (currentSampleId !== null && song.samples.some((sample) => sample.id === currentSampleId)) {
        return currentSampleId;
      }

      return song.samples.at(-1)?.id ?? null;
    });
  }, [song.samples]);

  useEffect(() => {
    applySharedSongFromCurrentUrl(false);
  }, []);

  // Stable identities let the memoized panels below skip the re-render every song edit causes here.
  const editSong = useStableCallback(applyEdit);
  const onStartTransport = useStableCallback(startTransport);
  const onStopTransport = useStableCallback(stopTransport);
  const onInitializeAudio = useStableCallback(initializeAudio);
  const onOpenExamples = useStableCallback(openExamples);
  const onOpenSongText = useStableCallback(openSongTextEditor);
  const onDownloadWav = useStableCallback(downloadWav);
  const onCopyShareLink = useStableCallback(copyShareLink);
  const onLoadSongFromLink = useStableCallback(() => {
    applySharedSongFromCurrentUrl(true);
  });
  const onNewSong = useStableCallback(() => {
    void startNewSong();
  });

  return (
    <div className="flex min-h-svh flex-col bg-surface-0 text-ink">
      <a
        href="#sequencer"
        className="sr-only rounded-control bg-surface-2 px-3 py-2 text-sm font-medium text-ink shadow-pop focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to sequencer
      </a>
      <TransportBand
        bpm={song.transport.bpm}
        loopLength={song.transport.loopLength}
        masterVolume={song.mixer.masterVolume}
        oldSpeakerMode={song.mixer.oldSpeakerMode}
        engineState={engineState}
        isPlaying={isPlaying}
        rulerVisible={sequencerRulerVisible}
        hoverPreviewEnabled={sequencerHoverPreviewEnabled}
        onPlay={onStartTransport}
        onStop={onStopTransport}
        onStartAudio={onInitializeAudio}
        onEdit={editSong}
        onRulerVisibleChange={setSequencerRulerVisible}
        onHoverPreviewChange={setSequencerHoverPreviewEnabled}
        onOpenExamples={onOpenExamples}
        onCopyShareLink={onCopyShareLink}
        onLoadSongFromLink={onLoadSongFromLink}
        onOpenSongText={onOpenSongText}
        onDownloadWav={onDownloadWav}
        onNewSong={onNewSong}
      />

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 content-start gap-4 px-4 py-4 md:px-6 md:py-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {errorMessage === null ? null : (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-panel border border-signal bg-surface-1 px-4 py-3 text-sm xl:col-span-2"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal-text" />
            <div>
              <p className="font-semibold">Audio didn't start</p>
              <p className="mt-0.5 text-ink-muted">{errorMessage} Press Start audio to try again.</p>
            </div>
          </div>
        )}

        <section id="sequencer" aria-label="Sequencer" className="min-w-0 scroll-mt-4">
          <SequencerMatrix
            defaultSampleId={deckSample?.id ?? null}
            engine={engine}
            hoverPreviewEnabled={sequencerHoverPreviewEnabled}
            rulerVisible={sequencerRulerVisible}
            onEdit={editSong}
            onOpenArrangementEditor={openArrangementEditor}
            onStartTransportAtStep={startTransportAtStep}
            song={song}
            playbackState={playbackState}
            playhead={playhead}
          />
        </section>

        <aside aria-label="Inspector" className="min-w-0 self-start rounded-panel border border-line bg-surface-1">
          <Tabs defaultValue="samples">
            <TabsList aria-label="Inspector">
              <TabsTab value="samples">Samples</TabsTab>
              <TabsTab value="song">Song</TabsTab>
            </TabsList>
            <TabsPanel value="samples" keepMounted className="p-4">
              <SampleDeck
                engineMode={song.meta.engineMode}
                samples={song.samples}
                sample={deckSample}
                selectedSampleId={deckSample?.id ?? null}
                recorderErrorMessage={recorderErrorMessage}
                recorderPermissionState={recorderPermissionState}
                recorderStatus={recorderStatus}
                recordingDurationMs={recordingDurationMs}
                onDeleteSample={deleteDeckSample}
                onApplyTrim={applyDeckSampleTrim}
                onPreviewSample={previewDeckSample}
                onMoveTrimWindow={moveDeckSampleTrimWindow}
                onResizeTrimWindow={resizeDeckSampleTrimWindow}
                onSetSampleBaseNote={updateDeckSampleBaseNote}
                onSelectSample={selectDeckSample}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
              />
            </TabsPanel>
            <TabsPanel value="song" keepMounted className="p-4">
              <SongMeta
                author={song.meta.author}
                bpm={song.transport.bpm}
                engineMode={song.meta.engineMode}
                engineState={engineState}
                loopLength={song.transport.loopLength}
                name={song.meta.name}
                onEdit={editSong}
                trackCount={tracks.length}
              />
            </TabsPanel>
          </Tabs>
        </aside>
      </main>

      <ExamplesDialog
        examples={songExamples}
        open={overlay?.kind === "examples" && overlay.open}
        onClose={closeOverlay}
        onClosed={clearClosedOverlay}
        onLoadExample={loadSongExample}
      />
      <SongTextDialog
        editor={overlay?.kind === "song-text" ? overlay : null}
        open={overlay?.kind === "song-text" && overlay.open}
        onApply={applySongText}
        onChangeDraft={updateDraft}
        onClose={closeOverlay}
        onClosed={clearClosedOverlay}
        onCopy={copySongText}
      />
      <ArrangementDialog
        editor={overlay?.kind === "arrangement" ? overlay : null}
        engineMode={song.meta.engineMode}
        loopLength={song.transport.loopLength}
        open={overlay?.kind === "arrangement" && overlay.open}
        samples={song.samples}
        onApply={applyArrangement}
        onChangeDraft={updateDraft}
        onChangeTextFormat={updateArrangementTextFormat}
        onClose={closeOverlay}
        onClosed={clearClosedOverlay}
      />
      <ConfirmDialog confirm={confirm} />
    </div>
  );
}
