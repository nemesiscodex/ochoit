import type { NoteValue } from "ochoit-lib";

import type { SelectionDirection } from "@/features/sequencer/step-selection";
import { normalizeKeyboardNoteKey, resolveKeyboardNoteFromKey } from "@/features/song/song-keyboard-input";

export const keyboardModeShortcutKey = "\\";

export type SequencerKeyCommand =
  | { type: "toggle-keyboard-mode" }
  | { type: "record-note"; key: string; note: NoteValue }
  | { type: "enter-note"; note: NoteValue }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "shift-octave"; delta: -1 | 1 }
  | { type: "clear-selection" }
  | { type: "delete-selection" }
  | { type: "enable-anchor" }
  | { type: "move-selection"; direction: SelectionDirection };

type KeyPress = { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

type KeyboardModes = { recording: boolean; keyboardMode: boolean; baseOctave: number };

const selectionCommandByKey = new Map<string, SequencerKeyCommand>([
  ["Escape", { type: "clear-selection" }],
  ["Backspace", { type: "delete-selection" }],
  ["Delete", { type: "delete-selection" }],
  ["Enter", { type: "enable-anchor" }],
  ["ArrowLeft", { type: "move-selection", direction: "left" }],
  ["ArrowRight", { type: "move-selection", direction: "right" }],
  ["ArrowUp", { type: "move-selection", direction: "up" }],
  ["ArrowDown", { type: "move-selection", direction: "down" }],
]);

export function getSequencerKeyCommand(press: KeyPress, modes: KeyboardModes): SequencerKeyCommand | null {
  if (press.code === "Backslash" || press.key === keyboardModeShortcutKey) {
    return { type: "toggle-keyboard-mode" };
  }

  const isShortcutChord = press.metaKey || press.ctrlKey;
  const noteKey = isShortcutChord || press.altKey ? null : normalizeKeyboardNoteKey(press.key);
  const note = noteKey === null ? null : resolveKeyboardNoteFromKey(press.key, modes.baseOctave);

  if (modes.recording && noteKey !== null && note !== null) {
    return { type: "record-note", key: noteKey, note };
  }

  if (isShortcutChord) {
    const loweredKey = press.key.toLowerCase();

    if (loweredKey === "c") {
      return { type: "copy" };
    }

    if (loweredKey === "v") {
      return { type: "paste" };
    }
  }

  if (modes.keyboardMode) {
    if (!isShortcutChord && (press.key === "[" || press.key === "]")) {
      return { type: "shift-octave", delta: press.key === "[" ? -1 : 1 };
    }

    if (note !== null) {
      return { type: "enter-note", note };
    }
  }

  return selectionCommandByKey.get(press.key) ?? null;
}
