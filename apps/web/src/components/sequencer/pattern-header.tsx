import { Toggle, ToggleGroup } from "@ochoit/ui/components/toggle";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@ochoit/ui/components/toolbar";
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
import {
  beatEdgeClass,
  laneColumnsClass,
  rowStartGutterClass,
  stepGridClass,
  stepsPerBeatGroup,
  useStepColumnCount,
} from "@/components/sequencer/grid-geometry";

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
        ? "Select empty steps, then press Enter to add."
        : keyboardModeEnabled
          ? `${keyboardTargetLabel} is armed for keyboard note entry.`
          : `${keyboardTargetLabel} is ready for keyboard note entry.`;

  return (
    <div>
      <div className="flex flex-col gap-2.5 pb-1.5 lg:flex-row lg:items-end lg:justify-between lg:gap-[18px]">
        <div className="min-w-0">
          <h2 className="glow-text font-screen text-[32px] leading-[0.9] font-normal">Pattern</h2>
          <p
            aria-live="polite"
            className={cn(
              "mt-1 text-[13.5px]",
              recordingTrackId !== null ? "font-semibold text-signal-text" : "text-ink-muted",
            )}
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
      {/* Below lg the lane head sits between this header and the steps, so the in-cell numbers do its job. */}
      <div className={cn("grid max-lg:hidden", laneColumnsClass)}>
        <div aria-hidden />
        <StepRuler isPlaying={isPlaying} loopLength={loopLength} playhead={playhead} />
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
    <Toolbar aria-label="Pattern" className="gap-x-2.5 lg:justify-end">
      <ToolbarGroup aria-label="Loop length" className="gap-1">
        <span aria-hidden className="mr-0.5 font-screen text-[21px] leading-none text-screen-muted">
          Steps
        </span>
        <ToolbarButton
          variant="screen"
          size="sm"
          className="w-10 px-0 font-mono text-[13px] font-semibold"
          aria-label={`Remove ${SONG_LOOP_LENGTH_RANGE.step} steps`}
          disabled={loopLength <= SONG_LOOP_LENGTH_RANGE.min}
          onClick={() => {
            onEdit({ type: "set-loop-length", loopLength: loopLength - SONG_LOOP_LENGTH_RANGE.step });
          }}
        >
          −{SONG_LOOP_LENGTH_RANGE.step}
        </ToolbarButton>
        <ToolbarButton
          variant="screen"
          size="sm"
          className="w-10 px-0 font-mono text-[13px] font-semibold"
          aria-label={`Add ${SONG_LOOP_LENGTH_RANGE.step} steps`}
          disabled={loopLength >= SONG_LOOP_LENGTH_RANGE.max}
          onClick={() => {
            onEdit({ type: "set-loop-length", loopLength: loopLength + SONG_LOOP_LENGTH_RANGE.step });
          }}
        >
          +{SONG_LOOP_LENGTH_RANGE.step}
        </ToolbarButton>
      </ToolbarGroup>
      <ToggleGroup
        aria-label="Recording grid"
        deselectable={false}
        value={gridChoice === null ? [] : [gridChoice]}
        className="h-8 gap-0.5 rounded-[5px] border border-screen-edge p-0.5"
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
            className="h-full rounded-[3px] border-transparent px-2.5 font-screen text-[21px] leading-none font-normal text-screen-muted hover:bg-transparent data-pressed:bg-screen-ink data-pressed:text-glass data-pressed:shadow-[0_0_10px_rgb(170_205_255/0.45)]"
          >
            {gridChoices[choice].label}
          </Toggle>
        ))}
      </ToggleGroup>
      <Toggle
        variant="screen"
        size="sm"
        aria-label={keyboardModeEnabled ? "Disable keyboard note mode" : "Enable keyboard note mode"}
        aria-keyshortcuts={keyboardModeShortcutKey}
        pressed={keyboardModeEnabled}
        onPressedChange={onToggleKeyboardMode}
      >
        <Keyboard aria-hidden="true" />
        <span className="font-screen text-[21px] leading-none font-normal">Keys</span>
        <kbd className="rounded-[3px] border border-current/40 px-1 font-screen text-[16px] leading-4">
          {keyboardModeShortcutKey}
        </kbd>
      </Toggle>
      <ToolbarGroup aria-label="Keyboard octave" className="gap-1.5">
        <ToolbarButton
          variant="screen"
          size="icon-sm"
          aria-label="Lower keyboard octave"
          aria-keyshortcuts="["
          disabled={keyboardBaseOctave <= keyboardBaseOctaveRange.min}
          onClick={onKeyboardBaseOctaveDecrease}
        >
          <Minus aria-hidden="true" />
        </ToolbarButton>
        <span className="min-w-[72px] text-center font-screen text-[22px] leading-none whitespace-nowrap">Octave {keyboardBaseOctave}</span>
        <ToolbarButton
          variant="screen"
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

// One header row names the columns; the lanes' gutters name the step each wrapped row starts on.
const StepRuler = memo(function StepRuler({
  isPlaying,
  loopLength,
  playhead,
}: {
  isPlaying: boolean;
  loopLength: number;
  playhead: PlayheadStore;
}) {
  const columnCount = useStepColumnCount();
  const isWrapped = loopLength > columnCount;

  return (
    <div aria-hidden className="flex gap-1 pt-1 pb-1.5">
      {isWrapped ? <div className={rowStartGutterClass} /> : null}
      <div className={cn(stepGridClass, "min-w-0 flex-1")}>
        {Array.from({ length: Math.min(loopLength, columnCount) }, (_, column) => (
          <RulerStepCell
            key={column}
            column={column}
            columnCount={columnCount}
            isPlaying={isPlaying}
            playhead={playhead}
          />
        ))}
      </div>
    </div>
  );
});

const RulerStepCell = memo(function RulerStepCell({
  column,
  columnCount,
  isPlaying,
  playhead,
}: {
  column: number;
  columnCount: number;
  isPlaying: boolean;
  playhead: PlayheadStore;
}) {
  const isActive = usePlayheadSelector(playhead, ({ nextStep }) => isPlaying && nextStep % columnCount === column);

  return (
    <div
      aria-current={isActive ? "step" : undefined}
      className={cn(
        "rounded-[3px] py-1 text-center font-mono text-[12px] leading-none font-semibold",
        beatEdgeClass(column),
        column % stepsPerBeatGroup === 0 ? "text-ink" : "text-ink-muted",
        isActive && "beam text-beam",
      )}
    >
      {column + 1}
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
    <div className="mt-1.5 mb-2 rounded-panel border border-line bg-surface-sunken/70 p-2.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-semibold">
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
        "flex min-w-0 flex-col items-center gap-[3px] overflow-hidden rounded-[4px] border px-px py-1 transition-[background-color,translate] duration-75",
        binding.lane === "black" ? "border-line-strong bg-surface-sunken" : "border-line-strong bg-surface-2",
        !binding.isPlayable && "opacity-40",
        isSelected && "border-ink shadow-[0_0_8px_color-mix(in_srgb,var(--ink)_40%,transparent)]",
        isPressed && "translate-y-px bg-screen-edge/40",
      )}
    >
      <span className="font-mono text-[12px] leading-none font-semibold whitespace-nowrap max-[400px]:text-[10px]">
        {binding.note ?? "·"}
      </span>
      <span className="text-[11px] leading-none text-ink-muted">{binding.keyLabel}</span>
    </div>
  );
}
