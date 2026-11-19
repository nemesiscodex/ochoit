import { buttonVariants } from "@ochoit/ui/components/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@ochoit/ui/components/popover";
import { cn } from "@ochoit/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import type { NoteValue } from "ochoit-lib";

const baseNotes = ["C", "D", "E", "F", "G", "A", "B"] as const;
const octaves = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const notesWithSharps = new Set<string>(["C", "D", "F", "G", "A"]);
const sweetSpotOctaves = { min: 2, max: 6 } as const;

type PickerCell = { key: string; note: NoteValue | null; isSharp: boolean; octave: number };

const pickerRows = baseNotes.map((baseName) => ({
  baseName,
  cells: octaves.flatMap((octave): PickerCell[] => [
    { key: `${baseName}${octave}`, note: `${baseName}${octave}` as NoteValue, isSharp: false, octave },
    notesWithSharps.has(baseName)
      ? { key: `${baseName}#${octave}`, note: `${baseName}#${octave}` as NoteValue, isSharp: true, octave }
      : { key: `${baseName}${octave}-gap`, note: null, isSharp: true, octave },
  ]),
}));

const gridTemplate = { gridTemplateColumns: `1.5rem repeat(${octaves.length * 2}, minmax(0, 1fr))` };

export type NotePickerProps = {
  selectedNote: string;
  disabled?: boolean;
  accentColor: string;
  onSelectNote: (note: NoteValue) => void;
  onHoverNote?: (note: NoteValue) => void;
  ariaLabel: string;
};

export function NotePicker({
  selectedNote,
  disabled = false,
  accentColor,
  onSelectNote,
  onHoverNote,
  ariaLabel,
}: NotePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Claimed in the capture phase so the sequencer's document shortcut does not also clear the step selection.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "default", size: "sm" }),
          "glass-well min-w-16 justify-between gap-1 px-2 font-mono text-[13px] leading-none font-semibold text-screen-ink hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        {selectedNote}
        <ChevronDown aria-hidden="true" className="size-3.5 text-screen-muted" />
      </PopoverTrigger>
      <PopoverContent
        initialFocus='[aria-pressed="true"]'
        className="w-[min(30rem,calc(100vw-1rem))]"
        style={{ "--note-accent": accentColor } as CSSProperties}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <PopoverTitle>Note picker</PopoverTitle>
          <span className="glass-well rounded-control px-2 py-1 font-mono text-[13px] leading-none font-semibold">
            {selectedNote}
          </span>
        </div>
        <div className="grid gap-px" style={gridTemplate}>
          <span />
          {octaves.map((octave) => (
            <span
              key={octave}
              className={cn(
                "col-span-2 pb-1 text-center font-mono text-[11px] leading-none font-semibold",
                isSweetSpot(octave) ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              {octave}
            </span>
          ))}
          {pickerRows.map((row) => [
            <span
              key={`${row.baseName}-label`}
              className="flex items-center justify-center font-mono text-[11px] leading-none font-semibold text-ink-muted"
            >
              {row.baseName}
            </span>,
            ...row.cells.map((cell) =>
              cell.note === null ? (
                <span key={cell.key} aria-hidden="true" />
              ) : (
                <NoteCell
                  key={cell.key}
                  cell={cell as PickerCell & { note: NoteValue }}
                  isSelected={cell.note === selectedNote}
                  onHover={onHoverNote}
                  onSelect={(note) => {
                    onSelectNote(note);
                    setIsOpen(false);
                  }}
                />
              ),
            ),
          ])}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isSweetSpot(octave: number) {
  return octave >= sweetSpotOctaves.min && octave <= sweetSpotOctaves.max;
}

function NoteCell({
  cell,
  isSelected,
  onHover,
  onSelect,
}: {
  cell: PickerCell & { note: NoteValue };
  isSelected: boolean;
  onHover?: (note: NoteValue) => void;
  onSelect: (note: NoteValue) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Select note ${cell.note}`}
      aria-pressed={isSelected}
      className={cn(
        "flex h-7 cursor-pointer items-center justify-center rounded-[3px] font-mono text-[11px] leading-none font-semibold transition-colors duration-100 focus-visible:relative focus-visible:z-10",
        isSelected
          ? "bg-(--note-accent) text-voice-ink shadow-[0_0_10px_color-mix(in_srgb,var(--note-accent)_60%,transparent)]"
          : cn(
              cell.isSharp ? "bg-surface-sunken" : "bg-surface-1",
              isSweetSpot(cell.octave) ? "text-ink" : "text-ink-faint",
              "hover:bg-line-strong/40 hover:text-ink",
            ),
      )}
      onMouseEnter={() => {
        onHover?.(cell.note);
      }}
      onClick={() => {
        onSelect(cell.note);
      }}
    >
      {cell.isSharp ? "#" : cell.note.replace(/\d/g, "")}
    </button>
  );
}
