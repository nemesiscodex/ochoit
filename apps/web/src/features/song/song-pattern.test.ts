import { describe, expect, it } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import { noteEntryOptions, updateMelodicTrackStep } from "@/features/song/song-pattern";

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
});
