import { Button } from "@ochoit/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ochoit/ui/components/tooltip";
import { cn } from "@ochoit/ui/lib/utils";
import { Circle, Volume2, VolumeX } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  getFrequencyForNote,
  getOrderedTracks,
  type MelodicStepState,
  type MelodicTrackId,
  type NoteValue,
  type SongDocument,
  type SongEdit,
  type Track,
  type TrackId,
  getDefaultSampleTrigger,
  getMelodicArrangementEntries,
  getMelodicStepState,
  getNoiseTriggerPresetForStep,
  canUpdateSongStepsPerBeat,
  SONG_BEAT_GRID_STEPS_PER_BEAT,
  SONG_EIGHTH_GRID_STEPS_PER_BEAT,
  SONG_LOOP_LENGTH_RANGE,
} from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";

import type { PlayheadStore } from "@/features/audio/playhead-store";
import { usePlayheadSelector } from "@/features/audio/use-playhead-selector";
import { previewWaveformByTrackId } from "@/features/audio/waveform-data";
import {
  advanceRecording,
  isRecordTarget,
  pressRecordingKey,
  releaseRecordingKey,
  startRecording,
  type QuantizedRecording,
  type RecordTrackId,
} from "@/features/sequencer/quantized-recorder";
import {
  getSequencerKeyCommand,
  keyboardModeShortcutKey,
  type SequencerKeyCommand,
} from "@/features/sequencer/sequencer-keys";
import { copySteps, pasteSteps, type StepClipboard } from "@/features/sequencer/step-clipboard";
import {
  finishDrag,
  startMoveDrag,
  startResizeDrag,
  updateDrag,
  type GridMetrics,
  type StepDrag,
} from "@/features/sequencer/step-drag";
import { clickStep, grabStep, moveSelection, type StepSelection } from "@/features/sequencer/step-selection";
import {
  buildKeyboardNoteBindings,
  clampKeyboardBaseOctave,
  getKeyboardBaseOctaveForNote,
  normalizeKeyboardNoteKey,
} from "@/features/song/song-keyboard-input";
import { TRACK_VOLUME_PERCENT_RANGE, toTrackVolumePercent } from "@/features/song/song-mixer";

import {
  accentByTrackId,
  labelByTrackId,
  shortLabelByTrackId,
  voiceColorByTrackId,
  waveformGlowColorByTrackId,
  waveformLineColorByTrackId,
} from "@/components/sequencer-theme";
import { StepDetailPanel } from "@/components/step-detail-panel";
import { useStableCallback } from "@/components/use-stable-callback";
import { TrackWaveformCanvas } from "@/components/waveform-canvas";

type KeyboardNoteTarget =
  | {
      trackId: MelodicTrackId;
      stepIndex: number;
      note: NoteValue;
      enabled: boolean;
      kind: "melodic";
      label: string;
    }
  | {
      trackId: "sample";
      stepIndex: number;
      note: NoteValue;
      enabled: boolean;
      kind: "sample";
      label: string;
      sampleId: string | null;
    };

/** What a sequencer row asks the matrix to do; rows get one stable dispatcher so they can stay memoized. */
type RowAction =
  | { type: "preview-step"; trackId: TrackId; stepIndex: number }
  | { type: "select-step"; trackId: TrackId; stepIndex: number; shiftKey: boolean }
  | { type: "deselect" }
  | { type: "start-move"; trackId: TrackId; stepIndex: number; metrics: GridMetrics; shiftKey: boolean }
  | { type: "start-resize"; trackId: TrackId; stepIndex: number; edge: "left" | "right"; metrics: GridMetrics }
  | { type: "move-drag"; clientX: number; clientY: number }
  | { type: "end-drag" }
  | { type: "toggle-recording"; trackId: RecordTrackId };

type DragPreview = "valid" | "invalid" | null;

const noSelectedSteps: readonly number[] = [];
const noSelectedStepIndexSet: ReadonlySet<number> = new Set();
const gridCellChunkSize = 16;
const fallbackStepWidthPx = 40;
const fallbackStepHeightPx = 48;
const fallbackStepGapPx = 4;
const mediumViewportQuery = "(min-width: 768px)";
const keyboardBaseOctaveMin = 0;
const keyboardBaseOctaveMax = 8;

function getStepDurationMs(song: SongDocument) {
  return (60_000 / song.transport.bpm) / song.transport.stepsPerBeat;
}

function isKeyboardTargetEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function SequencerMatrix({
  defaultSampleId,
  engine,
  hoverPreviewEnabled = true,
  rulerVisible = true,
  song,
  playbackState,
  playhead,
  onEdit,
  onOpenArrangementEditor,
  onStartTransportAtStep,
}: {
  defaultSampleId: string | null;
  engine: AudioEngine | null;
  hoverPreviewEnabled?: boolean;
  rulerVisible?: boolean;
  song: SongDocument;
  playbackState: "stopped" | "playing";
  playhead: PlayheadStore;
  onEdit: (edit: SongEdit) => void;
  onOpenArrangementEditor: (trackId: TrackId) => void;
  onStartTransportAtStep: (step: number) => Promise<void>;
}) {
  const [selection, setSelection] = useState<StepSelection | null>(null);
  const [clipboard, setClipboard] = useState<StepClipboard | null>(null);
  const [drag, setDragState] = useState<StepDrag | null>(null);
  const [keyboardModeEnabled, setKeyboardModeEnabled] = useState(false);
  const [keyboardBaseOctave, setKeyboardBaseOctave] = useState(3);
  const [activeKeyboardKey, setActiveKeyboardKey] = useState<string | null>(null);
  const [recordingTrackId, setRecordingTrackId] = useState<RecordTrackId | null>(null);
  const suppressClickRef = useRef(false);
  const keyboardKeyResetTimeoutRef = useRef<number | null>(null);
  // Pointer and key events can arrive between renders, so drag and recording state live in refs.
  const dragRef = useRef<StepDrag | null>(null);
  const recordingRef = useRef<QuantizedRecording | null>(null);
  const sustainedPreviewStopsRef = useRef(new Map<string, () => void>());
  const tracks = getOrderedTracks(song);
  const isPlaying = playbackState === "playing";
  const stepDurationMs = getStepDurationMs(song);

  const keyboardNoteTarget = getKeyboardNoteTarget(song, selection);
  const keyboardBindings = useMemo(() => buildKeyboardNoteBindings(keyboardBaseOctave), [keyboardBaseOctave]);

  const setDrag = (nextDrag: StepDrag | null) => {
    dragRef.current = nextDrag;
    setDragState(nextDrag);
  };

  const setRecording = (nextRecording: QuantizedRecording | null) => {
    recordingRef.current = nextRecording;
    setRecordingTrackId(nextRecording?.trackId ?? null);
  };

  const previewKeyboardInputNote = (target: KeyboardNoteTarget, note: NoteValue) => {
    if (engine === null) {
      return;
    }

    const stepDurationMs = getStepDurationMs(song);

    if (target.kind === "melodic") {
      const track = song.tracks[target.trackId];
      const step = track.steps[target.stepIndex];
      const previewDurationMs = stepDurationMs * Math.max(step?.length ?? 1, 1);
      const previewDuty = track.kind === "pulse" ? track.steps[target.stepIndex]?.duty ?? 0.5 : 0.5;

      engine.previewNote(
        target.trackId,
        note,
        previewDurationMs,
        previewDuty,
        step?.volume ?? track.volume,
      );
      return;
    }

    const sampleId = target.sampleId ?? getDefaultSampleTrigger(song.samples, defaultSampleId).sampleId;

    if (sampleId === null) {
      return;
    }

    const sample = song.samples.find((entry) => entry.id === sampleId);

    if (sample === undefined) {
      return;
    }

    engine.previewSampleNote?.(sample.id, sample.baseNote as NoteValue, note);

    if (typeof engine.previewSampleNote !== "function") {
      engine.previewSampleTrigger(sample.id, getFrequencyForNote(note) / getFrequencyForNote(sample.baseNote));
    }
  };

  const flashKeyboardNote = (note: NoteValue) => {
    const key = keyboardBindings.find((binding) => binding.note === note)?.key;

    if (key === undefined) {
      return;
    }

    setActiveKeyboardKey(key);

    if (keyboardKeyResetTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(keyboardKeyResetTimeoutRef.current);
    }

    if (typeof window !== "undefined") {
      keyboardKeyResetTimeoutRef.current = window.setTimeout(() => {
        setActiveKeyboardKey(null);
        keyboardKeyResetTimeoutRef.current = null;
      }, 160);
    }
  };

  const applyKeyboardInputNote = (target: KeyboardNoteTarget, note: NoteValue) => {
    flashKeyboardNote(note);
    previewKeyboardInputNote(target, note);
    onEdit({ type: "update-step", trackId: target.trackId, stepIndex: target.stepIndex, changes: { enabled: true, note } });
  };

  const stopRecording = () => {
    sustainedPreviewStopsRef.current.forEach((stopPreview) => {
      stopPreview();
    });
    sustainedPreviewStopsRef.current.clear();
    setRecording(null);
  };

  const toggleRecording = (trackId: RecordTrackId) => {
    if (recordingTrackId === trackId) {
      stopRecording();
      return;
    }

    setRecording(startRecording(trackId));
    setSelection({ trackId, anchorStepIndex: 0, selectedStepIndexes: [0] });
    void onStartTransportAtStep(0);
  };

  const previewRecordingNote = (key: string, trackId: RecordTrackId, stepIndex: number, note: NoteValue) => {
    if (trackId === "sample") {
      previewKeyboardInputNote({
        trackId: "sample",
        stepIndex,
        note,
        enabled: true,
        kind: "sample",
        label: `PCM step ${stepIndex + 1}`,
        sampleId: song.tracks.sample.steps[stepIndex]?.sampleId ?? null,
      }, note);
      return;
    }

    const recordingTrack = song.tracks[trackId];
    const recordingStep = recordingTrack.steps[stepIndex];
    const volume = recordingStep?.volume ?? recordingTrack.volume;
    const duty = recordingTrack.kind === "pulse" ? recordingTrack.steps[stepIndex]?.duty ?? 0.5 : 0.5;
    const stopPreview = engine?.startSustainedPreviewNote(trackId, note, duty, volume);

    if (stopPreview !== null && stopPreview !== undefined) {
      sustainedPreviewStopsRef.current.set(key, stopPreview);
      return;
    }

    previewKeyboardInputNote({
      trackId,
      stepIndex,
      note,
      enabled: true,
      kind: "melodic",
      label: `${labelByTrackId[trackId]} step ${stepIndex + 1}`,
    }, note);
  };

  const pressRecordingNote = (key: string, note: NoteValue) => {
    const recording = recordingRef.current;

    if (recording === null) {
      return;
    }

    const pressed = pressRecordingKey(recording, song, key, note, playhead.get());

    if (pressed === null) {
      return;
    }

    setRecording(pressed.recording);
    flashKeyboardNote(note);
    previewRecordingNote(key, recording.trackId, pressed.stepIndex, note);
    onEdit(pressed.edit);
  };

  const toggleKeyboardMode = () => {
    if (!keyboardModeEnabled && keyboardNoteTarget !== null) {
      setKeyboardBaseOctave(getKeyboardBaseOctaveForNote(keyboardNoteTarget.note));
    }

    setKeyboardModeEnabled(!keyboardModeEnabled);
  };

  const shiftKeyboardOctave = (delta: number) => {
    setKeyboardBaseOctave((currentValue) => clampKeyboardBaseOctave(currentValue + delta));
  };

  const moveDrag = (clientX: number, clientY: number) => {
    const currentDrag = dragRef.current;

    if (currentDrag === null) {
      return;
    }

    const nextDrag = updateDrag(currentDrag, song, { clientX, clientY });

    if (nextDrag !== currentDrag) {
      setDrag(nextDrag);
    }
  };

  const endDrag = () => {
    const currentDrag = dragRef.current;

    if (currentDrag === null) {
      return;
    }

    if (currentDrag.isActive) {
      suppressClickRef.current = true;
    }

    const finished = finishDrag(currentDrag);

    if (finished !== null) {
      onEdit(finished.edit);
      setSelection(finished.selection);
    }

    setDrag(null);
  };

  const previewStep = (trackId: TrackId, stepIndex: number) => {
    if (engine === null || !hoverPreviewEnabled) {
      return;
    }

    const track = song.tracks[trackId];
    const stepDurationMs = getStepDurationMs(song);

    switch (track.kind) {
      case "pulse":
      case "triangle": {
        const melodicState = getMelodicStepState(track, stepIndex);

        if (melodicState.kind === "rest") {
          return;
        }

        if (track.kind === "pulse") {
          const sourceStep = track.steps[melodicState.kind === "hold" ? melodicState.startIndex : stepIndex];

          engine.previewNote(
            track.id,
            melodicState.note,
            Math.max(stepDurationMs * melodicState.length, stepDurationMs),
            sourceStep?.duty ?? 0.5,
            sourceStep?.volume ?? 0.25,
          );
          return;
        }

        const sourceStep = track.steps[melodicState.kind === "hold" ? melodicState.startIndex : stepIndex];
        engine.previewNote(
          track.id,
          melodicState.note,
          Math.max(stepDurationMs * melodicState.length, stepDurationMs),
          0.5,
          sourceStep?.volume ?? 0.25,
        );
        return;
      }
      case "noise": {
        const step = track.steps[stepIndex];

        if (!step.enabled) {
          return;
        }

        engine.previewNoiseConfig(step.mode, step.periodIndex);
        return;
      }
      case "sample": {
        const step = track.steps[stepIndex];

        if (!step.enabled || step.sampleId === null) {
          return;
        }

        if (song.meta.engineMode === "authentic") {
          engine.previewSampleTrigger(step.sampleId, step.playbackRate);
          return;
        }

        const sample = song.samples.find((entry) => entry.id === step.sampleId);

        if (sample === undefined) {
          return;
        }

        engine.previewSampleNote?.(sample.id, sample.baseNote as NoteValue, step.note as NoteValue);

        if (typeof engine.previewSampleNote !== "function") {
          engine.previewSampleTrigger(
            sample.id,
            getFrequencyForNote(step.note as NoteValue) / getFrequencyForNote(sample.baseNote),
          );
        }
      }
    }
  };

  const runRowAction = (action: RowAction) => {
    switch (action.type) {
      case "preview-step":
        previewStep(action.trackId, action.stepIndex);
        return;
      case "select-step":
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }

        setSelection(clickStep(selection, song, {
          trackId: action.trackId,
          stepIndex: action.stepIndex,
          shiftKey: action.shiftKey,
        }));
        return;
      case "deselect":
        setSelection(null);
        return;
      case "start-move": {
        const grabbed = action.shiftKey
          ? null
          : grabStep(selection, song, { trackId: action.trackId, stepIndex: action.stepIndex });

        if (grabbed !== null) {
          setSelection(grabbed);
          setDrag(startMoveDrag(grabbed, action.metrics));
        }

        return;
      }
      case "start-resize": {
        const resizeDrag = startResizeDrag(song, action.trackId, action.stepIndex, action.edge, action.metrics);

        if (resizeDrag !== null) {
          setDrag(resizeDrag);
        }

        return;
      }
      case "move-drag":
        moveDrag(action.clientX, action.clientY);
        return;
      case "end-drag":
        endDrag();
        return;
      case "toggle-recording":
        toggleRecording(action.trackId);
        return;
    }
  };

  const onRowAction = useStableCallback(runRowAction);
  const editSong = useStableCallback(onEdit);
  const openArrangementEditor = useStableCallback(onOpenArrangementEditor);
  const toggleKeyboardModeFromRuler = useStableCallback(toggleKeyboardMode);
  const lowerKeyboardOctave = useStableCallback(() => {
    shiftKeyboardOctave(-1);
  });
  const raiseKeyboardOctave = useStableCallback(() => {
    shiftKeyboardOctave(1);
  });

  /** Returns whether the command handled the key, so the browser default is suppressed only then. */
  const runKeyCommand = (command: SequencerKeyCommand): boolean => {
    switch (command.type) {
      case "toggle-keyboard-mode":
        toggleKeyboardMode();
        return true;
      case "record-note":
        pressRecordingNote(command.key, command.note);
        return true;
      case "enter-note":
        if (keyboardNoteTarget === null) {
          return false;
        }

        applyKeyboardInputNote(keyboardNoteTarget, command.note);
        return true;
      case "shift-octave":
        shiftKeyboardOctave(command.delta);
        return true;
      case "copy": {
        const copied = selection === null ? null : copySteps(song, selection);

        if (copied !== null) {
          setClipboard(copied);
        }

        return true;
      }
      case "paste": {
        const pasted = selection === null || clipboard === null ? null : pasteSteps(song, clipboard, selection);

        if (pasted !== null) {
          onEdit(pasted.edit);
          setSelection(pasted.selection);
        }

        return true;
      }
      case "clear-selection":
        if (selection === null) {
          return false;
        }

        setSelection(null);
        return true;
      case "delete-selection":
        if (selection === null) {
          return false;
        }

        selection.selectedStepIndexes.forEach((stepIndex) => {
          onEdit({ type: "update-step", trackId: selection.trackId, stepIndex, changes: { enabled: false } });
        });
        return true;
      case "enable-anchor":
        if (selection === null || song.tracks[selection.trackId].steps[selection.anchorStepIndex]?.enabled) {
          return false;
        }

        onEdit({
          type: "update-step",
          trackId: selection.trackId,
          stepIndex: selection.anchorStepIndex,
          changes: { enabled: true },
        });
        return true;
      case "move-selection":
        if (selection === null) {
          return false;
        }

        setSelection(moveSelection(selection, song, command.direction));
        return true;
    }
  };

  const handleDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // An open note picker claims Escape first; see NotePicker.
    if (event.defaultPrevented || isKeyboardTargetEditable(event.target)) {
      return;
    }

    const command = getSequencerKeyCommand(event, {
      recording: recordingRef.current !== null,
      keyboardMode: keyboardModeEnabled,
      baseOctave: keyboardBaseOctave,
    });

    if (command !== null && runKeyCommand(command)) {
      event.preventDefault();
    }
  });

  const handleDocumentKeyUp = useEffectEvent((event: KeyboardEvent) => {
    const recording = recordingRef.current;
    const key = normalizeKeyboardNoteKey(event.key);

    if (recording === null || key === null || isKeyboardTargetEditable(event.target)) {
      return;
    }

    const released = releaseRecordingKey(recording, song, key, playhead.get());

    if (released === null) {
      return;
    }

    sustainedPreviewStopsRef.current.get(key)?.();
    sustainedPreviewStopsRef.current.delete(key);
    setRecording(released.recording);

    if (released.edit !== null) {
      onEdit(released.edit);
    }

    event.preventDefault();
  });

  const handleWindowPointerMove = useEffectEvent((event: MouseEvent) => {
    moveDrag(event.clientX, event.clientY);
  });

  const handleWindowPointerEnd = useEffectEvent(() => {
    endDrag();
  });

  const handlePlayheadAdvance = useEffectEvent(() => {
    const recording = recordingRef.current;

    if (recording === null) {
      return;
    }

    const advanced = advanceRecording(recording, song, playhead.get());

    if (advanced.edits.length === 0) {
      return;
    }

    setRecording(advanced.recording);
    advanced.edits.forEach((edit) => {
      onEdit(edit);
    });
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleDocumentKeyDown(event);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      handleDocumentKeyUp(event);
    };
    const handlePointerMove = (event: MouseEvent) => {
      handleWindowPointerMove(event);
    };
    const handlePointerEnd = () => {
      handleWindowPointerEnd();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerEnd);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerEnd);
    };
  }, []);

  useEffect(() => {
    handlePlayheadAdvance();

    return playhead.subscribe(() => {
      handlePlayheadAdvance();
    });
  }, [playhead, song.transport.loopLength]);

  useEffect(() => {
    if (playbackState === "stopped" && recordingRef.current !== null) {
      stopRecording();
    }
  }, [playbackState]);

  useEffect(() => {
    if (recordingTrackId !== null && !isRecordTarget(song, recordingTrackId)) {
      stopRecording();
    }
  }, [recordingTrackId, song]);

  useEffect(() => {
    return () => {
      if (keyboardKeyResetTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(keyboardKeyResetTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {rulerVisible ? (
        <StepRuler
          activeKeyboardKey={activeKeyboardKey}
          canUseBeatGrid={canUpdateSongStepsPerBeat(song, SONG_BEAT_GRID_STEPS_PER_BEAT)}
          canUseEighthGrid={canUpdateSongStepsPerBeat(song, SONG_EIGHTH_GRID_STEPS_PER_BEAT)}
          keyboardBaseOctave={keyboardBaseOctave}
          keyboardBindings={keyboardBindings}
          keyboardModeEnabled={keyboardModeEnabled}
          isPlaying={isPlaying}
          keyboardTargetLabel={keyboardNoteTarget?.label ?? null}
          keyboardTargetNote={keyboardNoteTarget?.note ?? null}
          loopLength={song.transport.loopLength}
          onKeyboardBaseOctaveDecrease={lowerKeyboardOctave}
          onKeyboardBaseOctaveIncrease={raiseKeyboardOctave}
          onEdit={editSong}
          onToggleKeyboardMode={toggleKeyboardModeFromRuler}
          playhead={playhead}
          recordingTrackId={recordingTrackId}
          stepsPerBeat={song.transport.stepsPerBeat}
        />
      ) : null}
      {tracks.map((track) => {
        const isSelectedTrack = selection?.trackId === track.id;

        return (
          <SequencerRow
            key={track.id}
            dragState={drag?.trackId === track.id ? drag : null}
            engine={engine}
            engineMode={song.meta.engineMode}
            isPlaying={isPlaying}
            isRecording={recordingTrackId === track.id}
            onEdit={editSong}
            onOpenArrangementEditor={openArrangementEditor}
            onRowAction={onRowAction}
            playhead={playhead}
            recordTrackId={isRecordTarget(song, track.id) ? track.id : null}
            samples={song.samples}
            selectedStepIndex={isSelectedTrack ? selection.anchorStepIndex : null}
            selectedStepIndexes={isSelectedTrack ? selection.selectedStepIndexes : noSelectedSteps}
            stepDurationMs={stepDurationMs}
            track={track}
          />
        );
      })}
    </div>
  );
}

function getKeyboardNoteTarget(song: SongDocument, selection: StepSelection | null): KeyboardNoteTarget | null {
  if (selection === null) {
    return null;
  }

  const track = song.tracks[selection.trackId];
  const stepIndex = selection.anchorStepIndex;

  switch (track.kind) {
    case "pulse":
    case "triangle": {
      const step = track.steps[stepIndex];

      if (step === undefined) {
        return null;
      }

      return {
        trackId: track.id,
        stepIndex,
        note: step.note as NoteValue,
        enabled: step.enabled,
        kind: "melodic",
        label: `${labelByTrackId[track.id]} step ${stepIndex + 1}`,
      };
    }
    case "sample": {
      if (song.meta.engineMode !== "inspired") {
        return null;
      }

      const step = track.steps[stepIndex];

      if (step === undefined) {
        return null;
      }

      return {
        trackId: "sample",
        stepIndex,
        note: step.note as NoteValue,
        enabled: step.enabled,
        kind: "sample",
        label: `PCM step ${stepIndex + 1}`,
        sampleId: step.sampleId,
      };
    }
    case "noise":
      return null;
  }
}

/* ─────────── Step Ruler ─────────── */

const StepRuler = memo(function StepRuler({
  activeKeyboardKey,
  canUseBeatGrid,
  canUseEighthGrid,
  keyboardBaseOctave,
  keyboardBindings,
  isPlaying,
  keyboardModeEnabled,
  keyboardTargetLabel,
  keyboardTargetNote,
  loopLength,
  onEdit,
  onKeyboardBaseOctaveDecrease,
  onKeyboardBaseOctaveIncrease,
  onToggleKeyboardMode,
  playhead,
  recordingTrackId,
  stepsPerBeat,
}: {
  activeKeyboardKey: string | null;
  canUseBeatGrid: boolean;
  canUseEighthGrid: boolean;
  isPlaying: boolean;
  keyboardBaseOctave: number;
  keyboardBindings: ReturnType<typeof buildKeyboardNoteBindings>;
  keyboardModeEnabled: boolean;
  keyboardTargetLabel: string | null;
  keyboardTargetNote: NoteValue | null;
  loopLength: number;
  onEdit: (edit: SongEdit) => void;
  onKeyboardBaseOctaveDecrease: () => void;
  onKeyboardBaseOctaveIncrease: () => void;
  onToggleKeyboardMode: () => void;
  playhead: PlayheadStore;
  recordingTrackId: RecordTrackId | null;
  stepsPerBeat: number;
}) {
  const isEighthGrid = stepsPerBeat === SONG_EIGHTH_GRID_STEPS_PER_BEAT;
  const keyboardTargetSummary =
    recordingTrackId !== null
      ? `Recording ${labelByTrackId[recordingTrackId]}${isEighthGrid ? " at 1/8 grid" : ""}. Play keyboard notes.`
      : keyboardTargetLabel === null
      ? "Select a melodic or inspired PCM step to use note-entry mode."
      : keyboardModeEnabled
        ? `${keyboardTargetLabel} is armed for keyboard note entry.`
        : `${keyboardTargetLabel} is ready for keyboard note entry.`;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-2 backdrop-blur">
      <div className="mb-2 flex flex-col gap-3 px-1 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <div className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/30">
            Pattern Ruler
          </div>
          <div className="mt-1 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/38">
            {loopLength} step loop. Select empty steps, then press Enter to add.
          </div>
          <div className="mt-2 font-[var(--oc-mono)] text-[10px] text-white/55">{keyboardTargetSummary}</div>
        </div>
        <RulerControls
          canUseBeatGrid={canUseBeatGrid}
          canUseEighthGrid={canUseEighthGrid}
          keyboardBaseOctave={keyboardBaseOctave}
          keyboardModeEnabled={keyboardModeEnabled}
          loopLength={loopLength}
          onEdit={onEdit}
          onKeyboardBaseOctaveDecrease={onKeyboardBaseOctaveDecrease}
          onKeyboardBaseOctaveIncrease={onKeyboardBaseOctaveIncrease}
          onToggleKeyboardMode={onToggleKeyboardMode}
          stepsPerBeat={stepsPerBeat}
        />
      </div>
      <RulerSteps isPlaying={isPlaying} loopLength={loopLength} playhead={playhead} />
      {(keyboardModeEnabled || keyboardTargetLabel !== null) ? (
        <KeyboardPianoPreview
          activeKeyboardKey={activeKeyboardKey}
          bindings={keyboardBindings}
          keyboardModeEnabled={keyboardModeEnabled}
          selectedNote={keyboardTargetNote}
        />
      ) : null}
    </div>
  );
});

/** The ruler's buttons; they do not read the selection, so selecting a step re-renders only the summary text. */
const RulerControls = memo(function RulerControls({
  canUseBeatGrid,
  canUseEighthGrid,
  keyboardBaseOctave,
  keyboardModeEnabled,
  loopLength,
  onEdit,
  onKeyboardBaseOctaveDecrease,
  onKeyboardBaseOctaveIncrease,
  onToggleKeyboardMode,
  stepsPerBeat,
}: {
  canUseBeatGrid: boolean;
  canUseEighthGrid: boolean;
  keyboardBaseOctave: number;
  keyboardModeEnabled: boolean;
  loopLength: number;
  onEdit: (edit: SongEdit) => void;
  onKeyboardBaseOctaveDecrease: () => void;
  onKeyboardBaseOctaveIncrease: () => void;
  onToggleKeyboardMode: () => void;
  stepsPerBeat: number;
}) {
  const canDecrease = loopLength > SONG_LOOP_LENGTH_RANGE.min;
  const canIncrease = loopLength < SONG_LOOP_LENGTH_RANGE.max;
  const isBeatGrid = stepsPerBeat === SONG_BEAT_GRID_STEPS_PER_BEAT;
  const isEighthGrid = stepsPerBeat === SONG_EIGHTH_GRID_STEPS_PER_BEAT;
  const canLowerKeyboardOctave = keyboardBaseOctave > keyboardBaseOctaveMin;
  const canRaiseKeyboardOctave = keyboardBaseOctave < keyboardBaseOctaveMax;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <div className="mr-1 flex h-7 overflow-hidden rounded-md border border-white/[0.08] bg-black/20">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Use beat grid recording"
            aria-pressed={isBeatGrid}
            disabled={!canUseBeatGrid}
            className={cn(
              "h-7 rounded-none border-0 px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]",
              isBeatGrid
                ? "bg-[var(--oc-play)]/12 text-[var(--oc-play)]"
                : "text-white/45 hover:bg-white/[0.06] hover:text-white/75",
            )}
            onClick={() => {
              onEdit({ type: "set-steps-per-beat", stepsPerBeat: SONG_BEAT_GRID_STEPS_PER_BEAT });
            }}
          >
            Grid
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Use 1/8 grid recording"
            aria-pressed={isEighthGrid}
            disabled={!canUseEighthGrid}
            className={cn(
              "h-7 rounded-none border-0 border-l border-white/[0.08] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]",
              isEighthGrid
                ? "bg-[var(--oc-play)]/12 text-[var(--oc-play)]"
                : "text-white/45 hover:bg-white/[0.06] hover:text-white/75",
            )}
            onClick={() => {
              onEdit({ type: "set-steps-per-beat", stepsPerBeat: SONG_EIGHTH_GRID_STEPS_PER_BEAT });
            }}
          >
            1/8
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={keyboardModeEnabled ? "Disable keyboard note mode" : "Enable keyboard note mode"}
          aria-pressed={keyboardModeEnabled}
          className={cn(
            "h-7 rounded-md border px-2.5 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]",
            keyboardModeEnabled
              ? "border-[var(--oc-play)]/35 bg-[var(--oc-play)]/10 text-[var(--oc-play)]"
              : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white",
          )}
          onClick={onToggleKeyboardMode}
        >
          {keyboardModeEnabled ? "Keys On" : "Keys Off"} <span className="text-white/35">{keyboardModeShortcutKey}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Lower keyboard octave"
          disabled={!canLowerKeyboardOctave}
          className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
          onClick={onKeyboardBaseOctaveDecrease}
        >
          [
        </Button>
        <div
          aria-label="Keyboard octave"
          className="flex h-7 min-w-[5rem] items-center justify-center rounded-md border border-white/[0.08] bg-black/20 px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/60"
        >
          Oct {keyboardBaseOctave}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Raise keyboard octave"
          disabled={!canRaiseKeyboardOctave}
          className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
          onClick={onKeyboardBaseOctaveIncrease}
        >
          ]
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Remove 4 steps"
          disabled={!canDecrease}
          className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
          onClick={() => {
            onEdit({ type: "set-loop-length", loopLength: loopLength - SONG_LOOP_LENGTH_RANGE.step });
          }}
        >
          -4
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Add 4 steps"
          disabled={!canIncrease}
          className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
          onClick={() => {
            onEdit({ type: "set-loop-length", loopLength: loopLength + SONG_LOOP_LENGTH_RANGE.step });
          }}
        >
          +4
        </Button>
      </div>
      <div className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.12em] text-white/32">
        Note keys follow the classic tracker layout. Press note keys directly, or use Enter first on an empty step.
      </div>
    </div>
  );
});

