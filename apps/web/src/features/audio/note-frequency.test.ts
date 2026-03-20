import { describe, expect, it } from "vitest";

import { getFrequencyForNote } from "@/features/audio/note-frequency";

describe("note-frequency", () => {
  it("uses A4 as the 440 Hz reference pitch", () => {
    expect(getFrequencyForNote("A4")).toBe(440);
  });

  it("maps notes to equal-temperament frequencies", () => {
    expect(getFrequencyForNote("C0")).toBeCloseTo(16.352, 3);
    expect(getFrequencyForNote("C5")).toBeCloseTo(523.251, 3);
    expect(getFrequencyForNote("B8")).toBeCloseTo(7902.133, 3);
  });

  it("doubles frequency at each octave", () => {
    expect(getFrequencyForNote("A5")).toBeCloseTo(getFrequencyForNote("A4") * 2, 10);
    expect(getFrequencyForNote("C4")).toBeCloseTo(getFrequencyForNote("C3") * 2, 10);
  });

  it("treats enharmonic sharp and flat spellings as the same pitch", () => {
    expect(getFrequencyForNote("A#4")).toBeCloseTo(getFrequencyForNote("Bb4"), 10);
    expect(getFrequencyForNote("C#3")).toBeCloseTo(getFrequencyForNote("Db3"), 10);
  });

  it("rejects invalid note names", () => {
    expect(() => getFrequencyForNote("H2")).toThrow('Invalid note "H2".');
    expect(() => getFrequencyForNote("Cb4")).toThrow('Unsupported note "Cb4".');
  });
});
