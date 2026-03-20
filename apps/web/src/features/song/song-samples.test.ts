import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import { getTrimmedFrameCount, getTrimmedSamplePcm, updateSampleTrim } from "@/features/song/song-samples";

describe("song-samples", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the trimmed PCM slice and frame count", () => {
    const song = createDefaultSongDocument();
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected a seeded sample.");
    }

    const trimmedSong = updateSampleTrim(song, sample.id, {
      startFrame: 2,
      endFrame: 8,
    });
    const trimmedSample = trimmedSong.samples[0];

    if (trimmedSample === undefined) {
      throw new Error("Expected a trimmed sample.");
    }

    expect(getTrimmedFrameCount(trimmedSample)).toBe(6);
    expect(getTrimmedSamplePcm(trimmedSample)).toEqual(sample.pcm.slice(2, 8));
  });

  it("clamps trim updates to valid bounds and updates the timestamp", () => {
    const song = createDefaultSongDocument();
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected a seeded sample.");
    }

    const startClampedSong = updateSampleTrim(song, sample.id, {
      startFrame: sample.frameCount + 4,
    });
    const startClampedSample = startClampedSong.samples[0];

    if (startClampedSample === undefined) {
      throw new Error("Expected a trimmed sample.");
    }

    expect(startClampedSample.trim).toEqual({
      startFrame: sample.trim.endFrame,
      endFrame: sample.trim.endFrame,
    });
    expect(startClampedSong.meta.updatedAt).toBe("2026-03-19T10:00:00.000Z");

    const endClampedSong = updateSampleTrim(song, sample.id, {
      endFrame: -20,
    });
    const endClampedSample = endClampedSong.samples[0];

    if (endClampedSample === undefined) {
      throw new Error("Expected a trimmed sample.");
    }

    expect(endClampedSample.trim).toEqual({
      startFrame: sample.trim.startFrame,
      endFrame: sample.trim.startFrame,
    });
  });
});
