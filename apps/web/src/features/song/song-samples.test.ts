import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import {
  applySampleTrim,
  getTrimmedFrameCount,
  getTrimmedSamplePcm,
  moveSampleTrimWindow,
  removeSampleAsset,
  resizeSampleTrimWindow,
  updateSampleTrim,
} from "@/features/song/song-samples";

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

  it("moves the trim window while preserving its current length", () => {
    const song = createDefaultSongDocument();
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected a seeded sample.");
    }

    const trimmedSong = updateSampleTrim(song, sample.id, {
      startFrame: 2,
      endFrame: 8,
    });
    const movedSong = moveSampleTrimWindow(trimmedSong, sample.id, 4);
    const movedSample = movedSong.samples[0];

    if (movedSample === undefined) {
      throw new Error("Expected a moved sample.");
    }

    expect(movedSample.trim).toEqual({
      startFrame: 4,
      endFrame: 10,
    });
  });

  it("resizes the trim window and keeps it within the sample bounds", () => {
    const song = createDefaultSongDocument();
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected a seeded sample.");
    }

    const resizedSong = resizeSampleTrimWindow(song, sample.id, 5);
    const resizedSample = resizedSong.samples[0];

    if (resizedSample === undefined) {
      throw new Error("Expected a resized sample.");
    }

    expect(resizedSample.trim).toEqual({
      startFrame: 0,
      endFrame: 5,
    });

    const shiftedSong = updateSampleTrim(song, sample.id, {
      startFrame: 10,
      endFrame: 12,
    });
    const clampedResizeSong = resizeSampleTrimWindow(shiftedSong, sample.id, 4);
    const clampedResizeSample = clampedResizeSong.samples[0];

    if (clampedResizeSample === undefined) {
      throw new Error("Expected a resized sample.");
    }

    expect(clampedResizeSample.trim).toEqual({
      startFrame: 8,
      endFrame: 12,
    });
  });

  it("applies the current trim destructively and resets the trim window", () => {
    const song = createDefaultSongDocument();
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected a seeded sample.");
    }

    const trimmedSong = updateSampleTrim(song, sample.id, {
      startFrame: 2,
      endFrame: 8,
    });
    const committedSong = applySampleTrim(trimmedSong, sample.id);
    const committedSample = committedSong.samples[0];

    if (committedSample === undefined) {
      throw new Error("Expected a committed sample.");
    }

    expect(committedSample.pcm).toEqual(sample.pcm.slice(2, 8));
    expect(committedSample.frameCount).toBe(6);
    expect(committedSample.trim).toEqual({
      startFrame: 0,
      endFrame: 6,
    });
    expect(committedSong.meta.updatedAt).toBe("2026-03-19T10:00:00.000Z");
  });

  it("removes a sample and disables PCM steps that referenced it", () => {
    const song = createDefaultSongDocument();

    const updatedSong = removeSampleAsset(song, "mic-001");

    expect(updatedSong.samples).toHaveLength(0);
    expect(updatedSong.tracks.sample.steps[7]).toMatchObject({
      enabled: false,
      sampleId: null,
    });
    expect(updatedSong.tracks.sample.steps[15]).toMatchObject({
      enabled: false,
      sampleId: null,
    });
    expect(updatedSong.meta.updatedAt).toBe("2026-03-19T10:00:00.000Z");
  });
});
