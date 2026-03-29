import { describe, expect, it } from "vitest";

import {
  createDefaultSongDocument,
  createEmptySongDocument,
  parseSongDocument,
  SONG_DOCUMENT_KIND,
  SONG_DOCUMENT_VERSION,
  SONG_MAX_SAMPLE_COUNT,
  trackOrder,
} from "@/features/song/song-document";

describe("song-document", () => {
  it("creates a valid default song document", () => {
    const song = createDefaultSongDocument();

    expect(song.kind).toBe(SONG_DOCUMENT_KIND);
    expect(song.version).toBe(SONG_DOCUMENT_VERSION);
    expect(song.mixer.masterVolume).toBe(0.75);
    expect(trackOrder.every((trackId) => song.tracks[trackId].volume === 1)).toBe(true);
    expect(trackOrder.every((trackId) => song.tracks[trackId].steps.every((step) => step.volume === 1))).toBe(true);
    expect(trackOrder.map((trackId) => song.tracks[trackId].steps.length)).toEqual([16, 16, 16, 16, 16]);
    expect(song.samples).toHaveLength(1);
  });

  it("parses a serialized song and preserves sample references", () => {
    const initialSong = createDefaultSongDocument();
    const parsedSong = parseSongDocument(JSON.parse(JSON.stringify(initialSong)));
    const activeSampleSteps = parsedSong.tracks.sample.steps.filter(
      (step) => step.enabled && step.sampleId !== null,
    );

    expect(activeSampleSteps.length).toBeGreaterThan(0);
    expect(activeSampleSteps.every((step) => parsedSong.samples.some((sample) => sample.id === step.sampleId))).toBe(
      true,
    );
  });

  it("defaults old speaker mode to off when parsing legacy song data", () => {
    const initialSong = createDefaultSongDocument();
    const serializedSong = JSON.parse(JSON.stringify(initialSong)) as typeof initialSong;
    const legacySong = {
      ...serializedSong,
      mixer: {
        masterVolume: serializedSong.mixer.masterVolume,
      },
    };

    const parsedSong = parseSongDocument(legacySong);

    expect(parsedSong.mixer.oldSpeakerMode).toBe(false);
  });

  it("creates a valid empty song document for starting from scratch", () => {
    const song = createEmptySongDocument();

    expect(song.kind).toBe(SONG_DOCUMENT_KIND);
    expect(song.version).toBe(SONG_DOCUMENT_VERSION);
    expect(song.meta.name).toBe("(No name)");
    expect(song.meta.author).toBe("(Anonymous)");
    expect(song.mixer.masterVolume).toBe(0.75);
    expect(trackOrder.every((trackId) => song.tracks[trackId].volume === 1)).toBe(true);
    expect(trackOrder.every((trackId) => song.tracks[trackId].steps.every((step) => step.volume === 1))).toBe(true);
    expect(trackOrder.map((trackId) => song.tracks[trackId].steps.length)).toEqual([16, 16, 16, 16, 16]);
    expect(trackOrder.every((trackId) => song.tracks[trackId].steps.every((step) => step.enabled === false))).toBe(
      true,
    );
    expect(song.samples).toEqual([]);
  });

  it("uses anonymous metadata defaults for seeded test songs too", () => {
    const song = createDefaultSongDocument();

    expect(song.meta.name).toBe("(No name)");
    expect(song.meta.author).toBe("(Anonymous)");
  });

  it("rejects songs with more than four embedded samples", () => {
    const song = createEmptySongDocument();
    song.samples = Array.from({ length: SONG_MAX_SAMPLE_COUNT + 1 }, (_, index) => ({
      id: `mic-${String(index + 1).padStart(3, "0")}`,
      name: `mic-${String(index + 1).padStart(3, "0")}`,
      source: "mic" as const,
      baseNote: "C4",
      detectedBaseNote: null,
      sampleRate: 11_025,
      frameCount: 1,
      channels: 1 as const,
      trim: {
        startFrame: 0,
        endFrame: 1,
      },
      pcm: [0],
    }));

    try {
      parseSongDocument(song);
      throw new Error("Expected parseSongDocument to reject extra samples.");
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      expect(error.message).toContain(`${SONG_MAX_SAMPLE_COUNT}`);
    }
  });
});
