import { describe, expect, it } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import {
  noteEntryOptions,
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
  serializeMelodicTrackArrangement,
  serializeNoiseTrackArrangement,
  serializeSampleTrackArrangement,
  updateMelodicTrackStep,
  updateNoiseTrackStep,
  updateSampleTrackStep,
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

  it("updates noise and sample steps immutably", () => {
    const song = createDefaultSongDocument();
    const noiseSong = updateNoiseTrackStep(song, 1, { enabled: true, presetId: "hat" });
    const sampleSong = updateSampleTrackStep(song, 6, {
      enabled: true,
      sampleId: "mic-001",
      playbackRate: 1.5,
    });

    expect(noiseSong.tracks.noise.steps[1]).toMatchObject({
      enabled: true,
      mode: "short",
      periodIndex: 1,
    });
    expect(noiseSong.tracks.sample).toEqual(song.tracks.sample);
    expect(sampleSong.tracks.sample.steps[6]).toMatchObject({
      enabled: true,
      sampleId: "mic-001",
      playbackRate: 1.5,
    });
    expect(sampleSong.tracks.noise).toEqual(song.tracks.noise);
  });

  it("ignores melodic step updates outside the loop length", () => {
    const song = createDefaultSongDocument();

    expect(updateMelodicTrackStep(song, "pulse1", -1, { enabled: false })).toBe(song);
    expect(updateMelodicTrackStep(song, "pulse1", song.transport.loopLength, { enabled: false })).toBe(song);
  });

  it("ignores non-melodic step updates outside the loop length", () => {
    const song = createDefaultSongDocument();

    expect(updateNoiseTrackStep(song, -1, { enabled: false })).toBe(song);
    expect(updateSampleTrackStep(song, song.transport.loopLength, { enabled: false })).toBe(song);
  });

  it("serializes the enabled melodic arrangement as step and note pairs", () => {
    const song = createDefaultSongDocument();

    expect(serializeMelodicTrackArrangement(song.tracks.pulse1)).toBe("1: C5\n5: E5\n9: G5\n13: E5");
  });

  it("serializes the enabled noise and sample arrangements", () => {
    const song = createDefaultSongDocument();

    expect(serializeNoiseTrackArrangement(song.tracks.noise)).toBe(
      "1: snare\n3: hiss\n5: snare\n7: hiss\n9: snare\n11: hiss\n13: snare\n15: hiss",
    );
    expect(serializeSampleTrackArrangement(song.tracks.sample)).toBe("8: mic-001@1\n16: mic-001@1");
  });

  it("parses a pasted melodic arrangement, normalizes note casing, and ignores steps past the loop length", () => {
    const result = parseMelodicTrackArrangement("1: e4\n3: g4\n17: c5", 16);

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, note: "E4" },
        { stepIndex: 2, note: "G4" },
      ],
    });
  });

  it("parses a pasted noise arrangement and ignores steps past the loop length", () => {
    const result = parseNoiseTrackArrangement("1: hat\n3: crash\n17: snare", 16);

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, presetId: "hat" },
        { stepIndex: 2, presetId: "crash" },
      ],
    });
  });

  it("parses a sample arrangement with ids or names and custom playback rates", () => {
    const song = createDefaultSongDocument();
    const result = parseSampleTrackArrangement("1: vox-hit@0.75x\n3: mic-001@1.5\n17: vox-hit", 16, song.samples);

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, sampleId: "mic-001", playbackRate: 0.75 },
        { stepIndex: 2, sampleId: "mic-001", playbackRate: 1.5 },
      ],
    });
  });

  it("rejects invalid arrangement lines", () => {
    expect(parseMelodicTrackArrangement("1 - E4", 16)).toEqual({
      ok: false,
      error: 'Line 1 must match "<step>: <value>" like "1: E4".',
    });
    expect(parseMelodicTrackArrangement("1: H4", 16)).toEqual({
      ok: false,
      error: "Line 1 has an unsupported note. Use notes from C0 to B8 with optional sharps.",
    });
    expect(parseNoiseTrackArrangement("1: laser", 16)).toEqual({
      ok: false,
      error: "Line 1 has an unknown noise trigger. Use one of: tick, hat, snare, burst, shaker, hiss, crash, rumble.",
    });
  });

  it("rejects invalid sample arrangement values", () => {
    const song = createDefaultSongDocument();

    expect(parseSampleTrackArrangement("1: missing@1x", 16, song.samples)).toEqual({
      ok: false,
      error: "Line 1 references an unknown sample. Use a sample id or name from the deck.",
    });
    expect(parseSampleTrackArrangement("1: mic-001@5x", 16, song.samples)).toEqual({
      ok: false,
      error: "Line 1 has an unsupported playback rate. Use a value between 0.25 and 4.",
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

  it("replaces noise and sample arrangements and clears unspecified steps", () => {
    const song = createDefaultSongDocument();
    const updatedNoiseSong = replaceNoiseTrackArrangement(song, [
      { stepIndex: 0, presetId: "hat" },
      { stepIndex: 4, presetId: "crash" },
    ]);
    const updatedSampleSong = replaceSampleTrackArrangement(song, [
      { stepIndex: 1, sampleId: "mic-001", playbackRate: 0.75 },
    ]);

    expect(updatedNoiseSong.tracks.noise.steps[0]).toMatchObject({
      enabled: true,
      mode: "short",
      periodIndex: 1,
    });
    expect(updatedNoiseSong.tracks.noise.steps[1].enabled).toBe(false);
    expect(updatedNoiseSong.tracks.noise.steps[4]).toMatchObject({
      enabled: true,
      mode: "long",
      periodIndex: 12,
    });

    expect(updatedSampleSong.tracks.sample.steps[1]).toMatchObject({
      enabled: true,
      sampleId: "mic-001",
      playbackRate: 0.75,
    });
    expect(updatedSampleSong.tracks.sample.steps[7].enabled).toBe(false);
  });
});
