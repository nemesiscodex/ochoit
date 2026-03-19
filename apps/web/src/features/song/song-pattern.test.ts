import { describe, expect, it } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import {
  noteEntryOptions,
  parseMelodicTrackArrangement,
  replaceMelodicTrackArrangement,
  serializeMelodicTrackArrangement,
  updateMelodicTrackStep,
} from "@/features/song/song-pattern";

describe("song-pattern", () => {
  it("exposes the full note-entry range used by the melodic sequencer controls", () => {
    expect(noteEntryOptions[0]).toBe("C0");
    expect(noteEntryOptions.at(-1)).toBe("B8");
  });

  it("updates melodic steps immutably", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateMelodicTrackStep(song, "triangle", 1, {
      enabled: true,
      note: "D3",
    });

    expect(updatedSong).not.toBe(song);
    expect(updatedSong.tracks.triangle.steps[1]).toEqual({
      ...song.tracks.triangle.steps[1],
      enabled: true,
      note: "D3",
    });
    expect(updatedSong.tracks.triangle.steps[0]).toEqual(song.tracks.triangle.steps[0]);
    expect(updatedSong.tracks.noise).toEqual(song.tracks.noise);
  });

  it("ignores melodic step updates outside the loop length", () => {
    const song = createDefaultSongDocument();

    expect(updateMelodicTrackStep(song, "pulse1", -1, { enabled: false })).toBe(song);
    expect(updateMelodicTrackStep(song, "pulse1", song.transport.loopLength, { enabled: false })).toBe(song);
  });

  it("serializes the enabled melodic arrangement as step and note pairs", () => {
    const song = createDefaultSongDocument();

    expect(serializeMelodicTrackArrangement(song.tracks.pulse1)).toBe("1: C5\n5: E5\n9: G5\n13: E5");
  });

  it("parses a pasted arrangement, normalizes note casing, and ignores steps past the loop length", () => {
    const result = parseMelodicTrackArrangement("1: e4\n3: g4\n17: c5", 16);

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, note: "E4" },
        { stepIndex: 2, note: "G4" },
      ],
    });
  });

  it("rejects invalid arrangement lines", () => {
    expect(parseMelodicTrackArrangement("1 - E4", 16)).toEqual({
      ok: false,
      error: 'Line 1 must match "<step>: <note>" like "1: E4".',
    });
    expect(parseMelodicTrackArrangement("1: H4", 16)).toEqual({
      ok: false,
      error: "Line 1 has an unsupported note. Use notes from C0 to B8 with optional sharps.",
    });
  });

  it("replaces a melodic voice arrangement and clears unspecified steps", () => {
    const song = createDefaultSongDocument();
    const updatedSong = replaceMelodicTrackArrangement(song, "pulse1", [
      { stepIndex: 0, note: "E4" },
      { stepIndex: 2, note: "G4" },
    ]);

    expect(updatedSong.tracks.pulse1.steps[0]).toEqual({
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      note: "E4",
    });
    expect(updatedSong.tracks.pulse1.steps[1]).toEqual({
      ...song.tracks.pulse1.steps[1],
      enabled: false,
    });
    expect(updatedSong.tracks.pulse1.steps[2]).toEqual({
      ...song.tracks.pulse1.steps[2],
      enabled: true,
      note: "G4",
    });
  });
});
