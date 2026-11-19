import { Toggle, ToggleGroup } from "@ochoit/ui/components/toggle";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "@ochoit/ui/components/toolbar";
import { cn } from "@ochoit/ui/lib/utils";
import { Keyboard, Minus, Plus } from "lucide-react";
import {
  SONG_BEAT_GRID_STEPS_PER_BEAT,
  SONG_EIGHTH_GRID_STEPS_PER_BEAT,
  SONG_LOOP_LENGTH_RANGE,
  type NoteValue,
  type SongEdit,
} from "ochoit-lib";
import { memo } from "react";

import type { PlayheadStore } from "@/features/audio/playhead-store";
import { usePlayheadSelector } from "@/features/audio/use-playhead-selector";
import type { RecordTrackId } from "@/features/sequencer/quantized-recorder";
import { keyboardModeShortcutKey } from "@/features/sequencer/sequencer-keys";
import type { KeyboardNoteBinding } from "@/features/song/song-keyboard-input";
import { labelByTrackId } from "@/components/sequencer-theme";
import { beatEdgeClass, laneColumnsClass, stepGridClass, stepsPerBeatGroup } from "@/components/sequencer/grid-geometry";

const keyboardBaseOctaveRange = { min: 0, max: 8 } as const;
const gridChoices = {
  beat: { stepsPerBeat: SONG_BEAT_GRID_STEPS_PER_BEAT, label: "Beat", name: "Use beat grid recording" },
  eighth: { stepsPerBeat: SONG_EIGHTH_GRID_STEPS_PER_BEAT, label: "1/8", name: "Use 1/8 grid recording" },
} as const;

type GridChoice = keyof typeof gridChoices;

export const PatternHeader = memo(function PatternHeader({
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
  keyboardBindings: readonly KeyboardNoteBinding[];
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
    <div className="border-b border-line">
      <div className="flex flex-col gap-3 px-3 pt-3 pb-2 lg:flex-row lg:items-start lg:justify-between lg:px-4">
        <div className="min-w-0">
          <h2 className="font-wide text-base font-bold">Pattern ruler</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {loopLength} step loop. Select empty steps, then press Enter to add.
          </p>
          <p
            aria-live="polite"
            className={cn("mt-0.5 text-sm", recordingTrackId !== null ? "font-semibold text-signal-text" : "text-ink-muted")}
          >
            {keyboardTargetSummary}
          </p>
        </div>
        <PatternToolbar
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
      {keyboardModeEnabled || keyboardTargetLabel !== null ? (
        <KeyboardPreview
          activeKeyboardKey={activeKeyboardKey}
          bindings={keyboardBindings}
          keyboardModeEnabled={keyboardModeEnabled}
          selectedNote={keyboardTargetNote}
        />
      ) : null}
      <div className={cn("grid", laneColumnsClass)}>
        <div aria-hidden className="hidden lg:block" />
        <div className="px-3 pt-1 pb-2">
          <StepRuler isPlaying={isPlaying} loopLength={loopLength} playhead={playhead} />
        </div>
      </div>
    </div>
  );
});

