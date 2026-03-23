import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import {
  useSampleRecorder,
} from "@/features/audio/sample-recorder";
import { useAudioEngine } from "@/features/audio/use-audio-engine";
import {
  createEmptySongDocument,
  getOrderedTracks,
  SONG_MAX_SAMPLE_COUNT,
  type SongDocument,
  type TrackId,
} from "@/features/song/song-document";
import {
  type EngineMode,
} from "@/features/song/pcm-mode";
import {
  buildSongShareUrl,
  parseSongShareText,
  readSongShareFromHash,
  serializeSongShareText,
} from "@/features/song/song-share";
import { getSongExampleById } from "@/features/song/song-examples";
import {
  updateMasterVolume,
  updateOldSpeakerMode,
  updateTrackMute,
  updateTrackVolume,
} from "@/features/song/song-mixer";
import { createSongWavBlob, createSongWavFileName } from "@/features/song/song-wav";
import {
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type SampleStepUpdates,
  type TriggerTrackId,
  isMelodicTrackId,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  parseMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceSampleTrackSampleReference,
  serializeNoiseTrackArrangement,
  serializeSampleTrackArrangement,
  serializeMelodicTrackArrangement,
  updateNoiseTrackStep,
  updateSampleTrackStep,
  updateMelodicTrackStep,
} from "@/features/song/song-pattern";
import {
  applySampleTrim,
  getTrimmedFrameCount,
  moveSampleTrimWindow,
  removeSampleAsset,
  resizeSampleTrimWindow,
} from "@/features/song/song-samples";
import {
  updateSongTransport,
} from "@/features/song/song-transport";

export type ArrangementEditorState = {
  trackId: MelodicTrackId | TriggerTrackId;
  draft: string;
  error: string | null;
};

export type ShareDslEditorState = {
  draft: string;
  error: string | null;
};

export type ShareStatus = {
  tone: "neutral" | "error";
  message: string;
};

export type WorkstationState = ReturnType<typeof useWorkstationState>;

export function useWorkstationState(initialSong?: SongDocument) {
  const [song, setSong] = useState(() => initialSong ?? createEmptySongDocument());
  const [deckSampleId, setDeckSampleId] = useState<string | null>(null);
  const [arrangementEditor, setArrangementEditor] = useState<ArrangementEditorState | null>(null);
  const [shareDslEditor, setShareDslEditor] = useState<ShareDslEditorState | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [showExamplesGlow, setShowExamplesGlow] = useState(false);
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

  const setOldSpeakerMode = (enabled: boolean) => {
    setSong((currentSong) => updateOldSpeakerMode(currentSong, enabled));
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

  const saveArrangementAsWav = async () => {
    if (isExportingWav) {
      return;
    }

    setIsExportingWav(true);

    try {
      const wavBlob = createSongWavBlob(song);
      const fileName = createSongWavFileName(song);
      downloadBlobFile(wavBlob, fileName);
      setShareStatus({
        tone: "neutral",
        message: "WAV download started.",
      });
    } catch (error) {
      setShareStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not export the current arrangement as WAV.",
      });
    } finally {
      setIsExportingWav(false);
    }
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

  const prevAudioReadyRef = useRef(audioReady);

  useEffect(() => {
    if (audioReady && !prevAudioReadyRef.current) {
      const delayTimer = setTimeout(() => {
        setShowExamplesGlow(true);
      }, 200);

      const dismissTimer = setTimeout(() => {
        setShowExamplesGlow(false);
      }, 3200);

      return () => {
        clearTimeout(delayTimer);
        clearTimeout(dismissTimer);
      };
    }

    prevAudioReadyRef.current = audioReady;
  }, [audioReady]);

  useEffect(() => {
    applySharedSongFromCurrentUrl(null);
  }, []);

  const updateBpm = useCallback(
    (nextBpm: number) => {
      setSong((currentSong) => updateSongTransport(currentSong, { bpm: nextBpm }));
    },
    [],
  );

  const updateLoopLength = useCallback(
    (nextLoopLength: number) => {
      setSong((currentSong) => updateSongTransport(currentSong, { loopLength: nextLoopLength }));
    },
    [],
  );

  return {
    // song state
    song,
    tracks,
    deckSample,
    deckSampleDurationMs,

    // audio engine
    engine,
    engineState,
    errorMessage,
    initializeAudio,
    startTransport,
    stopTransport,
    transportState,
    audioReady,
    showAudioGate,
    isPlaying,

    // recorder
    recorderErrorMessage,
    recorderPermissionState,
    recorderStatus,
    recordingDurationMs,
    startRecording,
    stopRecording,

    // arrangement editor
    arrangementEditor,
    openMelodicTrackEditor,
    openTriggerTrackEditor,
    closeMelodicTrackEditor,
    updateArrangementDraft,
    applyArrangement,

    // share DSL editor
    shareDslEditor,
    openShareDslEditor,
    closeShareDslEditor,
    updateShareDslDraft,
    copyShareDsl,
    applyShareDsl,

    // examples
    examplesOpen,
    openExamplesDialog,
    closeExamplesDialog,
    loadSongExample,
    showExamplesGlow,
    setShowExamplesGlow,

    // share status
    shareStatus,
    isExportingWav,

    // actions
    previewDeckSample,
    toggleTrackMute,
    setTrackVolume,
    setMasterSongVolume,
    setOldSpeakerMode,
    updateMelodicStep,
    updateNoiseStep,
    updateSampleStep,
    updateEngineMode,
    updateSongName,
    updateSongAuthor,
    moveDeckSampleTrimWindow,
    resizeDeckSampleTrimWindow,
    applyDeckSampleTrim,
    selectDeckSample,
    deleteDeckSample,
    updateDeckSampleBaseNote,
    resetSong,
    copyShareLink,
    saveArrangementAsWav,
    applySharedSongFromCurrentUrl,
    updateBpm,
    updateLoopLength,
  };
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

function downloadBlobFile(blob: Blob, fileName: string) {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("This browser cannot download WAV files.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