const RulerSteps = memo(function RulerSteps({
  isPlaying,
  loopLength,
  playhead,
}: {
  isPlaying: boolean;
  loopLength: number;
  playhead: PlayheadStore;
}) {
  return (
    <div className="grid grid-cols-8 gap-1 md:grid-cols-16">
      {Array.from({ length: loopLength }, (_, index) => (
        <RulerStepCell key={`ruler-step-${index}`} index={index} isPlaying={isPlaying} playhead={playhead} />
      ))}
    </div>
  );
});

const RulerStepCell = memo(function RulerStepCell({
  index,
  isPlaying,
  playhead,
}: {
  index: number;
  isPlaying: boolean;
  playhead: PlayheadStore;
}) {
  const isActive = usePlayheadSelector(playhead, ({ nextStep }) => isPlaying && nextStep === index);
  const isQuarterBoundary = index % 4 === 0;

  return (
    <div
      aria-current={isActive ? "step" : undefined}
      className={cn(
        "rounded-sm py-1.5 text-center font-[var(--oc-mono)] text-[10px] font-medium transition-all",
        isActive
          ? "oc-playhead-active bg-[var(--oc-play)]/15 text-[var(--oc-play)]"
          : isQuarterBoundary
            ? "bg-white/[0.06] text-white/50"
            : "bg-white/[0.03] text-white/25",
      )}
    >
      {index + 1}
    </div>
  );
});

