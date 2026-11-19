import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canUpdateSongStepsPerBeat,
  getOrderedTracks,
  SONG_BEAT_GRID_STEPS_PER_BEAT,
  SONG_EIGHTH_GRID_STEPS_PER_BEAT,
  type NoteValue,
  type SongDocument,
  type SongEdit,
  type TrackId,
} from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";

import type { PlayheadStore } from "@/features/audio/playhead-store";
import {
  advanceRecording,
  isRecordTarget,
  pressRecordingKey,
  releaseRecordingKey,
  startRecording,
  type QuantizedRecording,
  type RecordTrackId,
} from "@/features/sequencer/quantized-recorder";
import { getSequencerKeyCommand, type SequencerKeyCommand } from "@/features/sequencer/sequencer-keys";
import { copySteps, pasteSteps, type StepClipboard } from "@/features/sequencer/step-clipboard";
import { finishDrag, startMoveDrag, startResizeDrag, updateDrag, type StepDrag } from "@/features/sequencer/step-drag";
import { clickStep, grabStep, moveSelection, type StepSelection } from "@/features/sequencer/step-selection";
import {
  buildKeyboardNoteBindings,
  clampKeyboardBaseOctave,
  getKeyboardBaseOctaveForNote,
  normalizeKeyboardNoteKey,
} from "@/features/song/song-keyboard-input";

import { labelByTrackId } from "@/components/sequencer-theme";
import { PatternHeader } from "@/components/sequencer/pattern-header";
import type { RowAction } from "@/components/sequencer/row-action";
import {
  getKeyboardNoteTarget,
  getStepDurationMs,
  previewKeyboardNote,
  previewSongStep,
  type KeyboardNoteTarget,
} from "@/components/sequencer/step-preview";
import { VoiceLane } from "@/components/sequencer/voice-lane";
import { useStableCallback } from "@/components/use-stable-callback";

const noSelectedSteps: readonly number[] = [];

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
    if (engine !== null) {
      previewKeyboardNote(engine, song, defaultSampleId, target, note);
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
    if (engine !== null && hoverPreviewEnabled) {
      previewSongStep(engine, song, trackId, stepIndex);
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

  // Returns whether the command handled the key, so the browser default is suppressed only then.
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
    <div className="crt-rim">
      <div className="crt-glass overflow-hidden px-3 pt-3.5 pb-3 md:px-4 md:pt-4">
        {rulerVisible ? (
          <PatternHeader
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
        <div className="divide-y divide-graticule border-t border-graticule">
          {tracks.map((track) => {
            const isSelectedTrack = selection?.trackId === track.id;

            return (
              <VoiceLane
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
      </div>
    </div>
  );
}
