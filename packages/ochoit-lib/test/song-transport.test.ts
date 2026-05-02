import { describe, expect, it } from "vitest";

import { defaultDpcmRate } from "../src/core/dpcm";
import { createDefaultSongDocument, createEmptySongDocument } from "../src/core/song-document";
import {
  canUpdateSongStepsPerBeat,
  clampSongBpm,
  clampSongLoopLength,
  resolveSongBpmInput,
  resolveSongLoopLengthInput,
  SONG_EIGHTH_GRID_STEPS_PER_BEAT,
  songLoopLengthWouldTrimContent,
  updateSongStepsPerBeat,
  updateSongTransport,
} from "../src/core/song-transport";

describe("song-transport", () => {
  it("clamps bpm and loop length to the supported transport ranges", () => {
    expect(clampSongBpm(20)).toBe(40);
    expect(clampSongBpm(1001)).toBe(1000);
    expect(clampSongLoopLength(2)).toBe(4);
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

  it("expands song timing to the 1/8 grid while preserving musical positions", () => {
    const song = createEmptySongDocument();
    song.transport.loopLength = 16;
    song.transport.stepsPerBeat = 4;
    song.tracks.pulse1.steps[2] = {
      ...song.tracks.pulse1.steps[2],
      enabled: true,
      note: "D4",
      length: 3,
    };
    song.tracks.noise.steps[5] = {
      ...song.tracks.noise.steps[5],
      enabled: true,
      periodIndex: 3,
    };
    song.tracks.sample.steps[7] = {
      ...song.tracks.sample.steps[7],
      enabled: true,
      sampleId: "mic-001",
      note: "E4",
    };

    const updatedSong = updateSongStepsPerBeat(song, SONG_EIGHTH_GRID_STEPS_PER_BEAT);

    expect(updatedSong.transport.stepsPerBeat).toBe(8);
    expect(updatedSong.transport.loopLength).toBe(32);
    expect(updatedSong.tracks.pulse1.steps[4]).toMatchObject({ enabled: true, note: "D4", length: 6 });
    expect(updatedSong.tracks.pulse1.steps[2]?.enabled).toBe(false);
    expect(updatedSong.tracks.noise.steps[10]).toMatchObject({ enabled: true, periodIndex: 3 });
    expect(updatedSong.tracks.sample.steps[14]).toMatchObject({ enabled: true, sampleId: "mic-001", note: "E4" });
  });

  it("rejects timing expansion that would exceed the maximum loop length", () => {
    const song = createEmptySongDocument();
    song.transport.loopLength = 128;
    song.transport.stepsPerBeat = 4;

    expect(canUpdateSongStepsPerBeat(song, 8)).toBe(false);
    expect(updateSongStepsPerBeat(song, 8)).toBe(song);
  });

  it("collapses timing only when all events and note ends align to the target grid", () => {
    const alignedSong = createEmptySongDocument();
    alignedSong.transport.loopLength = 32;
    alignedSong.transport.stepsPerBeat = 8;
    alignedSong.tracks.pulse1.steps[4] = {
      ...alignedSong.tracks.pulse1.steps[4],
      enabled: true,
      note: "F4",
      length: 6,
    };
    alignedSong.tracks.sample.steps[10] = {
      ...alignedSong.tracks.sample.steps[10],
      enabled: true,
      sampleId: "mic-001",
    };

    const collapsedSong = updateSongStepsPerBeat(alignedSong, 4);

    expect(collapsedSong.transport).toMatchObject({ stepsPerBeat: 4, loopLength: 16 });
    expect(collapsedSong.tracks.pulse1.steps[2]).toMatchObject({ enabled: true, note: "F4", length: 3 });
    expect(collapsedSong.tracks.sample.steps[5]).toMatchObject({ enabled: true, sampleId: "mic-001" });

    const offGridSong = createEmptySongDocument();
    offGridSong.transport.loopLength = 32;
    offGridSong.transport.stepsPerBeat = 8;
    offGridSong.tracks.pulse1.steps[5] = {
      ...offGridSong.tracks.pulse1.steps[5],
      enabled: true,
      length: 2,
    };

    expect(canUpdateSongStepsPerBeat(offGridSong, 4)).toBe(false);
    expect(updateSongStepsPerBeat(offGridSong, 4)).toBe(offGridSong);
  });
});
