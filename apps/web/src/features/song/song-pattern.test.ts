import { describe, expect, it } from "vitest";

import { createDefaultSongDocument, DEFAULT_PULSE_DUTY } from "@/features/song/song-document";
import {
  getMelodicStepState,
  noteEntryOptions,
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackSampleReference,
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

  it("updates melodic steps immutably and supports duration changes", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateMelodicTrackStep(song, "triangle", 0, {
      length: 3,
      note: "D3",
    });

    expect(updatedSong).not.toBe(song);
    expect(updatedSong.tracks.triangle.steps[0]).toEqual({
      ...song.tracks.triangle.steps[0],
      note: "D3",
      length: 3,
    });
    expect(getMelodicStepState(updatedSong.tracks.triangle, 1)).toEqual({
      kind: "hold",
      note: "D3",
      startIndex: 0,
      length: 3,
      offset: 1,
    });
    expect(updatedSong.tracks.noise).toEqual(song.tracks.noise);
  });

  it("updates pulse duty without affecting other melodic tracks", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateMelodicTrackStep(song, "pulse1", 0, {
      duty: 0.75,
    });

    expect(updatedSong).not.toBe(song);
    expect(updatedSong.tracks.pulse1.steps[0]).toMatchObject({
      ...song.tracks.pulse1.steps[0],
      duty: 0.75,
    });
    expect(updatedSong.tracks.pulse2).toEqual(song.tracks.pulse2);
    expect(updatedSong.tracks.triangle).toEqual(song.tracks.triangle);
  });

  it("starts a new melodic note by truncating the previous held note", () => {
    const song = createDefaultSongDocument();
    const sustainedSong = updateMelodicTrackStep(song, "pulse1", 0, { length: 4 });
    const splitSong = updateMelodicTrackStep(sustainedSong, "pulse1", 2, {
      enabled: true,
      note: "G4",
    });

    expect(splitSong.tracks.pulse1.steps[0]).toMatchObject({
      enabled: true,
      length: 2,
      note: "C5",
    });
    expect(splitSong.tracks.pulse1.steps[2]).toMatchObject({
      enabled: true,
      length: 1,
      note: "G4",
    });
  });

  it("updates noise and sample steps immutably", () => {
    const song = createDefaultSongDocument();
    const noiseSong = updateNoiseTrackStep(song, 1, { enabled: true, presetId: "hat" });
    const customNoiseSong = updateNoiseTrackStep(song, 2, {
      enabled: true,
      mode: "long",
      periodIndex: 12,
    });
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
    expect(customNoiseSong.tracks.noise.steps[2]).toMatchObject({
      enabled: true,
      mode: "long",
      periodIndex: 12,
    });
    expect(customNoiseSong.tracks.sample).toEqual(song.tracks.sample);
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

  it("serializes the enabled melodic arrangement as note ranges", () => {
    const song = createDefaultSongDocument();
    const sustainedSong = updateMelodicTrackStep(song, "pulse1", 0, { length: 3 });

    expect(serializeMelodicTrackArrangement(sustainedSong.tracks.pulse1)).toBe(
      "1-3: C5 @12.5%\n5: E5 @25%\n9: G5 @50%\n13: E5 @25%",
    );
  });

  it("serializes the enabled noise and sample arrangements", () => {
    const song = createDefaultSongDocument();

    expect(serializeNoiseTrackArrangement(song.tracks.noise)).toBe(
      "1: short P3\n3: long P8\n5: short P3\n7: long P8\n9: short P3\n11: long P8\n13: short P3\n15: long P8",
    );
    expect(serializeSampleTrackArrangement(song.tracks.sample, song.meta.engineMode)).toBe(
      "8: mic-001>C4\n16: mic-001>C4",
    );
  });

  it("parses ranged melodic arrangements, normalizes note casing, and ignores steps past the loop length", () => {
    const result = parseMelodicTrackArrangement("1-3: e4 @25%\n5: g4\n17-20: c5 @75%", 16, "pulse1");

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, note: "E4", length: 3, duty: 0.25 },
        { stepIndex: 4, note: "G4", length: 1 },
      ],
    });
  });

  it("parses noise text arrangements with explicit configs or preset aliases", () => {
    const result = parseNoiseTrackArrangement("1: short P1\n3: long P12\n5: hat\n17: snare", 16);

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, mode: "short", periodIndex: 1 },
        { stepIndex: 2, mode: "long", periodIndex: 12 },
        { stepIndex: 4, mode: "short", periodIndex: 1 },
      ],
    });
  });

  it("parses a sample arrangement with ids or names and custom playback rates", () => {
    const song = createDefaultSongDocument();
    const result = parseSampleTrackArrangement("1: vox-hit@0.75x\n3: mic-001@1.5\n17: vox-hit", 16, song.samples);

    expect(result).toEqual({
      ok: true,
      entries: [
        { stepIndex: 0, sampleId: "mic-001", note: "C4", playbackRate: 0.75 },
        { stepIndex: 2, sampleId: "mic-001", note: "C4", playbackRate: 1.5 },
      ],
    });
  });

  it("rejects invalid arrangement lines", () => {
    expect(parseMelodicTrackArrangement("1 - E4", 16, "pulse1")).toEqual({
      ok: false,
      error: 'Line 1 must match "<step>: <value>" or "<start>-<end>: <value>" like "1-4: E4".',
    });
    expect(parseMelodicTrackArrangement("3-1: E4", 16, "pulse1")).toEqual({
      ok: false,
      error: "Line 1 must use an end step greater than or equal to the start step.",
    });
    expect(parseMelodicTrackArrangement("1: H4", 16, "pulse1")).toEqual({
      ok: false,
      error: "Line 1 has an unsupported note. Use notes from C0 to B8 with optional sharps.",
    });
    expect(parseMelodicTrackArrangement("1: E4 @33%", 16, "pulse1")).toEqual({
      ok: false,
      error: "Line 1 has an unsupported pulse duty. Use 12.5%, 25%, 50%, or 75%.",
    });
    expect(parseMelodicTrackArrangement("1: E4 @25%", 16, "triangle")).toEqual({
      ok: false,
      error: "Line 1 includes a pulse duty suffix, but this track only accepts notes.",
    });
    expect(parseNoiseTrackArrangement("1: laser", 16)).toEqual({
      ok: false,
      error:
        'Line 1 has an invalid noise trigger. Use "short P3", "long P12", or a preset id: tick, hat, snare, burst, shaker, hiss, crash, rumble.',
    });
    expect(parseNoiseTrackArrangement("1: short P16", 16)).toEqual({
      ok: false,
      error: 'Line 1 has an unsupported noise period. Use "P0" through "P15".',
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

  it("replaces a melodic voice arrangement and clears unspecified steps while preserving durations", () => {
    const song = createDefaultSongDocument();
    const updatedSong = replaceMelodicTrackArrangement(song, "pulse1", [
      { stepIndex: 0, note: "E4", length: 3 },
      { stepIndex: 4, note: "G4", length: 2 },
    ]);

    expect(updatedSong.tracks.pulse1.steps[0]).toEqual({
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      note: "E4",
      length: 3,
      duty: DEFAULT_PULSE_DUTY,
    });
    expect(updatedSong.tracks.pulse1.steps[1]).toEqual({
      ...song.tracks.pulse1.steps[1],
      enabled: false,
      length: 1,
      duty: DEFAULT_PULSE_DUTY,
    });
    expect(updatedSong.tracks.pulse1.steps[4]).toEqual({
      ...song.tracks.pulse1.steps[4],
      enabled: true,
      note: "G4",
      length: 2,
      duty: DEFAULT_PULSE_DUTY,
    });
  });

  it("normalizes pulse duty when replacing a pulse arrangement from text entries", () => {
    const song = createDefaultSongDocument();
    const updatedSong = replaceMelodicTrackArrangement(song, "pulse1", [
      { stepIndex: 0, note: "C5", length: 1 },
      { stepIndex: 4, note: "C5", length: 1 },
      { stepIndex: 8, note: "C5", length: 1 },
      { stepIndex: 12, note: "C5", length: 1 },
    ]);

    expect(updatedSong.tracks.pulse1.steps[0]?.duty).toBe(DEFAULT_PULSE_DUTY);
    expect(updatedSong.tracks.pulse1.steps[4]?.duty).toBe(DEFAULT_PULSE_DUTY);
    expect(updatedSong.tracks.pulse1.steps[8]?.duty).toBe(DEFAULT_PULSE_DUTY);
    expect(updatedSong.tracks.pulse1.steps[12]?.duty).toBe(DEFAULT_PULSE_DUTY);
  });

  it("applies pulse duty values from melodic text entries and defaults omitted values to 50%", () => {
    const song = createDefaultSongDocument();
    const parsed = parseMelodicTrackArrangement("1: C5 @25%\n5: C5\n9: C5 @75%", 16, "pulse1");

    if (!parsed.ok) {
      throw new Error(`Expected pulse arrangement to parse, received: ${parsed.error}`);
    }

    const updatedSong = replaceMelodicTrackArrangement(song, "pulse1", parsed.entries);

    expect(updatedSong.tracks.pulse1.steps[0]?.duty).toBe(0.25);
    expect(updatedSong.tracks.pulse1.steps[4]?.duty).toBe(DEFAULT_PULSE_DUTY);
    expect(updatedSong.tracks.pulse1.steps[8]?.duty).toBe(0.75);
  });

  it("truncates overlapping melodic arrangement entries to keep tracks monophonic", () => {
    const song = createDefaultSongDocument();
    const updatedSong = replaceMelodicTrackArrangement(song, "triangle", [
      { stepIndex: 0, note: "C3", length: 4 },
      { stepIndex: 2, note: "E3", length: 3 },
    ]);

    expect(updatedSong.tracks.triangle.steps[0]).toMatchObject({
      enabled: true,
      length: 2,
      note: "C3",
    });
    expect(updatedSong.tracks.triangle.steps[2]).toMatchObject({
      enabled: true,
      length: 3,
      note: "E3",
    });
  });

  it("replaces noise and sample arrangements and clears unspecified steps", () => {
    const song = createDefaultSongDocument();
    const updatedNoiseSong = replaceNoiseTrackArrangement(song, [
      { stepIndex: 0, mode: "short", periodIndex: 1 },
      { stepIndex: 4, mode: "long", periodIndex: 12 },
    ]);
    const updatedSampleSong = replaceSampleTrackArrangement(song, [
      { stepIndex: 1, sampleId: "mic-001", note: "D4", playbackRate: 0.75 },
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
      note: "D4",
      playbackRate: 0.75,
    });
    expect(updatedSampleSong.tracks.sample.steps[7].enabled).toBe(false);
  });

  it("replaces enabled PCM step references for the active deck sample only", () => {
    const song = replaceSampleTrackArrangement(createDefaultSongDocument(), [
      { stepIndex: 1, sampleId: "mic-001", note: "C4", playbackRate: 0.75 },
      { stepIndex: 5, sampleId: "vox-hit-alt", note: "G4", playbackRate: 1.5 },
    ]);
    const songWithAltSample = {
      ...song,
      samples: [
        ...song.samples,
        {
          ...song.samples[0],
          id: "vox-hit-alt",
          name: "vox-hit-alt",
        },
      ],
    };

    const updatedSong = replaceSampleTrackSampleReference(songWithAltSample, "mic-001", "mic-002");

    expect(updatedSong.tracks.sample.steps[1]).toMatchObject({
      enabled: true,
      sampleId: "mic-002",
      note: "C4",
      playbackRate: 0.75,
    });
    expect(updatedSong.tracks.sample.steps[5]).toMatchObject({
      enabled: true,
      sampleId: "vox-hit-alt",
      note: "G4",
      playbackRate: 1.5,
    });
  });
});