const KeyboardPianoPreview = memo(function KeyboardPianoPreview({
  activeKeyboardKey,
  bindings,
  keyboardModeEnabled,
  selectedNote,
}: {
  activeKeyboardKey: string | null;
  bindings: ReturnType<typeof buildKeyboardNoteBindings>;
  keyboardModeEnabled: boolean;
  selectedNote: NoteValue | null;
}) {
  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/30">Keyboard Notes</div>
        <div className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/35">
          {keyboardModeEnabled ? "Live note entry" : "Preview layout"}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <KeyboardBindingRow
          activeKeyboardKey={activeKeyboardKey}
          bindings={bindings.filter((binding) => binding.row === "lower")}
          rowLabel="Lower keys"
          selectedNote={selectedNote}
        />
        <KeyboardBindingRow
          activeKeyboardKey={activeKeyboardKey}
          bindings={bindings.filter((binding) => binding.row === "upper")}
          rowLabel="Upper keys"
          selectedNote={selectedNote}
        />
      </div>
    </div>
  );
});

function KeyboardBindingRow({
  activeKeyboardKey,
  bindings,
  rowLabel,
  selectedNote,
}: {
  activeKeyboardKey: string | null;
  bindings: ReturnType<typeof buildKeyboardNoteBindings>;
  rowLabel: string;
  selectedNote: NoteValue | null;
}) {
  const blackBindings = bindings.filter((binding) => binding.lane === "black");
  const whiteBindings = bindings.filter((binding) => binding.lane === "white");

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2">
      <div className="mb-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/35">{rowLabel}</div>
      <div className="space-y-1">
        <div className="grid grid-cols-7 gap-1">
          {blackBindings.map((binding) => (
            <KeyboardBindingKey
              key={`${rowLabel}-${binding.key}`}
              activeKeyboardKey={activeKeyboardKey}
              binding={binding}
              selectedNote={selectedNote}
            />
          ))}
        </div>
        <div className="grid grid-cols-10 gap-1">
          {whiteBindings.map((binding) => (
            <KeyboardBindingKey
              key={`${rowLabel}-${binding.key}`}
              activeKeyboardKey={activeKeyboardKey}
              binding={binding}
              selectedNote={selectedNote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KeyboardBindingKey({
  activeKeyboardKey,
  binding,
  selectedNote,
}: {
  activeKeyboardKey: string | null;
  binding: ReturnType<typeof buildKeyboardNoteBindings>[number];
  selectedNote: NoteValue | null;
}) {
  const isPressed = activeKeyboardKey === binding.key;
  const isSelected = binding.note !== null && binding.note === selectedNote;

  return (
    <div
      data-keyboard-key={binding.key}
      aria-label={`${binding.keyLabel} keyboard note ${binding.note ?? "unavailable"}`}
      className={cn(
        "flex min-h-[3.5rem] flex-col justify-between rounded-md border px-2 py-1.5 transition-all",
        binding.lane === "black"
          ? "border-white/[0.06] bg-[#111521] text-white/65"
          : "border-white/[0.06] bg-white/[0.03] text-white/75",
        !binding.isPlayable && "opacity-25",
        isSelected && "border-[var(--oc-play)]/35 bg-[var(--oc-play)]/10 text-[var(--oc-play)]",
        isPressed && "translate-y-[1px] border-white/30 bg-white/[0.12] text-white",
      )}
    >
      <span className="font-[var(--oc-mono)] text-[11px] font-semibold uppercase leading-none">{binding.note ?? "--"}</span>
      <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/35">{binding.keyLabel}</span>
    </div>
  );
}

/* ─────────── Sequencer Row ─────────── */

const SequencerRow = memo(function SequencerRow({
  dragState,
  engine,
  engineMode,
  isPlaying,
  isRecording,
  onEdit,
  onOpenArrangementEditor,
  onRowAction,
  playhead,
  recordTrackId,
  samples,
  selectedStepIndex,
  selectedStepIndexes,
  stepDurationMs,
  track,
}: {
  dragState: StepDrag | null;
  engine: AudioEngine | null;
  engineMode: SongDocument["meta"]["engineMode"];
  isPlaying: boolean;
  isRecording: boolean;
  onEdit: (edit: SongEdit) => void;
  onOpenArrangementEditor: (trackId: TrackId) => void;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  recordTrackId: RecordTrackId | null;
  samples: SongDocument["samples"];
  selectedStepIndex: number | null;
  selectedStepIndexes: readonly number[];
  stepDurationMs: number;
  track: Track;
}) {
  const deselect = useCallback(() => {
    onRowAction({ type: "deselect" });
  }, [onRowAction]);

  return (
    <div
      className={cn(
        "oc-voice-row grid gap-0 overflow-hidden rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] backdrop-blur lg:grid-cols-[200px_minmax(0,1fr)]",
        isRecording && "ring-2 ring-[var(--oc-play)]/45",
      )}
      style={{ borderLeftColor: voiceColorByTrackId[track.id], borderLeftWidth: "3px" }}
    >
      <TrackControls
        engine={engine}
        isRecording={isRecording}
        kind={track.kind}
        muted={track.muted}
        onEdit={onEdit}
        onOpenArrangementEditor={onOpenArrangementEditor}
        onRowAction={onRowAction}
        recordTrackId={recordTrackId}
        trackId={track.id}
        volume={track.volume}
      />

      {/* Step grid + detail panel */}
      <div className="p-2">
        <CompactStepGrid
          accentClassName={accentByTrackId[track.id]}
          accentColor={waveformLineColorByTrackId[track.id]}
          dragState={dragState}
          engineMode={engineMode}
          isPlaying={isPlaying}
          onRowAction={onRowAction}
          playhead={playhead}
          samples={samples}
          selectedStepIndexes={selectedStepIndexes}
          track={track}
        />
        {selectedStepIndex !== null ? (
          <StepDetailPanel
            engine={engine}
            engineMode={engineMode}
            onDeselect={deselect}
            onEdit={onEdit}
            samples={samples}
            stepDurationMs={stepDurationMs}
            stepIndex={selectedStepIndex}
            track={track}
          />
        ) : null}
      </div>
    </div>
  );
});

/** The voice info panel; it reads only the track's mixer fields, so step edits, selection and drags skip it. */
const TrackControls = memo(function TrackControls({
  engine,
  isRecording,
  kind,
  muted,
  onEdit,
  onOpenArrangementEditor,
  onRowAction,
  recordTrackId,
  trackId,
  volume,
}: {
  engine: AudioEngine | null;
  isRecording: boolean;
  kind: Track["kind"];
  muted: boolean;
  onEdit: (edit: SongEdit) => void;
  onOpenArrangementEditor: (trackId: TrackId) => void;
  onRowAction: (action: RowAction) => void;
  recordTrackId: RecordTrackId | null;
  trackId: TrackId;
  volume: number;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: waveformLineColorByTrackId[trackId] }}
          />
          <h3 className="font-[var(--oc-mono)] text-sm font-bold uppercase tracking-[0.12em] text-white">
            {labelByTrackId[trackId]}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.18em]",
              accentByTrackId[trackId],
            )}
          >
            {shortLabelByTrackId[trackId]}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${muted ? "Unmute" : "Mute"} ${labelByTrackId[trackId]}`}
            aria-pressed={muted}
            className={cn(
              "size-7 text-white/40 hover:bg-white/[0.06] hover:text-white",
              muted && "text-[var(--oc-noise)] hover:text-[var(--oc-noise)]",
            )}
            onClick={() => {
              onEdit({ type: "toggle-track-mute", trackId });
            }}
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
          {recordTrackId !== null ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${isRecording ? "Stop recording" : "Record"} ${labelByTrackId[trackId]}`}
                    aria-pressed={isRecording}
                    className={cn(
                      "size-7 text-white/40 hover:bg-white/[0.06] hover:text-white",
                      isRecording && "text-[var(--oc-play)] hover:text-[var(--oc-play)]",
                    )}
                    onClick={() => {
                      onRowAction({ type: "toggle-recording", trackId: recordTrackId });
                    }}
                  />
                }
              >
                <Circle className={cn("size-3.5", isRecording && "fill-current")} />
              </TooltipTrigger>
              <TooltipContent side="top">
                {isRecording ? `Stop recording ${labelByTrackId[trackId]}` : `Record ${labelByTrackId[trackId]}`}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* Inline waveform */}
      <div className="oc-waveform-wrap rounded-sm border border-white/[0.05] bg-black/30">
        <TrackWaveformCanvas
          ariaLabel={`${labelByTrackId[trackId]} waveform`}
          engine={engine}
          trackId={trackId}
          fallbackWaveform={previewWaveformByTrackId[trackId]}
          className="h-14 w-full"
          backgroundColor="rgba(7, 8, 14, 0.85)"
          glowColor={waveformGlowColorByTrackId[trackId]}
          lineColor={waveformLineColorByTrackId[trackId]}
        />
      </div>

      {/* Volume readout */}
      <TrackVolumeControl kind={kind} muted={muted} onEdit={onEdit} trackId={trackId} volume={volume} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Edit ${labelByTrackId[trackId]} arrangement as text`}
        className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
        onClick={() => {
          onOpenArrangementEditor(trackId);
        }}
      >
        Text Edit
      </Button>
    </div>
  );
});

/* ─────────── Track Volume Control ─────────── */

function TrackVolumeControl({
  kind,
  muted,
  onEdit,
  trackId,
  volume,
}: {
  kind: Track["kind"];
  muted: boolean;
  onEdit: (edit: SongEdit) => void;
  trackId: TrackId;
  volume: number;
}) {
  const volumeInputId = `track-volume-${trackId}`;
  const volumePercent = toTrackVolumePercent(volume);

  return (
    <div
      className="rounded-sm border border-white/[0.06] bg-black/20 px-2 py-1.5"
      style={{ ["--oc-track-accent" as string]: waveformLineColorByTrackId[trackId] }}
    >
      <div className="mb-1.5 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/30">
        <label htmlFor={volumeInputId} className="text-white/45">
          Level
        </label>
        <span className="text-white/65">{volumePercent}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">0</span>
        <input
          id={volumeInputId}
          type="range"
          min={TRACK_VOLUME_PERCENT_RANGE.min}
          max={TRACK_VOLUME_PERCENT_RANGE.max}
          step={TRACK_VOLUME_PERCENT_RANGE.step}
          value={volumePercent}
          aria-label={`${labelByTrackId[trackId]} volume`}
          className={cn("oc-track-volume", muted && "opacity-60")}
          onChange={(event) => {
            onEdit({
              type: "set-track-volume",
              trackId,
              volume: Number(event.currentTarget.value) / TRACK_VOLUME_PERCENT_RANGE.max,
            });
          }}
        />
        <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">100</span>
      </div>
      <div className="mt-1 flex items-center justify-between font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.16em] text-white/25">
        <span>{muted ? "Muted bus" : "Bus live"}</span>
        <span>{kind}</span>
      </div>
    </div>
  );
}

/* ─────────── Compact Step Grid ─────────── */

type CompactCellData = {
  enabled: boolean;
  label: string;
  volume: number;
};

function getCompactCellData(
  track: Track,
  engineMode: SongDocument["meta"]["engineMode"],
  stepIndex: number,
  samples: SongDocument["samples"],
): CompactCellData {
  switch (track.kind) {
    case "pulse":
    case "triangle":
      return {
        enabled: track.steps[stepIndex]?.enabled ?? false,
        label: track.steps[stepIndex]?.enabled ? track.steps[stepIndex].note : "\u00b7",
        volume: track.steps[stepIndex]?.volume ?? 0,
      };
    case "noise": {
      const step = track.steps[stepIndex];
      const preset = getNoiseTriggerPresetForStep(step);

      return {
        enabled: step.enabled,
        label: step.enabled ? (preset?.shortLabel ?? step.mode[0]) : "\u00b7",
        volume: step.volume,
      };
    }
    case "sample": {
      const step = track.steps[stepIndex];
      const sample = step.sampleId === null ? null : samples.find((s) => s.id === step.sampleId) ?? null;

      return {
        enabled: step.enabled,
        label:
          !step.enabled
            ? "\u00b7"
            : engineMode === "inspired"
              ? step.note
              : sample !== null
                ? sample.name
                : "pcm",
        volume: step.volume,
      };
    }
  }
}

type MelodicArrangementPreviewEntry = {
  stepIndex: number;
  length: number;
  label: string;
  volume: number;
  isPreview: boolean;
  isPreviewInvalid: boolean;
};

type MelodicSegment = {
  originStepIndex: number;
  segmentStepIndex: number;
  rowIndex: number;
  columnStart: number;
  columnSpan: number;
  isFirstSegment: boolean;
  isLastSegment: boolean;
  label: string;
  volume: number;
  isPreview: boolean;
  isPreviewInvalid: boolean;
};

const CompactStepGrid = memo(function CompactStepGrid({
  accentClassName,
  accentColor,
  dragState,
  engineMode,
  isPlaying,
  onRowAction,
  playhead,
  samples,
  selectedStepIndexes,
  track,
}: {
  accentClassName: string;
  accentColor: string;
  dragState: StepDrag | null;
  engineMode: SongDocument["meta"]["engineMode"];
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  samples: SongDocument["samples"];
  selectedStepIndexes: readonly number[];
  track: Track;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columnCount = useStepColumnCount();
  const selectedStepIndexSet = useMemo(() => new Set(selectedStepIndexes), [selectedStepIndexes]);
  const melodicTrack = track.kind === "pulse" || track.kind === "triangle" ? track : null;
  const melodicStepStates = useMemo(
    () => (melodicTrack === null ? [] : melodicTrack.steps.map((_, index) => getMelodicStepState(melodicTrack, index))),
    [melodicTrack],
  );
  const noteSegments = useMemo(
    () =>
      melodicTrack === null
        ? []
        : getMelodicArrangementEntries(melodicTrack).flatMap((entry) =>
            getMelodicSegments(
              {
                stepIndex: entry.stepIndex,
                length: entry.length,
                label: entry.note,
                volume: melodicTrack.steps[entry.stepIndex]?.volume ?? 0,
                isPreview: false,
                isPreviewInvalid: false,
              },
              columnCount,
            ),
          ),
    [melodicTrack, columnCount],
  );
  const previewSegments = useMemo(
    () =>
      melodicTrack === null
        ? []
        : getMelodicPreviewEntries(melodicTrack, dragState).flatMap((entry) => getMelodicSegments(entry, columnCount)),
    [melodicTrack, dragState, columnCount],
  );
  // The note layer sees the selection only while it holds a note, so moving it between empty cells skips that layer.
  const noteSelection = selectedStepIndexes.some((index) => melodicStepStates[index]?.kind === "start")
    ? selectedStepIndexSet
    : noSelectedStepIndexSet;
  const triggerCells = useMemo(
    () =>
      melodicTrack === null ? track.steps.map((_, index) => getCompactCellData(track, engineMode, index, samples)) : [],
    [melodicTrack, track, engineMode, samples],
  );

  if (track.kind === "pulse" || track.kind === "triangle") {
    const rowCount = Math.ceil(track.steps.length / columnCount);

    // Separate memoized layers: a drag move re-renders only the preview layer, and a step edit or
    // selection change leaves the layer it does not touch alone.
    return (
      <div ref={gridRef} className="relative" role="row">
        <MelodicGridCellLayer
          accentColor={accentColor}
          isPlaying={isPlaying}
          onRowAction={onRowAction}
          playhead={playhead}
          selectedStepIndexSet={selectedStepIndexSet}
          stepStates={melodicStepStates}
          trackId={track.id}
        />
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-8 gap-1 md:grid-cols-16"
          style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, ${fallbackStepHeightPx}px))` }}
        >
          <MelodicSegmentLayer
            accentClassName={accentClassName}
            accentColor={accentColor}
            gridRef={gridRef}
            isPlaying={isPlaying}
            onRowAction={onRowAction}
            playhead={playhead}
            segments={noteSegments}
            selectedStepIndexSet={noteSelection}
            trackId={track.id}
          />
          <MelodicSegmentLayer
            accentClassName={accentClassName}
            accentColor={accentColor}
            gridRef={gridRef}
            isPlaying={isPlaying}
            onRowAction={onRowAction}
            playhead={playhead}
            segments={previewSegments}
            selectedStepIndexSet={noSelectedStepIndexSet}
            trackId={track.id}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={gridRef} className="grid grid-cols-8 gap-1 md:grid-cols-16" role="row">
      {triggerCells.map((cellData, index) => {
        const isDragPreview =
          dragState?.mode === "move" &&
          dragState.isActive &&
          dragState.initialSelectedStepIndexes.includes(index - dragState.delta);

        return (
          <CompactStepCell
            key={`${track.id}-step-${index}`}
            accentClassName={accentClassName}
            accentColor={accentColor}
            ariaLabel={`${labelByTrackId[track.id]} step ${index + 1}`}
            columnCount={columnCount}
            dragPreview={isDragPreview ? (dragState.isValid ? "valid" : "invalid") : null}
            enabled={cellData.enabled}
            gridRef={gridRef}
            index={index}
            isPlaying={isPlaying}
            isSelected={selectedStepIndexSet.has(index)}
            label={cellData.label}
            onRowAction={onRowAction}
            playhead={playhead}
            trackId={track.id}
            volume={cellData.volume}
          />
        );
      })}
    </div>
  );
});

