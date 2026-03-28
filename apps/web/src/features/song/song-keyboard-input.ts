import type { NoteValue } from "@/features/song/song-pattern";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const maxNoteIndex = 107;

type KeyboardBindingDefinition = {
  key: string;
  keyLabel: string;
  noteName: string;
  semitoneOffset: number;
  lane: "white" | "black";
  row: "lower" | "upper";
};

export type KeyboardNoteBinding = KeyboardBindingDefinition & {
  note: NoteValue | null;
  isPlayable: boolean;
};

const keyboardBindingDefinitions: readonly KeyboardBindingDefinition[] = [
  { key: "z", keyLabel: "Z", noteName: "C", semitoneOffset: 0, lane: "white", row: "lower" },
  { key: "x", keyLabel: "X", noteName: "D", semitoneOffset: 2, lane: "white", row: "lower" },
  { key: "c", keyLabel: "C", noteName: "E", semitoneOffset: 4, lane: "white", row: "lower" },
  { key: "v", keyLabel: "V", noteName: "F", semitoneOffset: 5, lane: "white", row: "lower" },
  { key: "b", keyLabel: "B", noteName: "G", semitoneOffset: 7, lane: "white", row: "lower" },
  { key: "n", keyLabel: "N", noteName: "A", semitoneOffset: 9, lane: "white", row: "lower" },
  { key: "m", keyLabel: "M", noteName: "B", semitoneOffset: 11, lane: "white", row: "lower" },
  { key: ",", keyLabel: ",", noteName: "C", semitoneOffset: 12, lane: "white", row: "lower" },
  { key: ".", keyLabel: ".", noteName: "D", semitoneOffset: 14, lane: "white", row: "lower" },
  { key: "/", keyLabel: "/", noteName: "E", semitoneOffset: 16, lane: "white", row: "lower" },
  { key: "s", keyLabel: "S", noteName: "C#", semitoneOffset: 1, lane: "black", row: "lower" },
  { key: "d", keyLabel: "D", noteName: "D#", semitoneOffset: 3, lane: "black", row: "lower" },
  { key: "g", keyLabel: "G", noteName: "F#", semitoneOffset: 6, lane: "black", row: "lower" },
  { key: "h", keyLabel: "H", noteName: "G#", semitoneOffset: 8, lane: "black", row: "lower" },
  { key: "j", keyLabel: "J", noteName: "A#", semitoneOffset: 10, lane: "black", row: "lower" },
  { key: "l", keyLabel: "L", noteName: "C#", semitoneOffset: 13, lane: "black", row: "lower" },
  { key: ";", keyLabel: ";", noteName: "D#", semitoneOffset: 15, lane: "black", row: "lower" },
  { key: "q", keyLabel: "Q", noteName: "C", semitoneOffset: 12, lane: "white", row: "upper" },
  { key: "w", keyLabel: "W", noteName: "D", semitoneOffset: 14, lane: "white", row: "upper" },
  { key: "e", keyLabel: "E", noteName: "E", semitoneOffset: 16, lane: "white", row: "upper" },
  { key: "r", keyLabel: "R", noteName: "F", semitoneOffset: 17, lane: "white", row: "upper" },
  { key: "t", keyLabel: "T", noteName: "G", semitoneOffset: 19, lane: "white", row: "upper" },
  { key: "y", keyLabel: "Y", noteName: "A", semitoneOffset: 21, lane: "white", row: "upper" },
  { key: "u", keyLabel: "U", noteName: "B", semitoneOffset: 23, lane: "white", row: "upper" },
  { key: "i", keyLabel: "I", noteName: "C", semitoneOffset: 24, lane: "white", row: "upper" },
  { key: "o", keyLabel: "O", noteName: "D", semitoneOffset: 26, lane: "white", row: "upper" },
  { key: "p", keyLabel: "P", noteName: "E", semitoneOffset: 28, lane: "white", row: "upper" },
  { key: "2", keyLabel: "2", noteName: "C#", semitoneOffset: 13, lane: "black", row: "upper" },
  { key: "3", keyLabel: "3", noteName: "D#", semitoneOffset: 15, lane: "black", row: "upper" },
  { key: "5", keyLabel: "5", noteName: "F#", semitoneOffset: 18, lane: "black", row: "upper" },
  { key: "6", keyLabel: "6", noteName: "G#", semitoneOffset: 20, lane: "black", row: "upper" },
  { key: "7", keyLabel: "7", noteName: "A#", semitoneOffset: 22, lane: "black", row: "upper" },
  { key: "9", keyLabel: "9", noteName: "C#", semitoneOffset: 25, lane: "black", row: "upper" },
  { key: "0", keyLabel: "0", noteName: "D#", semitoneOffset: 27, lane: "black", row: "upper" },
] as const;

const keyboardBindingDefinitionByKey = new Map(
  keyboardBindingDefinitions.map((binding) => [binding.key, binding] as const),
);

export function clampKeyboardBaseOctave(value: number) {
  return Math.min(8, Math.max(0, Math.round(value)));
}

export function getKeyboardBaseOctaveForNote(note: NoteValue) {
  return clampKeyboardBaseOctave(Number(note.slice(-1)));
}

export function buildKeyboardNoteBindings(baseOctave: number): KeyboardNoteBinding[] {
  const normalizedBaseOctave = clampKeyboardBaseOctave(baseOctave);

  return keyboardBindingDefinitions.map((binding) => {
    const note = resolveKeyboardBindingNote(binding, normalizedBaseOctave);

    return {
      ...binding,
      note,
      isPlayable: note !== null,
    };
  });
}

export function resolveKeyboardNoteFromKey(key: string, baseOctave: number): NoteValue | null {
  const normalizedKey = normalizeKeyboardNoteKey(key);

  if (normalizedKey === null) {
    return null;
  }

  const binding = keyboardBindingDefinitionByKey.get(normalizedKey);

  if (binding === undefined) {
    return null;
  }

  return resolveKeyboardBindingNote(binding, baseOctave);
}

export function normalizeKeyboardNoteKey(key: string) {
  if (key.length !== 1) {
    return null;
  }

  return /^[a-z]$/i.test(key) ? key.toLowerCase() : key;
}

function resolveKeyboardBindingNote(binding: KeyboardBindingDefinition, baseOctave: number): NoteValue | null {
  const normalizedBaseOctave = clampKeyboardBaseOctave(baseOctave);
  const noteIndex = normalizedBaseOctave * 12 + binding.semitoneOffset;

  if (noteIndex < 0 || noteIndex > maxNoteIndex) {
    return null;
  }

  const octave = Math.floor(noteIndex / 12);
  const noteName = noteNames[noteIndex % 12];

  return `${noteName}${octave}` as NoteValue;
}
