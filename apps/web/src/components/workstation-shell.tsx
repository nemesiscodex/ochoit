import { Input } from "@ochoit/ui/components/input";
import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { Mic, Pause, Play, Save, Square, Trash2, Upload, Zap } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import { NotePicker } from "@/components/note-picker";
import { labelByTrackId, waveformGlowColorByTrackId, waveformLineColorByTrackId } from "@/components/sequencer-theme";
import { WaveformCanvas } from "@/components/waveform-canvas";
import {
  createWaveformFromPcm,
  useSampleRecorder,
  type SampleRecorderPermissionState,
  type SampleRecorderStatus,
} from "@/features/audio/sample-recorder";
import { useAudioEngine, type AudioBootstrapState } from "@/features/audio/use-audio-engine";
import {
  createEmptySongDocument,
  getOrderedTracks,
  SONG_MAX_SAMPLE_COUNT,
  type SongDocument,
  type TrackId,
} from "@/features/song/song-document";
import {
  type EngineMode,
  formatEngineModeLabel,
  getPcmModeLabel,
  getPcmModeSummary,
  getSampleArrangementHelperCopy,
} from "@/features/song/pcm-mode";
import {
  buildSongShareUrl,
  parseSongShareText,
  readSongShareFromHash,
  serializeSongShareText,
} from "@/features/song/song-share";
import { getSongExampleById, songExamples, type SongExample } from "@/features/song/song-examples";
import {
  TRACK_VOLUME_PERCENT_RANGE,
  toTrackVolumePercent,
  updateMasterVolume,
  updateTrackMute,
  updateTrackVolume,
} from "@/features/song/song-mixer";
import {
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type SampleStepUpdates,
  type TriggerTrackId,
  isMelodicTrackId,
  noiseTriggerPresets,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  parseMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceSampleTrackSampleReference,
  serializeNoiseTrackArrangement,
  serializeSampleTrackArrangement,
  updateNoiseTrackStep,
  updateSampleTrackStep,
  serializeMelodicTrackArrangement,
  updateMelodicTrackStep,
} from "@/features/song/song-pattern";
import {
  applySampleTrim,
  getTrimmedFrameCount,
  getTrimmedSamplePcm,
  moveSampleTrimWindow,
  removeSampleAsset,
  resizeSampleTrimWindow,
} from "@/features/song/song-samples";
import {
  resolveSongBpmInput,
  resolveSongLoopLengthInput,
  SONG_BPM_RANGE,
  SONG_LOOP_LENGTH_RANGE,
  updateSongTransport,
} from "@/features/song/song-transport";

type ArrangementEditorState = {
  trackId: MelodicTrackId | TriggerTrackId;
  draft: string;
  error: string | null;
};

type ShareDslEditorState = {
  draft: string;
  error: string | null;
};

type ShareStatus = {
  tone: "neutral" | "error";
  message: string;
};

type WorkstationShellProps = {
  initialSong?: SongDocument;
};