/* ─────────── Compact Step Cell ─────────── */

const CompactStepCell = memo(function CompactStepCell({
  accentClassName,
  accentColor,
  ariaLabel,
  columnCount,
  dragPreview,
  enabled,
  gridRef,
  index,
  isPlaying,
  isSelected,
  label,
  onRowAction,
  playhead,
  trackId,
  volume,
}: {
  accentClassName: string;
  accentColor: string;
  ariaLabel: string;
  columnCount: number;
  dragPreview: DragPreview;
  enabled: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  label: string;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  trackId: TrackId;
  volume: number;
}) {
  const isActive = usePlayheadSelector(playhead, ({ nextStep }) => isPlaying && nextStep === index);
  const isQuarterBoundary = index % 4 === 0;
  const startDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onRowAction({
      type: "start-move",
      trackId,
      stepIndex: index,
      metrics: getGridMetrics(event.currentTarget, gridRef.current, columnCount, event.clientX, event.clientY),
      shiftKey: event.shiftKey,
    });
  };
  const moveDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onRowAction({ type: "move-drag", clientX: event.clientX, clientY: event.clientY });
  };
  const endDrag = () => {
    onRowAction({ type: "end-drag" });
  };

  return (
    <button
      type="button"
      data-step-index={index}
      aria-current={isActive ? "step" : undefined}
      aria-label={ariaLabel}
      aria-selected={isSelected || undefined}
      className={cn(
        "oc-step-cell relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-sm border font-[var(--oc-mono)] text-[10px] transition-all",
        enabled
          ? `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`
          : isQuarterBoundary
            ? "border-white/[0.08] bg-white/[0.04] text-white/30"
            : "border-white/[0.05] bg-white/[0.02] text-white/20",
        dragPreview !== null && (dragPreview === "invalid" ? "border-red-400/80 bg-red-500/10" : "border-white/30 bg-white/10"),
        isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10 text-white",
        isSelected && "ring-2 ring-offset-0",
      )}
      style={isSelected ? { ["--tw-ring-color" as string]: accentColor } : undefined}
      onMouseEnter={() => {
        onRowAction({ type: "preview-step", trackId, stepIndex: index });
      }}
      onClick={(event) => {
        onRowAction({ type: "select-step", trackId, stepIndex: index, shiftKey: event.shiftKey });
      }}
      onMouseDown={startDrag}
      onMouseMove={moveDrag}
      onMouseUp={endDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
    >
      <span className="text-[8px] leading-none text-white/30">{index + 1}</span>
      <span
        className={cn(
          "max-w-full truncate px-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em]",
          enabled ? "text-inherit" : "text-white/20",
        )}
      >
        {label}
      </span>

      {enabled ? (
        <div className="h-[3px] w-3/4 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${volume * 100}%`, backgroundColor: accentColor }}
          />
        </div>
      ) : null}
    </button>
  );
});

