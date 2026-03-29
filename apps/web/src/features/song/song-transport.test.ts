import { describe, expect, it } from "vitest";

import { defaultDpcmRate } from "@/features/audio/dpcm";
import { createDefaultSongDocument, createEmptySongDocument } from "@/features/song/song-document";
import {
  clampSongBpm,
  clampSongLoopLength,
  resolveSongBpmInput,
  resolveSongLoopLengthInput,
  songLoopLengthWouldTrimContent,
  updateSongTransport,
} from "@/features/song/song-transport";

describe("song-transport", () => {
  it("clamps bpm and loop length to the supported transport ranges", () => {
    expect(clampSongBpm(20)).toBe(40);
    expect(clampSongBpm(251)).toBe(240);
    expect(clampSongLoopLength(6)).toBe(8);
    expect(clampSongLoopLength(19)).toBe(20);
    expect(clampSongLoopLength(66)).toBe(68);
    expect(clampSongLoopLength(140)).toBe(128);
  });

  it("falls back to the current transport values for invalid text input", () => {
    expect(resolveSongBpmInput("", 136)).toBe(136);
    expect(resolveSongLoopLengthInput("loop", 16)).toBe(16);
  });

  it("updates bpm and resizes every track when the loop length changes", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateSongTransport(song, {
      bpm: 180,
      loopLength: 20,
    });

    expect(updatedSong.transport).toEqual({
      ...song.transport,
      bpm: 180,
      loopLength: 20,
    });
    expect(updatedSong.tracks.pulse1.steps).toHaveLength(20);
    expect(updatedSong.tracks.sample.steps).toHaveLength(20);
    expect(updatedSong.tracks.pulse1.steps[0]).toEqual(song.tracks.pulse1.steps[0]);
    expect(updatedSong.tracks.pulse1.steps[19]).toEqual({
      enabled: false,
      note: "C4",
      volume: song.tracks.pulse1.volume,
      duty: 0.5,
      length: 1,
    });
    expect(updatedSong.tracks.sample.steps[19]).toEqual({
      enabled: false,
      volume: song.tracks.sample.volume,
      sampleId: null,
      note: "C4",
      playbackRate: defaultDpcmRate,
    });
  });

  it("detects when shrinking the loop would remove or shorten existing content", () => {
    const song = createDefaultSongDocument();

    song.tracks.pulse1.steps[10] = {
      ...song.tracks.pulse1.steps[10],
      enabled: true,
      length: 4,
    };

    expect(songLoopLengthWouldTrimContent(song, 12)).toBe(true);
  });

  it("ignores safe loop reductions that keep all existing content intact", () => {
    const song = createEmptySongDocument();

    song.tracks.noise.steps[7] = {
      ...song.tracks.noise.steps[7],
      enabled: true,
    };

    expect(songLoopLengthWouldTrimContent(song, 12)).toBe(false);
  });
});
