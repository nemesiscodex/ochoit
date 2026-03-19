import { cn } from "@ochoit/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { NoteValue } from "@/features/song/song-pattern";

/* ── Constants ── */

const baseNotes = ["C", "D", "E", "F", "G", "A", "B"] as const;
const octaves = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

const sharpNotes = new Set(["C", "D", "F", "G", "A"]);

/** NES sweet spot — these octaves are dimmed less */
const sweetSpotMin = 2;
const sweetSpotMax = 6;

/** A single cell in the picker grid — null note means empty placeholder */
type PickerCell = { note: NoteValue; label: string } | { note: null; label: "" };

function buildRowCells(baseName: string): PickerCell[] {
  const cells: PickerCell[] = [];
  const hasSharp = sharpNotes.has(baseName);

  for (const oct of octaves) {
    cells.push({
      note: `${baseName}${oct}` as NoteValue,
      label: `${baseName}${oct}`,
    });

    if (hasSharp) {
      cells.push({
        note: `${baseName}#${oct}` as NoteValue,
        label: `${baseName}#${oct}`,
      });
    } else {
      cells.push({ note: null, label: "" });
    }
  }

  return cells;
}

const gridRows = baseNotes.map((name) => ({
  baseName: name,
  cells: buildRowCells(name),
}));

/** Total data columns = 9 octaves × 2 (natural + sharp) = 18 */
const columnCount = 18;

/* ── Component ── */

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });

  const openPicker = useCallback(() => {
    if (disabled) return;

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const panelWidth = 480;
    const panelHeight = 280;

    let top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - panelWidth / 2;

    // Keep within viewport
    if (left < 8) left = 8;
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    if (top + panelHeight > window.innerHeight - 8) {
      top = rect.top - panelHeight - 6;
    }

    setPanelPosition({ top, left });
    setIsOpen(true);
  }, [disabled]);

  const closePicker = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback(
    (note: NoteValue) => {
      onSelectNote(note);
      closePicker();
    },
    [onSelectNote, closePicker],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePicker();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePicker]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "oc-note-trigger flex h-6 w-full items-center justify-center rounded-sm border border-white/[0.08] bg-[var(--oc-bg)] font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] text-white transition-all",
          "hover:border-white/20 hover:bg-white/[0.04]",
          "focus-visible:border-[var(--oc-accent)]/50 focus-visible:outline-none",
          disabled && "cursor-not-allowed opacity-30",
          isOpen && "border-white/25 bg-white/[0.06]",
        )}
        onClick={openPicker}
      >
        {selectedNote}
      </button>

      {isOpen ? (
        <NotePickerOverlay
          accentColor={accentColor}
          panelPosition={panelPosition}
          selectedNote={selectedNote}
          onClose={closePicker}
          onSelect={handleSelect}
          onHoverNote={onHoverNote}
        />
      ) : null}
    </>
  );
}

/* ── Floating Overlay ── */

function NotePickerOverlay({
  accentColor,
  panelPosition,
  selectedNote,
  onClose,
  onSelect,
  onHoverNote,
}: {
  accentColor: string;
  panelPosition: { top: number; left: number };
  selectedNote: string;
  onClose: () => void;
  onSelect: (note: NoteValue) => void;
  onHoverNote?: (note: NoteValue) => void;
}) {
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Note picker"
        className="oc-note-picker-panel fixed z-[201] overflow-hidden rounded-lg border border-white/[0.1] bg-[#0a0c16] shadow-2xl shadow-black/60"
        style={{
          top: panelPosition.top,
          left: panelPosition.left,
          width: 480,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <span className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Select Note
          </span>
          <span
            className="rounded-sm px-1.5 py-0.5 font-[var(--oc-mono)] text-[10px] font-bold uppercase"
            style={{ color: accentColor, backgroundColor: `${accentColor}15` }}
          >
            {selectedNote}
          </span>
        </div>

        {/* Octave header row */}
        <div className="border-b border-white/[0.04] px-3 py-1.5">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `32px repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {/* Label spacer */}
            <div />
            {/* Octave labels spanning 2 columns each */}
            {octaves.map((oct) => (
              <div
                key={`oct-header-${oct}`}
                className={cn(
                  "col-span-2 text-center font-[var(--oc-mono)] text-[8px] font-medium uppercase tracking-[0.14em]",
                  oct >= sweetSpotMin && oct <= sweetSpotMax ? "text-white/40" : "text-white/15",
                )}
              >
                {oct}
              </div>
            ))}
          </div>
        </div>

        {/* Note grid */}
        <div className="p-2">
          <div className="flex flex-col gap-px">
            {gridRows.map((row) => (
              <div
                key={row.baseName}
                className="grid gap-px"
                style={{ gridTemplateColumns: `32px repeat(${columnCount}, minmax(0, 1fr))` }}
              >
                {/* Row label */}
                <div className="flex items-center justify-center font-[var(--oc-mono)] text-[9px] font-bold text-white/50">
                  {row.baseName}
                </div>

                {/* Cells */}
                {row.cells.map((cell, cellIndex) => {
                  if (cell.note === null) {
                    return (
                      <div
                        key={`empty-${row.baseName}-${cellIndex}`}
                        className="rounded-[2px] bg-white/[0.01]"
                      />
                    );
                  }

                  const isSelected = cell.note === selectedNote;
                  const isSharp = cell.label.includes("#");
                  const octave = Number(cell.label.replace(/[^0-8]/g, ""));
                  const inSweetSpot = octave >= sweetSpotMin && octave <= sweetSpotMax;

                  return (
                    <button
                      key={cell.note}
                      type="button"
                      aria-label={`Select note ${cell.note}`}
                      className={cn(
                        "oc-note-cell flex h-[26px] items-center justify-center rounded-[2px] font-[var(--oc-mono)] text-[8px] font-medium uppercase transition-all",
                        isSelected
                          ? "font-bold text-white shadow-sm"
                          : isSharp
                            ? inSweetSpot
                              ? "bg-white/[0.06] text-white/50 hover:bg-white/[0.12] hover:text-white"
                              : "bg-white/[0.03] text-white/20 hover:bg-white/[0.08] hover:text-white/50"
                            : inSweetSpot
                              ? "bg-white/[0.03] text-white/60 hover:bg-white/[0.1] hover:text-white"
                              : "bg-white/[0.015] text-white/25 hover:bg-white/[0.06] hover:text-white/45",
                      )}
                      style={
                        isSelected
                          ? {
                              backgroundColor: `${accentColor}25`,
                              borderColor: accentColor,
                              border: `1px solid ${accentColor}`,
                              boxShadow: `0 0 8px ${accentColor}30`,
                            }
                          : undefined
                      }
                      onMouseEnter={() => {
                        onHoverNote?.(cell.note);
                      }}
                      onClick={() => {
                        onSelect(cell.note);
                      }}
                    >
                      {isSharp ? "#" : cell.label.replace(/[0-8]/g, "")}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