const MelodicGridCellLayer = memo(function MelodicGridCellLayer({
  accentColor,
  isPlaying,
  onRowAction,
  playhead,
  selectedStepIndexSet,
  stepStates,
  trackId,
}: {
  accentColor: string;
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  selectedStepIndexSet: ReadonlySet<number>;
  stepStates: readonly MelodicStepState[];
  trackId: TrackId;
}) {
  const cellStates = stepStates
    .map((stepState, index) =>
      stepState.kind !== "rest" ? "n" : selectedStepIndexSet.has(index) ? "s" : ".",
    )
    .join("");
  const chunkStarts = Array.from(
    { length: Math.ceil(cellStates.length / gridCellChunkSize) },
    (_, chunk) => chunk * gridCellChunkSize,
  );

  return (
    <div className="grid grid-cols-8 gap-1 md:grid-cols-16">
      {chunkStarts.map((start) => (
        <MelodicGridCellChunk
          key={start}
          accentColor={accentColor}
          cellStates={cellStates.slice(start, start + gridCellChunkSize)}
          isPlaying={isPlaying}
          onRowAction={onRowAction}
          playhead={playhead}
          start={start}
          trackId={trackId}
        />
      ))}
    </div>
  );
});

/**
 * `cellStates` has one character per cell ("n" under a note, "s" selected, "." free). A string compares by value,
 * so an edit or selection change re-renders only the chunks whose cells it changes.
 */
