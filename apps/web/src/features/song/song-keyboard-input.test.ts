import { describe, expect, it } from "vitest";

import {
  buildKeyboardNoteBindings,
  clampKeyboardBaseOctave,
  getKeyboardBaseOctaveForNote,
  resolveKeyboardNoteFromKey,
} from "@/features/song/song-keyboard-input";

describe("song-keyboard-input", () => {
  it("maps lower and upper keyboard rows into note values", () => {
    expect(resolveKeyboardNoteFromKey("z", 3)).toBe("C3");
    expect(resolveKeyboardNoteFromKey("s", 3)).toBe("C#3");
    expect(resolveKeyboardNoteFromKey(",", 3)).toBe("C4");
    expect(resolveKeyboardNoteFromKey("q", 3)).toBe("C4");
    expect(resolveKeyboardNoteFromKey("2", 3)).toBe("C#4");
    expect(resolveKeyboardNoteFromKey("p", 3)).toBe("E5");
  });

  it("clamps base octaves and resolves them from notes", () => {
    expect(clampKeyboardBaseOctave(-1)).toBe(0);
    expect(clampKeyboardBaseOctave(4.7)).toBe(5);
    expect(clampKeyboardBaseOctave(12)).toBe(8);
    expect(getKeyboardBaseOctaveForNote("A#5")).toBe(5);
  });

  it("marks out-of-range bindings as unplayable at the very top of the note range", () => {
    const bindings = buildKeyboardNoteBindings(8);
    const upperE = bindings.find((binding) => binding.key === "p");
    const lowerC = bindings.find((binding) => binding.key === "z");

    expect(lowerC?.note).toBe("C8");
    expect(upperE?.note).toBeNull();
    expect(upperE?.isPlayable).toBe(false);
  });
});
