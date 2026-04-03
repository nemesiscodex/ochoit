const semitoneByNoteName = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
} as const satisfies Record<string, number>;

export function getFrequencyForNote(note: string) {
  const match = /^([A-G](?:#|b)?)([0-8])$/.exec(note);

  if (match === null) {
    throw new Error(`Invalid note "${note}".`);
  }

  const [, noteName, octaveValue] = match;
  const semitone = semitoneByNoteName[noteName as keyof typeof semitoneByNoteName];

  if (semitone === undefined) {
    throw new Error(`Unsupported note "${note}".`);
  }

  const octave = Number(octaveValue);
  const midiNote = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midiNote - 69) / 12);
}