const MelodicGridCellChunk = memo(function MelodicGridCellChunk({
  accentColor,
  cellStates,
  isPlaying,
  onRowAction,
  playhead,
  start,
  trackId,
}: {
  accentColor: string;
  cellStates: string;
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  start: number;
  trackId: TrackId;
}) {
  return Array.from(cellStates, (cellState, offset) => (
    <MelodicGridCell
      key={`${trackId}-grid-cell-${start + offset}`}
      accentColor={accentColor}
      index={start + offset}
      isOccupiedByNote={cellState === "n"}
      isPlaying={isPlaying}
      isSelected={cellState === "s"}
      onRowAction={onRowAction}
      playhead={playhead}
      trackId={trackId}
    />
  ));
});

const MelodicSegmentLayer = memo(function MelodicSegmentLayer({
  accentClassName,
  accentColor,
  gridRef,
  isPlaying,
  onRowAction,
  playhead,
  segments,
  selectedStepIndexSet,
  trackId,
}: {
  accentClassName: string;
  accentColor: string;
  gridRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  segments: readonly MelodicSegment[];
  selectedStepIndexSet: ReadonlySet<number>;
  trackId: TrackId;
}) {
  return segments.map((segment) => (
    <MelodicNoteSegmentButton
      key={`${trackId}-${segment.originStepIndex}-${segment.rowIndex}-${segment.columnStart}-${segment.isPreview ? "preview" : "note"}`}
      {...segment}
      accentClassName={accentClassName}
      accentColor={accentColor}
      gridRef={gridRef}
      isPlaying={isPlaying}
      isSelected={!segment.isPreview && selectedStepIndexSet.has(segment.originStepIndex)}
      onRowAction={onRowAction}
      playhead={playhead}
      trackId={trackId}
    />
  ));
});

const MelodicGridCell = memo(function MelodicGridCell({
  accentColor,
  index,
  isOccupiedByNote,
  isPlaying,
  isSelected,
  onRowAction,
  playhead,
  trackId,
}: {
  accentColor: string;
  index: number;
  isOccupiedByNote: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  trackId: TrackId;
}) {
  const isActive = usePlayheadSelector(
    playhead,
    ({ nextStep }) => isPlaying && !isOccupiedByNote && nextStep === index,
  );
  const isQuarterBoundary = index % 4 === 0;

  return (
    <button
      type="button"
      data-step-index={index}
      aria-hidden={isOccupiedByNote}
      aria-current={isActive ? "step" : undefined}
      aria-label={isOccupiedByNote ? undefined : `${labelByTrackId[trackId]} step ${index + 1}`}
      aria-selected={isSelected ? true : undefined}
      className={cn(
        "relative z-0 flex h-12 flex-col items-center justify-center gap-0.5 rounded-sm border font-[var(--oc-mono)] text-[10px] transition-all",
        isOccupiedByNote
          ? "pointer-events-none border-transparent bg-transparent text-transparent shadow-none"
          : isQuarterBoundary
            ? "border-white/[0.08] bg-white/[0.04] text-white/30"
            : "border-white/[0.05] bg-white/[0.02] text-white/20",
        isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10",
        isSelected && "ring-2 ring-offset-0",
      )}
      style={isSelected ? { ["--tw-ring-color" as string]: accentColor } : undefined}
      onMouseEnter={() => {
        onRowAction({ type: "preview-step", trackId, stepIndex: index });
      }}
      onClick={(event) => {
        onRowAction({ type: "select-step", trackId, stepIndex: index, shiftKey: event.shiftKey });
      }}
    >
      <span className={cn("text-[8px] leading-none text-white/30", isOccupiedByNote && "text-transparent")}>
        {index + 1}
      </span>
      <span
        className={cn(
          "max-w-full truncate px-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-white/20",
          isOccupiedByNote && "text-transparent",
        )}
      >
        {isOccupiedByNote ? "" : "·"}
      </span>
    </button>
  );
});

