import { describe, expect, it } from "vitest";

import {
  createDefaultSongDocument,
  parseSongDocument,
  SONG_DOCUMENT_KIND,
  SONG_DOCUMENT_VERSION,
  trackOrder,
} from "@/features/song/song-document";

describe("song-document", () => {
  it("creates a valid default song document", () => {
    const song = createDefaultSongDocument();

    expect(song.kind).toBe(SONG_DOCUMENT_KIND);
    expect(song.version).toBe(SONG_DOCUMENT_VERSION);
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
});