export function WorkstationShell({ initialSong }: WorkstationShellProps) {
  const [song, setSong] = useState(() => initialSong ?? createEmptySongDocument());
  const [deckSampleId, setDeckSampleId] = useState<string | null>(null);
  const [arrangementEditor, setArrangementEditor] = useState<ArrangementEditorState | null>(null);
  const [shareDslEditor, setShareDslEditor] = useState<ShareDslEditorState | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const deckSampleIdRef = useRef<string | null>(null);
  const tracks = getOrderedTracks(song);
  deckSampleIdRef.current = deckSampleId;
  const { engine, engineState, errorMessage, initializeAudio, startTransport, stopTransport, transportState } =
    useAudioEngine(song);
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
        setShareStatus({
          tone: "error",
          message: `Sample limit reached. Delete a clip before recording another one.`,
        });
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
  const audioReady = engineState === "running" || engineState === "suspended";
  const showAudioGate = !audioReady;
  const isPlaying = transportState.playbackState === "playing";
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

  const toggleTrackMute = (trackId: TrackId) => {
    setSong((currentSong) => updateTrackMute(currentSong, trackId));
  };

  const setTrackVolume = (trackId: TrackId, volume: number) => {
    setSong((currentSong) => updateTrackVolume(currentSong, trackId, volume));
  };

  const setMasterSongVolume = (volume: number) => {
    setSong((currentSong) => updateMasterVolume(currentSong, volume));
  };

  const updateMelodicStep = (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => {
    setSong((currentSong) => updateMelodicTrackStep(currentSong, trackId, stepIndex, updates));
  };

  const updateNoiseStep = (stepIndex: number, updates: NoiseStepUpdates) => {
    setSong((currentSong) => updateNoiseTrackStep(currentSong, stepIndex, updates));
  };

  const updateSampleStep = (stepIndex: number, updates: SampleStepUpdates) => {
    setSong((currentSong) => updateSampleTrackStep(currentSong, stepIndex, updates));
  };

  const updateEngineMode = (engineMode: EngineMode) => {
    setSong((currentSong) => ({
      ...currentSong,
      meta: {
        ...currentSong.meta,
        engineMode,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const updateSongName = (name: string) => {
    setSong((currentSong) => ({
      ...currentSong,
      meta: {
        ...currentSong.meta,
        name: name.slice(0, 80),
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const updateSongAuthor = (author: string) => {
    setSong((currentSong) => ({
      ...currentSong,
      meta: {
        ...currentSong.meta,
        author: author.slice(0, 80),
        updatedAt: new Date().toISOString(),
      },
    }));
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

  const applySharedSongFromCurrentUrl = (emptyMessage: string | null) => {
    if (typeof window === "undefined") {
      return;
    }

    const result = readSongShareFromHash(window.location.hash);

    if (result.status === "empty") {
      if (emptyMessage !== null) {
        setShareStatus({
          tone: "error",
          message: emptyMessage,
        });
      }

      return;
    }

    if (result.status === "invalid") {
      setShareStatus({
        tone: "error",
        message: result.error,
      });
      return;
    }

    startTransition(() => {
      setSong(result.song);
      setArrangementEditor(null);
      setDeckSampleId(result.song.samples.at(-1)?.id ?? null);
    });
    setShareStatus({
      tone: "neutral",
      message: "Loaded shared song from the current link.",
    });
  };

  const clearSongShareFromCurrentUrl = () => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const resetSong = () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Are you sure? This will clear all notes, recordings, and the current song link.",
      );

      if (!confirmed) {
        return;
      }
    }

    stopTransport();
    clearSongShareFromCurrentUrl();

    startTransition(() => {
      setSong(createEmptySongDocument());
      setDeckSampleId(null);
      setArrangementEditor(null);
      setShareDslEditor(null);
    });
    setShareStatus({
      tone: "neutral",
      message: "Cleared the current song and removed the shared link.",
    });
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = buildSongShareUrl(window.location.href, song);
    window.history.replaceState(window.history.state, "", shareUrl);

    const didCopy = await copyTextToClipboard(shareUrl);

    setShareStatus({
      tone: "neutral",
      message: didCopy ? "Share link copied to clipboard." : "Share link is now in the address bar.",
    });
  };

  const openMelodicTrackEditor = (trackId: MelodicTrackId) => {
    setExamplesOpen(false);
    setShareDslEditor(null);
    setArrangementEditor({
      trackId,
      draft: serializeMelodicTrackArrangement(song.tracks[trackId]),
      error: null,
    });
  };

  const openTriggerTrackEditor = (trackId: TriggerTrackId) => {
    setExamplesOpen(false);
    setShareDslEditor(null);
    setArrangementEditor({
      trackId,
      draft:
      trackId === "noise"
          ? serializeNoiseTrackArrangement(song.tracks.noise)
          : serializeSampleTrackArrangement(song.tracks.sample, song.meta.engineMode),
      error: null,
    });
  };

  const closeMelodicTrackEditor = () => {
    setArrangementEditor(null);
  };

  const openShareDslEditor = () => {
    setExamplesOpen(false);
    setArrangementEditor(null);
    setShareDslEditor({
      draft: serializeSongShareText(song),
      error: null,
    });
  };

  const openExamplesDialog = () => {
    setArrangementEditor(null);
    setShareDslEditor(null);
    setExamplesOpen(true);
  };

  const closeExamplesDialog = () => {
    setExamplesOpen(false);
  };

  const loadSongExample = (exampleId: string) => {
    const example = getSongExampleById(exampleId);

    if (example === null) {
      setShareStatus({
        tone: "error",
        message: "That example is no longer available.",
      });
      return;
    }

    try {
      const nextSong = parseSongShareText(example.dsl);

      stopTransport();
      clearSongShareFromCurrentUrl();
      startTransition(() => {
        setSong(nextSong);
        setArrangementEditor(null);
        setShareDslEditor(null);
        setExamplesOpen(false);
        setDeckSampleId(nextSong.samples.at(-1)?.id ?? null);
      });
      setShareStatus({
        tone: "neutral",
        message: `Loaded example: ${example.name}.`,
      });
    } catch (error) {
      setShareStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load the selected example.",
      });
    }
  };

  const closeShareDslEditor = () => {
    setShareDslEditor(null);
  };

  const updateShareDslDraft = (draft: string) => {
    setShareDslEditor((currentEditor) => {
      if (currentEditor === null) {
        return null;
      }

      return {
        draft,
        error: null,
      };
    });
  };

  const copyShareDsl = async () => {
    if (shareDslEditor === null) {
      return;
    }

    const didCopy = await copyTextToClipboard(shareDslEditor.draft);

    setShareStatus({
      tone: "neutral",
      message: didCopy ? "Share DSL copied to clipboard." : "Share DSL is ready to copy.",
    });
  };

  const applyShareDsl = () => {
    if (shareDslEditor === null) {
      return;
    }

    try {
      const nextSong = parseSongShareText(shareDslEditor.draft);

      startTransition(() => {
        setSong(nextSong);
        setArrangementEditor(null);
        setDeckSampleId(nextSong.samples.at(-1)?.id ?? null);
      });
      setShareDslEditor(null);
      setShareStatus({
        tone: "neutral",
        message: "Loaded song from share DSL.",
      });
    } catch (error) {
      setShareDslEditor((currentEditor) => {
        if (currentEditor === null) {
          return null;
        }

        return {
          ...currentEditor,
          error: error instanceof Error ? error.message : "Could not parse the share DSL.",
        };
      });
    }
  };

  const updateArrangementDraft = (draft: string) => {
    setArrangementEditor((currentEditor) => {
      if (currentEditor === null) {
        return null;
      }

      return {
        ...currentEditor,
        draft,
        error: null,
      };
    });
  };

  const applyArrangement = () => {
    if (arrangementEditor === null) {
      return;
    }

    if (arrangementEditor.trackId === "noise") {
      const parsedArrangement = parseNoiseTrackArrangement(arrangementEditor.draft, song.transport.loopLength);

      if (!parsedArrangement.ok) {
        setArrangementEditor((currentEditor) => {
          if (currentEditor === null) {
            return null;
          }

          return {
            ...currentEditor,
            error: parsedArrangement.error,
          };
        });
        return;
      }

      setSong((currentSong) => replaceNoiseTrackArrangement(currentSong, parsedArrangement.entries));
      setArrangementEditor(null);
      return;
    }

    if (arrangementEditor.trackId === "sample") {
      const parsedArrangement = parseSampleTrackArrangement(
        arrangementEditor.draft,
        song.transport.loopLength,
        song.samples,
      );

      if (!parsedArrangement.ok) {
        setArrangementEditor((currentEditor) => {
          if (currentEditor === null) {
            return null;
          }

          return {
            ...currentEditor,
            error: parsedArrangement.error,
          };
        });
        return;
      }

      setSong((currentSong) => replaceSampleTrackArrangement(currentSong, parsedArrangement.entries));
      setArrangementEditor(null);
      return;
    }

    if (!isMelodicTrackId(arrangementEditor.trackId)) {
      return;
    }

    const melodicTrackId = arrangementEditor.trackId;
    const parsedArrangement = parseMelodicTrackArrangement(
      arrangementEditor.draft,
      song.transport.loopLength,
      melodicTrackId,
    );

    if (!parsedArrangement.ok) {
      setArrangementEditor((currentEditor) => {
        if (currentEditor === null) {
          return null;
        }

        return {
          ...currentEditor,
          error: parsedArrangement.error,
        };
      });
      return;
    }

    setSong((currentSong) =>
      replaceMelodicTrackArrangement(currentSong, melodicTrackId, parsedArrangement.entries),
    );
    setArrangementEditor(null);
  };

  useEffect(() => {
    if (arrangementEditor === null && shareDslEditor === null && !examplesOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setArrangementEditor(null);
        setShareDslEditor(null);
        setExamplesOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [arrangementEditor, examplesOpen, shareDslEditor]);

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
    applySharedSongFromCurrentUrl(null);
  }, []);

  return (
    <main className="relative min-h-full overflow-auto bg-[var(--oc-bg)] text-white oc-scanlines">
      {/* Ambient gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-[8%] h-[340px] w-[420px] rounded-full bg-[var(--oc-pulse1)]/[0.04] blur-[100px]" />
        <div className="absolute top-[40px] right-[12%] h-[280px] w-[350px] rounded-full bg-[var(--oc-pulse2)]/[0.04] blur-[100px]" />
        <div className="absolute bottom-[20%] left-[30%] h-[200px] w-[300px] rounded-full bg-[var(--oc-triangle)]/[0.03] blur-[80px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-4 md:px-6 lg:px-8">
        {/* ── Transport + Controls Bar ── */}
        <section className={cn("flex flex-col gap-3", showAudioGate ? "relative z-30" : undefined)}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <TransportStrip
              song={song}
              engineState={engineState}
              startTransport={startTransport}
              stopTransport={stopTransport}
              isPlaying={isPlaying}
              onMasterVolumeChange={setMasterSongVolume}
              onBpmChange={(nextBpm) => {
                setSong((currentSong) => updateSongTransport(currentSong, { bpm: nextBpm }));
              }}
              onLoopLengthChange={(nextLoopLength) => {
                setSong((currentSong) => updateSongTransport(currentSong, { loopLength: nextLoopLength }));
              }}
            />
            <div className="flex items-center gap-2">
              <AudioInitButton
                engineState={engineState}
                audioReady={audioReady}
                initializeAudio={initializeAudio}
                showAudioGate={showAudioGate}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-md border-[var(--oc-noise)]/20 bg-[var(--oc-noise)]/[0.05] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--oc-noise)]/75 hover:bg-[var(--oc-noise)]/12 hover:text-[var(--oc-noise)]"
                aria-label="Clear song"
                onClick={resetSong}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Clear
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-md border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.14em] text-white/60 hover:bg-white/[0.07] hover:text-white"
                aria-label="Open examples"
                onClick={openExamplesDialog}
              >
                Examples
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-md border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.14em] text-white/60 hover:bg-white/[0.07] hover:text-white"
                aria-label="Edit share DSL"
                onClick={openShareDslEditor}
              >
                DSL
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-10 border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white"
                aria-label="Copy share link"
                onClick={() => {
                  void copyShareLink();
                }}
              >
                <Save className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-10 border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white"
                aria-label="Load song from link"
                onClick={() => {
                  applySharedSongFromCurrentUrl("No shared song was found in the current link.");
                }}
              >
                <Upload className="size-4" />
              </Button>
            </div>
          </div>

          {shareStatus !== null ? (
            <div
              className={cn(
                "rounded-md px-3 py-2 font-[var(--oc-mono)] text-xs",
                shareStatus.tone === "error"
                  ? "border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] text-[var(--oc-noise)]"
                  : "border border-[var(--oc-play)]/25 bg-[var(--oc-play)]/10 text-[var(--oc-play)]",
              )}
            >
              {shareStatus.message}
            </div>
          ) : null}

          {errorMessage !== null ? (
            <div className="rounded-md border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] px-3 py-2 font-[var(--oc-mono)] text-xs text-[var(--oc-noise)]">
              {errorMessage}
            </div>
          ) : null}
        </section>

        {/* ── Grid: Sequencer (left) + Sample Deck (right) ── */}
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          {/* Sequencer Matrix */}
          <div className="min-w-0">
            <SequencerMatrix
              defaultSampleId={deckSample?.id ?? null}
              engine={engine}
              onOpenMelodicTrackEditor={openMelodicTrackEditor}
              onOpenTriggerTrackEditor={openTriggerTrackEditor}
              onToggleTrackMute={toggleTrackMute}
              onUpdateTrackVolume={setTrackVolume}
              onUpdateMelodicStep={updateMelodicStep}
              onUpdateNoiseStep={updateNoiseStep}
              onUpdateSampleStep={updateSampleStep}
              song={song}
              playbackState={transportState.playbackState}
              nextStep={transportState.nextStep}
            />
          </div>

          {/* Sample Deck Sidebar */}
          <aside className="flex flex-col gap-3">
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
            <SongMeta
              engineState={engineState}
              onUpdateEngineMode={updateEngineMode}
              onUpdateSongAuthor={updateSongAuthor}
              onUpdateSongName={updateSongName}
              song={song}
              trackCount={tracks.length}
            />
          </aside>
        </section>
      </div>

      {showAudioGate ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 bg-[#04050b]/72 backdrop-blur-[4px] backdrop-saturate-125"
        />
      ) : null}

      {arrangementEditor !== null ? (
        <TrackArrangementEditor
          engineMode={song.meta.engineMode}
          trackId={arrangementEditor.trackId}
          loopLength={song.transport.loopLength}
          draft={arrangementEditor.draft}
          error={arrangementEditor.error}
          samples={song.samples}
          onChangeDraft={updateArrangementDraft}
          onClose={closeMelodicTrackEditor}
          onApply={applyArrangement}
        />
      ) : null}
      {shareDslEditor !== null ? (
        <ShareDslEditor
          draft={shareDslEditor.draft}
          error={shareDslEditor.error}
          onApply={applyShareDsl}
          onChangeDraft={updateShareDslDraft}
          onClose={closeShareDslEditor}
          onCopy={copyShareDsl}
        />
      ) : null}
      {examplesOpen ? (
        <ExamplesDialog examples={songExamples} onClose={closeExamplesDialog} onLoadExample={loadSongExample} />
      ) : null}
    </main>
  );
}

/* ─────────── Transport Strip ─────────── */

function TransportStrip({
  song,
  engineState,
  startTransport,
  stopTransport,
  isPlaying,
  onMasterVolumeChange,
  onBpmChange,
  onLoopLengthChange,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  startTransport: () => Promise<void>;
  stopTransport: () => void;
  isPlaying: boolean;
  onMasterVolumeChange: (value: number) => void;
  onBpmChange: (value: number) => void;
  onLoopLengthChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-2 backdrop-blur">
      {/* Play / Stop */}
      <div className="flex items-center gap-1.5">
        <Button
          className={cn(
            "oc-btn-play h-10 rounded-md px-4 font-[var(--oc-mono)] text-xs font-semibold uppercase tracking-[0.12em]",
            isPlaying
              ? "bg-[var(--oc-play)]/20 text-[var(--oc-play)] hover:bg-[var(--oc-play)]/30"
              : "bg-[var(--oc-play)] text-[#07080e] hover:bg-[var(--oc-play)]/90",
          )}
          onClick={() => {
            void startTransport();
          }}
        >
          {isPlaying ? <Pause className="mr-1.5 size-3.5" /> : <Play className="mr-1.5 size-3.5" />}
          {isPlaying ? "Playing" : "Play"}
        </Button>
        <Button
          variant="outline"
          className="oc-btn-stop h-10 rounded-md border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-xs uppercase tracking-[0.12em] text-white/60 hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
          disabled={!isPlaying}
          onClick={() => {
            stopTransport();
          }}
        >
          <Square className="mr-1.5 size-3.5" />
          Stop
        </Button>
      </div>

      {/* Divider */}
      <div className="mx-1 hidden h-6 w-px bg-white/[0.08] lg:block" />

      {/* BPM */}
      <TransportField
        label="BPM"
        value={song.transport.bpm}
        min={SONG_BPM_RANGE.min}
        max={SONG_BPM_RANGE.max}
        step={1}
        onChange={onBpmChange}
        parseValue={(rawValue) => resolveSongBpmInput(rawValue, song.transport.bpm)}
      />

      {/* Loop Length */}
      <TransportField
        label="Loop"
        value={song.transport.loopLength}
        min={SONG_LOOP_LENGTH_RANGE.min}
        max={SONG_LOOP_LENGTH_RANGE.max}
        step={SONG_LOOP_LENGTH_RANGE.step}
        onChange={onLoopLengthChange}
        parseValue={(rawValue) => resolveSongLoopLengthInput(rawValue, song.transport.loopLength)}
        suffix="st"
      />

      <MasterVolumeField value={song.mixer.masterVolume} onChange={onMasterVolumeChange} />

      {/* Divider */}
      <div className="mx-1 hidden h-6 w-px bg-white/[0.08] lg:block" />

      {/* Status chips */}
      <div className="flex items-center gap-2">
        <StatusChip label="Audio" value={engineState} />
        <StatusChip label="Playback" value={isPlaying ? "playing" : "stopped"} />
      </div>
    </div>
  );
}

function MasterVolumeField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const percentValue = toTrackVolumePercent(value);

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-1.5">
      <label
        htmlFor="transport-master-volume"
        className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/40"
      >
        Master
      </label>
      <input
        id="transport-master-volume"
        aria-label="Global Volume"
        type="range"
        min={TRACK_VOLUME_PERCENT_RANGE.min}
        max={TRACK_VOLUME_PERCENT_RANGE.max}
        step={TRACK_VOLUME_PERCENT_RANGE.step}
        value={percentValue}
        className="h-2 w-20 cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-[var(--oc-play)]"
        onChange={(event) => {
          onChange(Number(event.currentTarget.value) / 100);
        }}
      />
      <span className="w-9 text-right font-[var(--oc-mono)] text-[9px] uppercase text-white/35">{percentValue}%</span>
    </div>
  );
}

/* ─────────── Transport Field ─────────── */

function TransportField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  parseValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  parseValue: (rawValue: string) => number;
}) {
  const inputId = `transport-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-1.5">
      <label
        htmlFor={inputId}
        className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/40"
      >
        {label}
      </label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label === "Loop" ? "Loop Length" : label}
        className="h-7 w-14 border-0 bg-transparent px-0 text-center font-[var(--oc-mono)] text-sm font-semibold text-white focus-visible:ring-0"
        onChange={(event) => {
          onChange(parseValue(event.currentTarget.value));
        }}
      />
      {suffix ? (
        <span className="font-[var(--oc-mono)] text-[9px] uppercase text-white/30">{suffix}</span>
      ) : null}
    </div>
  );
}

/* ─────────── Audio Init Button ─────────── */

function AudioInitButton({
  engineState,
  audioReady,
  initializeAudio,
  showAudioGate,
}: {
  engineState: AudioBootstrapState;
  audioReady: boolean;
  initializeAudio: () => Promise<unknown>;
  showAudioGate: boolean;
}) {
  const promptId = "audio-init-prompt";
  const showRetryCopy = engineState === "error";

  return (
    <div className="relative flex items-center">
      <Button
        aria-describedby={showAudioGate ? promptId : undefined}
        className={cn(
          "h-10 rounded-md px-4 font-[var(--oc-mono)] text-xs font-semibold uppercase tracking-[0.1em] transition-all",
          audioReady
            ? "bg-[var(--oc-accent)]/15 text-[var(--oc-accent)] hover:bg-[var(--oc-accent)]/25"
            : "bg-[var(--oc-accent)] text-white hover:bg-[var(--oc-accent)]/90",
          showAudioGate
            ? "oc-audio-init-hotspot h-12 rounded-lg border border-[var(--oc-accent)]/70 px-5 text-sm shadow-[0_0_0_1px_rgba(167,139,250,0.25),0_18px_40px_rgba(10,10,18,0.55)]"
            : undefined,
        )}
        onClick={() => {
          void initializeAudio();
        }}
      >
        <Zap className={cn("mr-1.5 size-3.5", showAudioGate ? "size-4" : undefined)} />
        {engineState === "initializing" ? "Booting…" : audioReady ? "Audio On" : "Start Audio"}
      </Button>

      {showAudioGate ? (
        <div
          id={promptId}
          className="oc-audio-gate absolute top-full right-0 mt-3 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(9,11,18,0.98))] p-4 shadow-[0_28px_80px_rgba(3,4,10,0.65)]"
        >
          <div className="absolute top-0 right-8 h-4 w-4 -translate-y-1/2 rotate-45 border-t border-l border-white/10 bg-[var(--oc-surface-raised)]" />
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full border border-[var(--oc-accent)]/35 bg-[var(--oc-accent)]/12 px-2 py-1 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-accent)]">
              First step
            </span>
            <span className="font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.18em] text-white/30">
              Browser audio unlock
            </span>
          </div>
          <p className="font-[var(--oc-display)] text-xl leading-tight text-white">
            Click <span className="text-[var(--oc-accent)]">Start Audio</span> before using the sequencer.
          </p>
          <p className="mt-2 max-w-[32ch] font-[var(--oc-mono)] text-[11px] leading-5 text-white/55">
            Your browser blocks sound until you interact once. This unlocks playback, sample preview, and recording.
          </p>
          {showRetryCopy ? (
            <p className="mt-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--oc-noise)]">
              Audio did not start. Click again to retry.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────── Status Chip ─────────── */

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
      <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</span>
      <span className="font-[var(--oc-mono)] text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">
        {value}
      </span>
    </div>
  );
}

/* ─────────── Sample Deck ─────────── */

function SampleDeck({
  engineMode,
  samples,
  sample,
  selectedSampleId,
  recorderErrorMessage,
  recorderPermissionState,
  recorderStatus,
  recordingDurationMs,
  onDeleteSample,
  onApplyTrim,
  onPreviewSample,
  onMoveTrimWindow,
  onResizeTrimWindow,
  onSetSampleBaseNote,
  onSelectSample,
  onStartRecording,
  onStopRecording,
}: {
  engineMode: SongDocument["meta"]["engineMode"];
  samples: SongDocument["samples"];
  sample: SongDocument["samples"][number] | null;
  selectedSampleId: string | null;
  recorderErrorMessage: string | null;
  recorderPermissionState: SampleRecorderPermissionState;
  recorderStatus: SampleRecorderStatus;
  recordingDurationMs: number;
  onDeleteSample: (sampleId: string) => void;
  onApplyTrim: () => void;
  onPreviewSample: () => Promise<void>;
  onMoveTrimWindow: (startFrame: number) => void;
  onResizeTrimWindow: (frameCount: number) => void;
  onSetSampleBaseNote: (baseNote: string) => void;
  onSelectSample: (sampleId: string) => void;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
}) {
  const isRecording = recorderStatus === "recording";
  const isBusy = recorderStatus === "requesting-permission" || recorderStatus === "processing";
  const sampleLimitReached = samples.length >= SONG_MAX_SAMPLE_COUNT;
  const trimmedPcm = sample === null ? [] : getTrimmedSamplePcm(sample);
  const waveform = createWaveformFromPcm(trimmedPcm);
  const trimmedFrameCount = sample === null ? 0 : getTrimmedFrameCount(sample);
  const trimWindowMaxStart = sample === null ? 0 : Math.max(0, sample.frameCount - trimmedFrameCount);
  const hasPendingTrim = sample !== null && (sample.trim.startFrame > 0 || sample.trim.endFrame < sample.frameCount);
  const sampleDurationMs =
    sample === null || sample.sampleRate <= 0 ? 0 : Math.round((trimmedFrameCount / sample.sampleRate) * 1000);
  const statusLabel =
    recorderStatus === "recording"
      ? `Recording ${formatSampleDurationLabel(recordingDurationMs)}`
      : recorderStatus === "processing"
        ? "Rendering clip"
        : recorderStatus === "requesting-permission"
          ? "Requesting microphone access"
          : recorderStatus === "error"
            ? recorderErrorMessage ?? "Recorder error"
            : sampleLimitReached
              ? `Clip limit reached (${samples.length}/${SONG_MAX_SAMPLE_COUNT})`
            : sample === null
              ? "Ready to capture"
              : `Latest clip ${formatSampleDurationLabel(sampleDurationMs)}`;
  const permissionLabel = getPermissionLabel(recorderPermissionState);

  return (
    <div className="rounded-lg border border-[var(--oc-sample)]/20 bg-[var(--oc-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-sample)]">
          Sample Deck
        </h2>
        <Mic className="size-4 text-[var(--oc-sample)]/60" />
      </div>

      <p className="mb-3 font-[var(--oc-mono)] text-[10px] text-white/35">
        Capture up to 2s from the microphone. Store up to {SONG_MAX_SAMPLE_COUNT} clips, then trim and swap
        between them from the deck.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-8 rounded-md bg-[var(--oc-sample)] font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#07080e] hover:bg-[var(--oc-sample)]/85"
          disabled={recorderPermissionState === "unsupported" || isBusy || (!isRecording && sampleLimitReached)}
          onClick={() => {
            if (isRecording) {
              onStopRecording();
              return;
            }

            void onStartRecording();
          }}
        >
          {isRecording ? <Square className="mr-1.5 size-3" /> : <Mic className="mr-1.5 size-3" />}
          {isRecording ? "Stop" : recorderStatus === "requesting-permission" ? "Allow Mic" : "Record"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.07] hover:text-white"
          disabled={sample === null || isBusy || isRecording}
          onClick={() => {
            void onPreviewSample();
          }}
        >
          Preview
        </Button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]">
        <div className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2 text-white/45">
          <span className="block text-white/25">Mic</span>
          <span className="mt-1 block text-white/65">{permissionLabel}</span>
        </div>
        <div className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2 text-white/45">
          <span className="block text-white/25">Recorder</span>
          <span className="mt-1 block text-white/65">{statusLabel}</span>
        </div>
      </div>
      {sampleLimitReached ? (
        <div className="mb-3 rounded-md border border-[var(--oc-noise)]/25 bg-[var(--oc-noise)]/[0.06] px-2.5 py-2 font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-noise)]">
          Delete a clip before recording another one. Share links also cap embedded samples at {SONG_MAX_SAMPLE_COUNT}.
        </div>
      ) : null}

      <div className="rounded-md border border-white/[0.06] bg-black/25 p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-white/35">
          <span>Trim</span>
          <span>{sample?.name ?? "No Sample"}</span>
        </div>
        <div className="oc-waveform-wrap rounded-sm">
          <WaveformCanvas
            ariaLabel="PCM trim preview waveform"
            samples={waveform}
            className="h-12 w-full"
            backgroundColor="rgba(7, 8, 14, 0.9)"
            glowColor={waveformGlowColorByTrackId.sample}
            lineColor={waveformLineColorByTrackId.sample}
          />
        </div>
        <div className="mt-3 grid gap-3">
          <SampleTrimControl
            disabled={sample === null || isRecording}
            label="Window"
            labelId="sample-trim-window"
            max={trimWindowMaxStart}
            onChange={onMoveTrimWindow}
            value={sample?.trim.startFrame ?? 0}
          />
          <SampleTrimControl
            disabled={sample === null || isRecording}
            label="Length"
            labelId="sample-trim-length"
            max={sample?.frameCount ?? 0}
            min={0}
            onChange={onResizeTrimWindow}
            value={trimmedFrameCount}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/60 hover:bg-white/[0.07] hover:text-white"
            disabled={!hasPendingTrim || isRecording || isBusy}
            onClick={onApplyTrim}
          >
            Apply Trim
          </Button>
        </div>
        <div className="mt-3 grid gap-2 rounded-md border border-white/[0.06] bg-black/20 p-2.5">
          <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/38">
            <span>Pitch Map</span>
            <span>{engineMode === "inspired" ? "Chromatic" : "Trigger"}</span>
          </div>
          {sample === null ? (
            <div className="font-[var(--oc-mono)] text-[10px] text-white/32">Load a sample to assign its base note.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[7rem]">
                  <NotePicker
                    accentColor={waveformLineColorByTrackId.sample}
                    ariaLabel="Sample base note"
                    disabled={isRecording}
                    selectedNote={sample.baseNote}
                    onSelectNote={(note) => {
                      onSetSampleBaseNote(note);
                    }}
                  />
                </div>
                <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/36">
                  Base note
                </span>
                {sample.detectedBaseNote !== null ? (
                  <button
                    type="button"
                    className="rounded-sm border border-[var(--oc-sample)]/20 bg-[var(--oc-sample)]/10 px-2 py-1 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-sample)] transition hover:bg-[var(--oc-sample)]/18"
                    onClick={() => {
                      onSetSampleBaseNote(sample.detectedBaseNote ?? sample.baseNote);
                    }}
                  >
                    Suggested {sample.detectedBaseNote}
                  </button>
                ) : (
                  <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/28">
                    No stable note detected
                  </span>
                )}
              </div>
              <p className="font-[var(--oc-mono)] text-[10px] leading-5 text-white/40">
                Inspired mode transposes from this base note. Authentic mode still plays the clip as a one-shot trigger.
              </p>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/35">
          <span>
            {sample === null
              ? "No clip loaded"
              : `${sample.trim.startFrame}-${sample.trim.endFrame} · ${trimmedFrameCount} / ${sample.frameCount} fr`}
          </span>
          <span>{sample === null ? "0.00s" : formatSampleDurationLabel(sampleDurationMs)}</span>
        </div>
      </div>

      <div className="rounded-md border border-white/[0.06] bg-black/25 p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-white/35">
          <span>Recorded Clips</span>
          <span>{samples.length}</span>
        </div>
        <div className="grid gap-2">
          {samples.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/[0.08] bg-black/20 px-3 py-4 text-center font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-white/28">
              Record something to build your PCM clip list.
            </div>
          ) : (
            [...samples].reverse().map((entry) => {
              const waveform = createWaveformFromPcm(getTrimmedSamplePcm(entry), 48);
              const isSelected = entry.id === selectedSampleId;
              const trimmedDurationMs =
                entry.sampleRate <= 0 ? 0 : Math.round((getTrimmedFrameCount(entry) / entry.sampleRate) * 1000);

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border p-2 transition-colors",
                    isSelected
                      ? "border-[var(--oc-sample)]/50 bg-[var(--oc-sample)]/10"
                      : "border-white/[0.06] bg-black/20",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Load sample ${entry.name}`}
                    className="min-w-0 text-left"
                    onClick={() => {
                      onSelectSample(entry.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        {entry.name}
                      </span>
                      {isSelected ? (
                        <span className="rounded-sm bg-[var(--oc-sample)]/18 px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-sample)]">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/34">
                      {entry.id} · {formatSampleDurationLabel(trimmedDurationMs)}
                    </div>
                    <div className="mt-2 rounded-sm border border-white/[0.05] bg-[#07080e]/80">
                      <WaveformCanvas
                        ariaLabel={`${entry.name} waveform`}
                        samples={waveform}
                        className="h-8 w-full"
                        backgroundColor="rgba(7, 8, 14, 0.82)"
                        glowColor={waveformGlowColorByTrackId.sample}
                        lineColor={waveformLineColorByTrackId.sample}
                      />
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Delete sample ${entry.name}`}
                    className="size-8 self-start border-white/[0.08] bg-white/[0.03] text-white/45 hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
                    onClick={() => {
                      onDeleteSample(entry.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function SampleTrimControl({
  disabled,
  label,
  labelId,
  max,
  min = 0,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  labelId: string;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/38">
        <label htmlFor={labelId}>{label}</label>
        <span>{value} fr</span>
      </div>
      <input
        id={labelId}
        aria-label={`Sample trim ${label.toLowerCase()}`}
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.max(min, Math.min(value, max))}
        disabled={disabled}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-[var(--oc-sample)] disabled:cursor-not-allowed disabled:opacity-40"
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
      <Input
        aria-label={`Sample trim ${label.toLowerCase()} frame`}
        type="number"
        min={min}
        max={max}
        step={1}
        value={Math.max(min, Math.min(value, max))}
        disabled={disabled}
        className="h-7 border-white/[0.08] bg-black/30 px-2 font-[var(--oc-mono)] text-[10px] text-white"
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

function getPermissionLabel(permissionState: SampleRecorderPermissionState) {
  switch (permissionState) {
    case "granted":
      return "Granted";
    case "denied":
      return "Blocked";
    case "unsupported":
      return "Unsupported";
    default:
      return "Not asked";
  }
}

function formatSampleDurationLabel(durationMs: number) {
  return `${(Math.max(0, durationMs) / 1000).toFixed(2)}s`;
}

async function copyTextToClipboard(value: string) {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    return false;
  }
}

/* ─────────── Song Metadata ─────────── */

function SongMeta({
  song,
  engineState,
  onUpdateEngineMode,
  onUpdateSongAuthor,
  onUpdateSongName,
  trackCount,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  onUpdateEngineMode: (engineMode: EngineMode) => void;
  onUpdateSongAuthor: (author: string) => void;
  onUpdateSongName: (name: string) => void;
  trackCount: number;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-4">
      <h2 className="mb-3 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
        Song Info
      </h2>
      <div className="mb-3 grid gap-1.5">
        <label
          htmlFor="song-name"
          className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35"
        >
          Song Name
        </label>
        <Input
          id="song-name"
          aria-label="Song Name"
          maxLength={80}
          value={song.meta.name}
          className="h-8 border-white/[0.08] bg-black/30 px-2.5 font-[var(--oc-mono)] text-[11px] text-white placeholder:text-white/20"
          onChange={(event) => {
            onUpdateSongName(event.currentTarget.value);
          }}
        />
      </div>
      <div className="mb-3 grid gap-1.5">
        <label
          htmlFor="song-author"
          className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35"
        >
          Author
        </label>
        <Input
          id="song-author"
          aria-label="Author"
          maxLength={80}
          value={song.meta.author}
          className="h-8 border-white/[0.08] bg-black/30 px-2.5 font-[var(--oc-mono)] text-[11px] text-white placeholder:text-white/20"
          onChange={(event) => {
            onUpdateSongAuthor(event.currentTarget.value);
          }}
        />
      </div>
      <div className="grid gap-2 font-[var(--oc-mono)] text-[10px]">
        <MetaRow label="Author" value={song.meta.author} />
        <MetaRow label="Mode" value={formatEngineModeLabel(song.meta.engineMode)} />
        <MetaRow label="Tempo" value={`${song.transport.bpm} bpm`} />
        <MetaRow label="Loop" value={`${song.transport.loopLength} steps`} />
        <MetaRow label="Voices" value={`${trackCount}`} />
        <MetaRow label="Audio" value={engineState} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["authentic", "inspired"] as const).map((engineMode) => {
          const isSelected = song.meta.engineMode === engineMode;

          return (
            <Button
              key={engineMode}
              type="button"
              variant="outline"
              aria-pressed={isSelected}
              className={cn(
                "h-8 rounded-md border font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.16em] transition-all",
                isSelected
                  ? "border-[var(--oc-accent)]/45 bg-[var(--oc-accent)]/12 text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white",
              )}
              onClick={() => {
                onUpdateEngineMode(engineMode);
              }}
            >
              {formatEngineModeLabel(engineMode)}
            </Button>
          );
        })}
      </div>
      <div
        aria-label="PCM mode summary"
        className="mt-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 font-[var(--oc-mono)]"
      >
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
          {getPcmModeLabel(song.meta.engineMode)}
        </div>
        <p className="mt-1 text-[10px] leading-5 text-white/55">{getPcmModeSummary(song.meta.engineMode)}</p>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5 last:border-0 last:pb-0">
      <span className="uppercase tracking-[0.18em] text-white/30">{label}</span>
      <span className="font-medium text-white/70">{value}</span>
    </div>
  );
}

function ShareDslEditor({
  draft,
  error,
  onApply,
  onChangeDraft,
  onClose,
  onCopy,
}: {
  draft: string;
  error: string | null;
  onApply: () => void;
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onCopy: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/72 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-xl border border-white/[0.08] bg-[var(--oc-surface)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--oc-mono)] text-sm font-semibold uppercase tracking-[0.18em] text-white">
              Share DSL
            </h2>
            <p className="mt-2 max-w-3xl font-[var(--oc-mono)] text-[10px] leading-5 text-white/45">
              Full compact song DSL for share links. Copy it as plain text or paste an edited DSL and apply it to replace the current song.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/60 hover:bg-white/[0.07] hover:text-white"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/30 p-3">
          <label
            htmlFor="share-dsl-textarea"
            className="mb-2 block font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-white/35"
          >
            Share DSL Text
          </label>
          <textarea
            id="share-dsl-textarea"
            aria-label="Share DSL text"
            value={draft}
            spellCheck={false}
            className="h-[360px] w-full resize-none rounded-md border border-white/[0.08] bg-[#07080e] px-3 py-3 font-[var(--oc-mono)] text-[11px] leading-6 text-white outline-none focus:border-[var(--oc-accent)]/45"
            onChange={(event) => {
              onChangeDraft(event.currentTarget.value);
            }}
          />
        </div>

        {error !== null ? (
          <div className="mt-4 rounded-md border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] px-3 py-2 font-[var(--oc-mono)] text-xs text-[var(--oc-noise)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/60 hover:bg-white/[0.07] hover:text-white"
            onClick={() => {
              void onCopy();
            }}
          >
            Copy DSL
          </Button>
          <Button
            type="button"
            className="bg-[var(--oc-accent)] px-4 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-white hover:bg-[var(--oc-accent)]/85"
            onClick={onApply}
          >
            Apply DSL
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExamplesDialog({
  examples,
  onClose,
  onLoadExample,
}: {
  examples: readonly SongExample[];
  onClose: () => void;
  onLoadExample: (exampleId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/72 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-white/[0.08] bg-[var(--oc-surface)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--oc-mono)] text-sm font-semibold uppercase tracking-[0.18em] text-white">
              Examples
            </h2>
            <p className="mt-2 max-w-2xl font-[var(--oc-mono)] text-[10px] leading-5 text-white/45">
              Load a built-in song into the editor. This replaces the current song and clears any stale share hash
              until you copy a new link.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/60 hover:bg-white/[0.07] hover:text-white"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          {examples.map((example) => (
            <div
              key={example.id}
              className="rounded-lg border border-white/[0.08] bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.18em] text-white/35">
                    Built-in Example
                  </div>
                  <h3 className="mt-1 font-[var(--oc-display)] text-2xl leading-none text-white">{example.name}</h3>
                  <div className="mt-2 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--oc-accent)]">
                    by {example.author}
                  </div>
                  <p className="mt-3 max-w-[58ch] font-[var(--oc-mono)] text-[10px] leading-5 text-white/50">
                    {example.summary}
                  </p>
                </div>
                <Button
                  type="button"
                  className="shrink-0 bg-[var(--oc-accent)] px-4 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-white hover:bg-[var(--oc-accent)]/85"
                  aria-label={`Load example ${example.name}`}
                  onClick={() => {
                    onLoadExample(example.id);
                  }}
                >
                  Load Example
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackArrangementEditor({
  engineMode,
  trackId,
  loopLength,
  draft,
  error,
  samples,
  onChangeDraft,
  onClose,
  onApply,
}: {
  engineMode: SongDocument["meta"]["engineMode"];
  trackId: MelodicTrackId | TriggerTrackId;
  loopLength: number;
  draft: string;
  error: string | null;
  samples: SongDocument["samples"];
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const trackLabel = labelByTrackId[trackId];
  const accentColor = waveformLineColorByTrackId[trackId];
  const helperCopy =
    trackId === "noise"
      ? `One trigger per line in the format 1: short P3 or 1: long P12. Preset aliases (${noiseTriggerPresets.map((preset) => preset.id).join(", ")}) are also accepted on paste. Steps above ${loopLength} are ignored when you apply.`
      : trackId === "sample"
        ? getSampleArrangementHelperCopy(engineMode, loopLength, samples[0]?.id ?? "mic-001")
        : trackId === "pulse1" || trackId === "pulse2"
          ? `One pulse note per line in the format 1: E4 @25% or 1-4: E4 @12.5% for sustained notes. The duty suffix is optional and defaults to 50%. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`
          : `One note per line in the format 1: E4 or 1-4: E4 for sustained notes. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`;
  const editorTitle =
    trackId === "noise" ? "Noise Trigger Map" : trackId === "sample" ? "PCM Trigger Map" : "Voice Arrangement";
  const labelSuffix =
    trackId === "noise" ? "trigger text" : trackId === "sample" ? "trigger text" : "arrangement text";

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close arrangement editor"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#090b14] p-5 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
              {editorTitle}
            </p>
            <h2
              className="mt-1 font-[var(--oc-mono)] text-lg font-bold uppercase tracking-[0.1em]"
              style={{ color: accentColor }}
            >
              {trackLabel}
            </h2>
            <p className="mt-2 max-w-xl font-[var(--oc-mono)] text-[10px] leading-5 text-white/50">
              {helperCopy}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-md border border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <label
          htmlFor={`arrangement-${trackId}`}
          className="mb-2 block font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.2em] text-white/40"
        >
          {trackLabel} {trackId === "noise" || trackId === "sample" ? "Trigger Text" : "Arrangement Text"}
        </label>
        <textarea
          id={`arrangement-${trackId}`}
          aria-label={`${trackLabel} ${labelSuffix}`}
          value={draft}
          autoFocus
          spellCheck={false}
          className="min-h-[360px] w-full rounded-xl border border-white/[0.08] bg-black/35 px-4 py-3 font-[var(--oc-mono)] text-sm leading-6 text-white outline-none transition focus:border-white/20"
          onChange={(event) => {
            onChangeDraft(event.currentTarget.value);
          }}
        />

        {error !== null ? (
          <div className="mt-3 rounded-lg border border-[var(--oc-noise)]/35 bg-[var(--oc-noise)]/[0.08] px-3 py-2 font-[var(--oc-mono)] text-[10px] text-[var(--oc-noise)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[#07080e]"
            style={{ backgroundColor: accentColor }}
            onClick={onApply}
          >
            Apply Arrangement
          </Button>
        </div>
      </div>
    </div>
  );
}