const MelodicNoteSegmentButton = memo(function MelodicNoteSegmentButton({
  accentClassName,
  accentColor,
  gridRef,
  isPlaying,
  isSelected,
  onRowAction,
  playhead,
  trackId,
  ...segment
}: MelodicSegment & {
  accentClassName: string;
  accentColor: string;
  gridRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  isSelected: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  trackId: TrackId;
}) {
  const isActive = usePlayheadSelector(
    playhead,
    ({ nextStep }) =>
      isPlaying && nextStep >= segment.segmentStepIndex && nextStep < segment.segmentStepIndex + segment.columnSpan,
  );
  const bodyLabel = segment.isFirstSegment
    ? `${labelByTrackId[trackId]} step ${segment.originStepIndex + 1}`
    : `${labelByTrackId[trackId]} step ${segment.originStepIndex + 1} continuation`;
  const startMove = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (segment.isPreview) {
      return;
    }

    onRowAction({
      type: "start-move",
      trackId,
      stepIndex: segment.originStepIndex,
      metrics: getGridMetrics(event.currentTarget, gridRef.current, undefined, event.clientX, event.clientY),
      shiftKey: event.shiftKey,
    });
  };
  const moveDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onRowAction({ type: "move-drag", clientX: event.clientX, clientY: event.clientY });
  };
  const endDrag = () => {
    onRowAction({ type: "end-drag" });
  };
  const startResize = (event: ReactMouseEvent<HTMLSpanElement>, edge: "left" | "right") => {
    event.stopPropagation();
    onRowAction({
      type: "start-resize",
      trackId,
      stepIndex: segment.originStepIndex,
      edge,
      metrics: getGridMetrics(event.currentTarget, gridRef.current, undefined, event.clientX, event.clientY),
    });
  };

  return (
    <button
      type="button"
      data-note-origin-step={segment.originStepIndex}
      aria-current={isActive ? "step" : undefined}
      aria-label={bodyLabel}
      aria-selected={isSelected || undefined}
      className={cn(
        "pointer-events-auto relative z-10 flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-sm border px-2 py-1 text-left font-[var(--oc-mono)] text-[10px] transition-all",
        segment.isPreview
          ? segment.isPreviewInvalid
            ? "border-red-400/80 bg-red-500/10 text-white/75"
            : "border-white/30 bg-white/10 text-white/80"
          : `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`,
        isSelected && "ring-2 ring-offset-0",
      )}
      style={{
        gridColumn: `${segment.columnStart} / span ${segment.columnSpan}`,
        gridRow: segment.rowIndex + 1,
        ...(isSelected ? { ["--tw-ring-color" as string]: accentColor } : {}),
      }}
      onMouseEnter={() => {
        onRowAction({ type: "preview-step", trackId, stepIndex: segment.originStepIndex });
      }}
      onClick={(event) => {
        onRowAction({ type: "select-step", trackId, stepIndex: segment.originStepIndex, shiftKey: event.shiftKey });
      }}
      onPointerDown={startMove}
      onMouseDown={startMove}
      onPointerMove={moveDrag}
      onMouseMove={moveDrag}
      onPointerUp={endDrag}
      onMouseUp={endDrag}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1 z-0 grid text-[8px] leading-none text-white/30"
        style={{ gridTemplateColumns: `repeat(${segment.columnSpan}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: segment.columnSpan }, (_, offset) => (
          <span key={`${segment.segmentStepIndex + offset}-step-number`} className="text-center">
            {segment.segmentStepIndex + offset + 1}
          </span>
        ))}
      </div>
      {isActive ? (
        <PlayheadSweep
          columnSpan={segment.columnSpan}
          playhead={playhead}
          segmentStepIndex={segment.segmentStepIndex}
        />
      ) : null}
      {segment.isFirstSegment ? (
        <span className="mt-3 truncate text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-inherit">
          {segment.label}
        </span>
      ) : null}
      {segment.isFirstSegment ? (
        <div
          className="mt-auto h-[3px] overflow-hidden rounded-full bg-white/[0.08]"
          style={{ width: `${100 / segment.columnSpan}%` }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${segment.volume * 100}%`, backgroundColor: accentColor }}
          />
        </div>
      ) : null}
      {!segment.isPreview && segment.isFirstSegment ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Resize start of ${labelByTrackId[trackId]} step ${segment.originStepIndex + 1}`}
          className="absolute inset-y-0 left-0 w-3 cursor-ew-resize rounded-l-sm border-l border-white/35 bg-transparent hover:bg-white/8"
          onPointerDown={(event) => {
            startResize(event, "left");
          }}
          onMouseDown={(event) => {
            startResize(event, "left");
          }}
        />
      ) : null}
      {!segment.isPreview && segment.isLastSegment ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Resize end of ${labelByTrackId[trackId]} step ${segment.originStepIndex + 1}`}
          className="absolute inset-y-0 right-0 w-3 cursor-ew-resize rounded-r-sm border-r border-white/35 bg-transparent hover:bg-white/8"
          onPointerDown={(event) => {
            startResize(event, "right");
          }}
          onMouseDown={(event) => {
            startResize(event, "right");
          }}
        />
      ) : null}
    </button>
  );
});

/** Mounted only while the playhead is inside the segment, so a step within a note re-renders just this box. */
const PlayheadSweep = memo(function PlayheadSweep({
  columnSpan,
  playhead,
  segmentStepIndex,
}: {
  columnSpan: number;
  playhead: PlayheadStore;
  segmentStepIndex: number;
}) {
  const offset = usePlayheadSelector(playhead, ({ nextStep }) => nextStep - segmentStepIndex);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-0 rounded-sm border border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10"
      style={{
        width: `${100 / columnSpan}%`,
        left: `${(100 / columnSpan) * offset}%`,
      }}
    />
  );
});

function getMelodicPreviewEntries(
  track: Extract<Track, { kind: "pulse" | "triangle" }>,
  dragState: StepDrag | null,
): MelodicArrangementPreviewEntry[] {
  if (dragState === null || !dragState.isActive) {
    return [];
  }

  if (dragState.mode === "move") {
    if (dragState.trackId !== track.id || dragState.delta === 0) {
      return [];
    }

    return dragState.initialSelectedStepIndexes.flatMap((stepIndex) => {
      const step = track.steps[stepIndex];

      if (!step?.enabled) {
        return [];
      }

      return [{
        stepIndex: stepIndex + dragState.delta,
        length: step.length,
        label: step.note,
        volume: step.volume,
        isPreview: true,
        isPreviewInvalid: !dragState.isValid,
      }];
    });
  }

  if (dragState.trackId !== track.id) {
    return [];
  }

  const step = track.steps[dragState.originStepIndex];

  if (!step?.enabled) {
    return [];
  }

  return [{
    stepIndex: dragState.previewStartStepIndex,
    length: dragState.previewLength,
    label: step.note,
    volume: step.volume,
    isPreview: true,
    isPreviewInvalid: false,
  }];
}

function getMelodicSegments(
  entry: MelodicArrangementPreviewEntry,
  columns: number,
): MelodicSegment[] {
  if (entry.stepIndex < 0 || entry.length <= 0) {
    return [];
  }

  const segments: MelodicSegment[] = [];
  let currentIndex = entry.stepIndex;
  let remainingLength = entry.length;
  let segmentIndex = 0;

  while (remainingLength > 0) {
    const rowIndex = Math.floor(currentIndex / columns);
    const columnStart = (currentIndex % columns) + 1;
    const columnSpan = Math.min(remainingLength, columns - (currentIndex % columns));

    segments.push({
      originStepIndex: entry.stepIndex,
      segmentStepIndex: currentIndex,
      rowIndex,
      columnStart,
      columnSpan,
      isFirstSegment: segmentIndex === 0,
      isLastSegment: remainingLength === columnSpan,
      label: entry.label,
      volume: entry.volume,
      isPreview: entry.isPreview,
      isPreviewInvalid: entry.isPreviewInvalid,
    });

    currentIndex += columnSpan;
    remainingLength -= columnSpan;
    segmentIndex += 1;
  }

  return segments;
}

function useStepColumnCount() {
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return 16;
    }

    return window.matchMedia(mediumViewportQuery).matches ? 16 : 8;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(mediumViewportQuery);
    const updateColumnCount = () => {
      setColumnCount(mediaQuery.matches ? 16 : 8);
    };

    updateColumnCount();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateColumnCount);
    } else {
      mediaQuery.addListener(updateColumnCount);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateColumnCount);
      } else {
        mediaQuery.removeListener(updateColumnCount);
      }
    };
  }, []);

  return columnCount;
}

function getGridMetrics(
  element: HTMLElement,
  gridElement: HTMLElement | null,
  columns: number | undefined,
  clientX: number,
  clientY: number,
): GridMetrics {
  const targetGrid = gridElement ?? element.closest("[role='row']");
  const firstCell = targetGrid instanceof HTMLElement ? targetGrid.querySelector<HTMLElement>("[data-step-index='0']") : null;
  const nextCell =
    targetGrid instanceof HTMLElement
      ? targetGrid.querySelector<HTMLElement>(`[data-step-index='${(columns ?? 16) > 1 ? 1 : 0}']`)
      : null;
  const nextRowCell =
    targetGrid instanceof HTMLElement && columns !== undefined
      ? targetGrid.querySelector<HTMLElement>(`[data-step-index='${columns}']`)
      : null;
  const referenceRect = firstCell?.getBoundingClientRect() ?? element.getBoundingClientRect();
  const nextCellRect = nextCell?.getBoundingClientRect() ?? null;
  const nextRowRect = nextRowCell?.getBoundingClientRect() ?? null;
  const horizontalGap = nextCellRect === null ? fallbackStepGapPx : Math.max(0, nextCellRect.left - referenceRect.right);
  const verticalGap = nextRowRect === null ? fallbackStepGapPx : Math.max(0, nextRowRect.top - referenceRect.bottom);
  const resolvedColumns =
    columns ??
    (targetGrid instanceof HTMLElement && typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(mediumViewportQuery).matches
        ? 16
        : 8
      : 16);

  return {
    pointerStartX: clientX,
    pointerStartY: clientY,
    stepWidth: referenceRect.width + horizontalGap || fallbackStepWidthPx,
    stepHeight: referenceRect.height + verticalGap || fallbackStepHeightPx,
    columns: resolvedColumns,
  };
}