// The toolbar does not read the selection, so selecting a step re-renders only the summary text.
const PatternToolbar = memo(function PatternToolbar({
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
  const gridChoice: GridChoice | null =
    stepsPerBeat === SONG_BEAT_GRID_STEPS_PER_BEAT ? "beat" : stepsPerBeat === SONG_EIGHTH_GRID_STEPS_PER_BEAT ? "eighth" : null;
  const canUseGrid: Record<GridChoice, boolean> = { beat: canUseBeatGrid, eighth: canUseEighthGrid };

  return (
    <Toolbar aria-label="Pattern" className="lg:justify-end">
      <ToolbarGroup aria-label="Loop length">
        <ToolbarButton
          size="icon-sm"
          aria-label="Remove 4 steps"
          disabled={loopLength <= SONG_LOOP_LENGTH_RANGE.min}
          onClick={() => {
            onEdit({ type: "set-loop-length", loopLength: loopLength - SONG_LOOP_LENGTH_RANGE.step });
          }}
        >
          <Minus aria-hidden="true" />
        </ToolbarButton>
        <span className="min-w-16 text-center text-sm font-semibold tabular-nums">{loopLength} steps</span>
        <ToolbarButton
          size="icon-sm"
          aria-label="Add 4 steps"
          disabled={loopLength >= SONG_LOOP_LENGTH_RANGE.max}
          onClick={() => {
            onEdit({ type: "set-loop-length", loopLength: loopLength + SONG_LOOP_LENGTH_RANGE.step });
          }}
        >
          <Plus aria-hidden="true" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToggleGroup
        aria-label="Recording grid"
        deselectable={false}
        value={gridChoice === null ? [] : [gridChoice]}
        className="h-8 gap-0.5 rounded-control border border-line bg-surface-sunken p-0.5"
        onValueChange={(next) => {
          const choice = next[0] as GridChoice | undefined;

          if (choice !== undefined && choice in gridChoices) {
            onEdit({ type: "set-steps-per-beat", stepsPerBeat: gridChoices[choice].stepsPerBeat });
          }
        }}
      >
        {(Object.keys(gridChoices) as GridChoice[]).map((choice) => (
          <Toggle
            key={choice}
            value={choice}
            size="xs"
            aria-label={gridChoices[choice].name}
            disabled={!canUseGrid[choice]}
            className="h-full rounded-[4px] border-transparent data-pressed:border-line data-pressed:bg-surface-2 data-pressed:text-ink data-pressed:shadow-raised"
          >
            {gridChoices[choice].label}
          </Toggle>
        ))}
      </ToggleGroup>
      <ToolbarSeparator />
      <Toggle
        size="sm"
        aria-label={keyboardModeEnabled ? "Disable keyboard note mode" : "Enable keyboard note mode"}
        aria-keyshortcuts={keyboardModeShortcutKey}
        pressed={keyboardModeEnabled}
        onPressedChange={onToggleKeyboardMode}
      >
        <Keyboard aria-hidden="true" />
        Keys
        <kbd className="rounded-[3px] border border-current/30 px-1 text-[11px] leading-4 font-medium opacity-70">
          {keyboardModeShortcutKey}
        </kbd>
      </Toggle>
      <ToolbarGroup aria-label="Keyboard octave">
        <ToolbarButton
          size="icon-sm"
          aria-label="Lower keyboard octave"
          aria-keyshortcuts="["
          disabled={keyboardBaseOctave <= keyboardBaseOctaveRange.min}
          onClick={onKeyboardBaseOctaveDecrease}
        >
          <Minus aria-hidden="true" />
        </ToolbarButton>
        <span className="min-w-20 text-center text-sm tabular-nums">Octave {keyboardBaseOctave}</span>
        <ToolbarButton
          size="icon-sm"
          aria-label="Raise keyboard octave"
          aria-keyshortcuts="]"
          disabled={keyboardBaseOctave >= keyboardBaseOctaveRange.max}
          onClick={onKeyboardBaseOctaveIncrease}
        >
          <Plus aria-hidden="true" />
        </ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  );
});

const StepRuler = memo(function StepRuler({
  isPlaying,
  loopLength,
  playhead,
}: {
  isPlaying: boolean;
  loopLength: number;
  playhead: PlayheadStore;
}) {
  return (
    <div aria-hidden className={stepGridClass}>
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

  return (
    <div
      aria-current={isActive ? "step" : undefined}
      className={cn(
        "rounded-[4px] py-0.5 text-center text-[11px] tabular-nums",
        beatEdgeClass(index),
        isActive
          ? "bg-ink font-bold text-surface-1"
          : index % stepsPerBeatGroup === 0
            ? "font-semibold text-ink-muted"
            : "text-ink-faint",
      )}
    >
      {index + 1}
    </div>
  );
});

const KeyboardPreview = memo(function KeyboardPreview({
  activeKeyboardKey,
  bindings,
  keyboardModeEnabled,
  selectedNote,
}: {
  activeKeyboardKey: string | null;
  bindings: readonly KeyboardNoteBinding[];
  keyboardModeEnabled: boolean;
  selectedNote: NoteValue | null;
}) {
  return (
    <div className="mx-3 mb-2 rounded-panel border border-line bg-surface-sunken p-2.5 lg:mx-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold">
          Keyboard notes <span className="font-normal text-ink-muted">{keyboardModeEnabled ? "Live note entry" : "Preview layout"}</span>
        </p>
        <p className="text-xs text-ink-muted">
          Note keys follow the classic tracker layout. Press note keys directly, or use Enter first on an empty step.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <KeyboardBindingRow
          activeKeyboardKey={activeKeyboardKey}
          bindings={bindings.filter((binding) => binding.row === "lower")}
          selectedNote={selectedNote}
        />
        <KeyboardBindingRow
          activeKeyboardKey={activeKeyboardKey}
          bindings={bindings.filter((binding) => binding.row === "upper")}
          selectedNote={selectedNote}
        />
      </div>
    </div>
  );
});

function KeyboardBindingRow({
  activeKeyboardKey,
  bindings,
  selectedNote,
}: {
  activeKeyboardKey: string | null;
  bindings: readonly KeyboardNoteBinding[];
  selectedNote: NoteValue | null;
}) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 px-[5%]">
        {bindings
          .filter((binding) => binding.lane === "black")
          .map((binding) => (
            <KeyboardBindingKey key={binding.key} activeKeyboardKey={activeKeyboardKey} binding={binding} selectedNote={selectedNote} />
          ))}
      </div>
      <div className="grid grid-cols-10 gap-1">
        {bindings
          .filter((binding) => binding.lane === "white")
          .map((binding) => (
            <KeyboardBindingKey key={binding.key} activeKeyboardKey={activeKeyboardKey} binding={binding} selectedNote={selectedNote} />
          ))}
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
  binding: KeyboardNoteBinding;
  selectedNote: NoteValue | null;
}) {
  const isPressed = activeKeyboardKey === binding.key;
  const isSelected = binding.note !== null && binding.note === selectedNote;

  return (
    <div
      data-keyboard-key={binding.key}
      aria-label={`${binding.keyLabel} keyboard note ${binding.note ?? "unavailable"}`}
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-1 rounded-[4px] border px-1.5 py-1 text-xs tabular-nums transition-[background-color,translate] duration-75",
        binding.lane === "black" ? "border-line-strong bg-surface-1" : "border-line bg-surface-2",
        !binding.isPlayable && "opacity-40",
        isSelected && "border-ink font-bold",
        isPressed && "translate-y-px bg-line",
      )}
    >
      <span className="truncate font-semibold">{binding.note ?? "None"}</span>
      <span className="text-[11px] text-ink-faint">{binding.keyLabel}</span>
    </div>
  );
}
