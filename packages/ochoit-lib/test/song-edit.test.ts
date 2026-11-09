import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultSongDocument, createEmptySongDocument, type SongDocument } from "../src/core/song-document";
import {
  applySongEdit,
  clampTrackVolume,
  serializeTrackArrangement,
  type SongEdit,
  type SongEditContext,
} from "../src/core/song-edit";

function applyEdits(song: SongDocument, edits: SongEdit[], context?: SongEditContext) {
  return edits.reduce((currentSong, edit) => applySongEdit(currentSong, edit, context).song, song);
}

function createSongWithPulseNotes(notes: Array<{ stepIndex: number; note: SongDocument["tracks"]["pulse1"]["steps"][number]["note"]; length: number }>) {
  const song = createEmptySongDocument();

  notes.forEach(({ stepIndex, note, length }) => {
    song.tracks.pulse1.steps[stepIndex] = {
      ...song.tracks.pulse1.steps[stepIndex]!,
      enabled: true,
      note,
      length,
    };
  });

  return song;
}

function enabledPulseNotes(song: SongDocument) {
  return song.tracks.pulse1.steps.flatMap((step, stepIndex) =>
    step.enabled ? [{ stepIndex, note: step.note, length: step.length }] : [],
  );
}

describe("song-edit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the same song object and leaves updatedAt alone when an edit changes nothing", () => {
    const song = createDefaultSongDocument();
    const noOpEdits: SongEdit[] = [
      { type: "update-step", trackId: "pulse1", stepIndex: 1, changes: { enabled: false } },
      { type: "update-step", trackId: "noise", stepIndex: 0, changes: { mode: "short" } },
      { type: "set-bpm", bpm: song.transport.bpm },
      { type: "set-loop-length", loopLength: song.transport.loopLength },
      { type: "set-steps-per-beat", stepsPerBeat: 4 },
      { type: "set-track-volume", trackId: "sample", volume: Number.NaN },
      { type: "set-master-volume", volume: Number.NaN },
      { type: "set-old-speaker-mode", enabled: false },
      { type: "move-steps", trackId: "pulse1", stepIndexes: [0], delta: 0 },
      { type: "resize-note", trackId: "pulse1", stepIndex: 0, startStepIndex: 0, length: 1 },
    ];

    noOpEdits.forEach((edit) => {
      const result = applySongEdit(song, edit);

      expect(result.status, edit.type).toBe("unchanged");
      expect(result.song, edit.type).toBe(song);
    });
    expect(song.meta.updatedAt).toBe("2026-03-18T00:00:00.000Z");
  });

  it("stamps updatedAt once with the edit time on a real change and does not mutate the input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:34:56.000Z"));
    const song = createDefaultSongDocument();

    const result = applySongEdit(song, { type: "toggle-track-mute", trackId: "pulse1" });

    expect(result.status).toBe("applied");
    expect(result.song.meta.updatedAt).toBe("2026-11-08T12:34:56.000Z");
    expect(result.song.tracks.pulse1.muted).toBe(true);
    expect(song.meta.updatedAt).toBe("2026-03-18T00:00:00.000Z");
    expect(song.tracks.pulse1.muted).toBe(false);
  });

  it("asks for confirmation before a loop shrink trims content and trims only once confirmed", () => {
    const song = createSongWithPulseNotes([{ stepIndex: 12, note: "E4", length: 1 }]);

    const request = applySongEdit(song, { type: "set-loop-length", loopLength: 12 });

    expect(request.status).toBe("needs-confirmation");
    expect(request.song).toBe(song);

    if (request.status !== "needs-confirmation") {
      throw new Error("Expected the shrink to need confirmation.");
    }

    expect(request.message).toBe(
      "Reduce the pattern to 12 steps? This will delete or shorten notes and triggers beyond the new end.",
    );

    const confirmed = applySongEdit(song, request.confirmedEdit);

    expect(confirmed.status).toBe("applied");
    expect(confirmed.song.transport.loopLength).toBe(12);
    expect(confirmed.song.tracks.pulse1.steps).toHaveLength(12);
    expect(enabledPulseNotes(confirmed.song)).toEqual([]);
  });

  it("asks for confirmation when a shrink would shorten a sustained note", () => {
    const song = createSongWithPulseNotes([{ stepIndex: 8, note: "E4", length: 6 }]);

    const request = applySongEdit(song, { type: "set-loop-length", loopLength: 12 });

    expect(request.status).toBe("needs-confirmation");

    if (request.status !== "needs-confirmation") {
      throw new Error("Expected the shrink to need confirmation.");
    }

    expect(enabledPulseNotes(applySongEdit(song, request.confirmedEdit).song)).toEqual([
      { stepIndex: 8, note: "E4", length: 4 },
    ]);
  });

  it("clamps the requested loop length and changes it without asking when no content is lost", () => {
    const song = createSongWithPulseNotes([{ stepIndex: 0, note: "E4", length: 2 }]);

    const extended = applySongEdit(song, { type: "set-loop-length", loopLength: 19 });
    const shrunk = applySongEdit(song, { type: "set-loop-length", loopLength: 2 });

    expect(extended.status).toBe("applied");
    expect(extended.song.transport.loopLength).toBe(20);
    expect(extended.song.tracks.noise.steps).toHaveLength(20);
    expect(shrunk.status).toBe("applied");
    expect(shrunk.song.transport.loopLength).toBe(4);
    expect(enabledPulseNotes(shrunk.song)).toEqual([{ stepIndex: 0, note: "E4", length: 2 }]);
  });

  it("rejects a steps-per-beat change the song cannot support with a message", () => {
    const longSong = applySongEdit(createEmptySongDocument(), {
      type: "set-loop-length",
      loopLength: 128,
    }).song;
    const eighthGridSong = applyEdits(createEmptySongDocument(), [
      { type: "set-steps-per-beat", stepsPerBeat: 8 },
      { type: "update-step", trackId: "triangle", stepIndex: 3, changes: { enabled: true } },
    ]);

    const tooLong = applySongEdit(longSong, { type: "set-steps-per-beat", stepsPerBeat: 8 });
    const offGrid = applySongEdit(eighthGridSong, { type: "set-steps-per-beat", stepsPerBeat: 4 });

    expect(tooLong).toEqual({
      status: "rejected",
      song: longSong,
      message: "1/8 grid would exceed the maximum pattern length.",
    });
    expect(offGrid).toEqual({
      status: "rejected",
      song: eighthGridSong,
      message: "Grid mode is only available when recorded notes and triggers align to the beat grid.",
    });
  });

  it("remaps the grid when the steps-per-beat change is supported", () => {
    const song = createSongWithPulseNotes([{ stepIndex: 4, note: "E4", length: 2 }]);

    const result = applySongEdit(song, { type: "set-steps-per-beat", stepsPerBeat: 8 });

    expect(result.status).toBe("applied");
    expect(result.song.transport).toMatchObject({ stepsPerBeat: 8, loopLength: 32 });
    expect(enabledPulseNotes(result.song)).toEqual([{ stepIndex: 8, note: "E4", length: 4 }]);
  });

  it("routes step updates to the track kind that owns the step", () => {
    const song = createEmptySongDocument();

    const edited = applyEdits(song, [
      { type: "update-step", trackId: "pulse2", stepIndex: 1, changes: { enabled: true, note: "A4", duty: 0.25 } },
      { type: "update-step", trackId: "triangle", stepIndex: 2, changes: { enabled: true, note: "G2", length: 3 } },
      { type: "update-step", trackId: "noise", stepIndex: 3, changes: { enabled: true, presetId: "crash" } },
      { type: "update-step", trackId: "sample", stepIndex: 4, changes: { volume: 0.3 } },
    ]);

    expect(edited.tracks.pulse2.steps[1]).toMatchObject({ enabled: true, note: "A4", duty: 0.25, length: 1 });
    expect(edited.tracks.triangle.steps[2]).toMatchObject({ enabled: true, note: "G2", length: 3 });
    expect(edited.tracks.noise.steps[3]).toMatchObject({ enabled: true, mode: "long", periodIndex: 12 });
    expect(edited.tracks.sample.steps[4]).toMatchObject({ enabled: false, volume: 0.3 });
    expect(edited.tracks.pulse1).toEqual(song.tracks.pulse1);
  });

  it("routes selection moves to the track kind and refuses moves that collide", () => {
    const song = createDefaultSongDocument();

    const movedMelodic = applySongEdit(song, { type: "move-steps", trackId: "triangle", stepIndexes: [0], delta: 2 });
    const movedNoise = applySongEdit(song, { type: "move-steps", trackId: "noise", stepIndexes: [14], delta: 1 });
    const movedSample = applySongEdit(song, { type: "move-steps", trackId: "sample", stepIndexes: [7], delta: -3 });
    const collision = applySongEdit(song, { type: "move-steps", trackId: "noise", stepIndexes: [0], delta: 2 });

    expect(movedMelodic.song.tracks.triangle.steps[2]).toMatchObject({ enabled: true, note: "C3" });
    expect(movedMelodic.song.tracks.triangle.steps[0]?.enabled).toBe(false);
    expect(movedNoise.song.tracks.noise.steps[15]).toMatchObject({ enabled: true, mode: "long", periodIndex: 8 });
    expect(movedNoise.song.tracks.noise.steps[14]?.enabled).toBe(false);
    expect(movedSample.song.tracks.sample.steps[4]).toMatchObject({ enabled: true, sampleId: "mic-001" });
    expect(movedSample.song.tracks.sample.steps[7]?.enabled).toBe(false);
    expect(collision).toEqual({ status: "unchanged", song });
  });

  it("clamps melodic note length to the next note on update and resize", () => {
    const song = createSongWithPulseNotes([
      { stepIndex: 0, note: "C4", length: 1 },
      { stepIndex: 4, note: "E4", length: 1 },
    ]);

    const updated = applySongEdit(song, { type: "update-step", trackId: "pulse1", stepIndex: 0, changes: { length: 99 } });
    const resized = applySongEdit(song, {
      type: "resize-note",
      trackId: "pulse1",
      stepIndex: 0,
      startStepIndex: 0,
      length: 99,
    });
    const lastNote = applySongEdit(song, { type: "update-step", trackId: "pulse1", stepIndex: 4, changes: { length: 99 } });

    expect(enabledPulseNotes(updated.song)[0]).toEqual({ stepIndex: 0, note: "C4", length: 4 });
    expect(enabledPulseNotes(resized.song)[0]).toEqual({ stepIndex: 0, note: "C4", length: 4 });
    expect(enabledPulseNotes(lastNote.song)[1]).toEqual({ stepIndex: 4, note: "E4", length: 12 });
  });

  it("places a batch of notes in one edit, removing every note they overlap", () => {
    const song = createSongWithPulseNotes([
      { stepIndex: 0, note: "C4", length: 4 },
      { stepIndex: 6, note: "D4", length: 3 },
      { stepIndex: 10, note: "E4", length: 1 },
      { stepIndex: 12, note: "F4", length: 2 },
    ]);

    const result = applySongEdit(song, {
      type: "place-steps",
      trackId: "pulse1",
      steps: [
        { stepIndex: 2, note: "G4", length: 1, volume: 0.4 },
        { stepIndex: 8, note: "A4", length: 3, duty: 0.75 },
        { stepIndex: 12, note: "B4", length: 1 },
      ],
    });

    expect(result.status).toBe("applied");
    expect(enabledPulseNotes(result.song)).toEqual([
      { stepIndex: 2, note: "G4", length: 1 },
      { stepIndex: 8, note: "A4", length: 3 },
      { stepIndex: 12, note: "B4", length: 1 },
    ]);
    expect(result.song.tracks.pulse1.steps[2]?.volume).toBe(0.4);
    expect(result.song.tracks.pulse1.steps[8]?.duty).toBe(0.75);
  });

  it("re-lengths an existing note when a placement has no note, clearing what it now covers", () => {
    const song = createSongWithPulseNotes([
      { stepIndex: 3, note: "C4", length: 1 },
      { stepIndex: 4, note: "D4", length: 1 },
      { stepIndex: 9, note: "E4", length: 1 },
    ]);

    const extended = applySongEdit(song, { type: "place-steps", trackId: "pulse1", steps: [{ stepIndex: 3, length: 3 }] });
    const missing = applySongEdit(song, { type: "place-steps", trackId: "pulse1", steps: [{ stepIndex: 8, length: 2 }] });

    expect(enabledPulseNotes(extended.song)).toEqual([
      { stepIndex: 3, note: "C4", length: 3 },
      { stepIndex: 9, note: "E4", length: 1 },
    ]);
    expect(enabledPulseNotes(missing.song)).toEqual([
      { stepIndex: 3, note: "C4", length: 1 },
      { stepIndex: 4, note: "D4", length: 1 },
    ]);
  });

  it("places noise and PCM triggers in one edit", () => {
    const song = createEmptySongDocument();

    const noise = applySongEdit(song, {
      type: "place-steps",
      trackId: "noise",
      steps: [
        { stepIndex: 1, mode: "short", periodIndex: 3, volume: 0.5 },
        { stepIndex: 5, mode: "long", periodIndex: 12, volume: 1 },
      ],
    });

    expect(noise.song.tracks.noise.steps[1]).toMatchObject({ enabled: true, mode: "short", periodIndex: 3, volume: 0.5 });
    expect(noise.song.tracks.noise.steps[5]).toMatchObject({ enabled: true, mode: "long", periodIndex: 12 });
  });

  it("enables a PCM step with the default sample only when the step has none", () => {
    const song = createDefaultSongDocument();
    song.samples = [
      ...song.samples,
      { ...song.samples[0]!, id: "mic-002", name: "mic-002", baseNote: "D4" },
      { ...song.samples[0]!, id: "mic-003", name: "mic-003" },
    ];
    song.tracks.sample.steps[2] = { ...song.tracks.sample.steps[2]!, sampleId: "mic-001" };

    const preferred = applySongEdit(
      song,
      { type: "update-step", trackId: "sample", stepIndex: 1, changes: { enabled: true } },
      { defaultSampleId: "mic-002" },
    );
    const fallback = applySongEdit(song, { type: "update-step", trackId: "sample", stepIndex: 1, changes: { enabled: true } });
    const keepsOwn = applySongEdit(
      song,
      { type: "update-step", trackId: "sample", stepIndex: 2, changes: { enabled: true } },
      { defaultSampleId: "mic-002" },
    );
    const recorded = applySongEdit(
      song,
      { type: "place-steps", trackId: "sample", steps: [{ stepIndex: 3, note: "G4" }] },
      { defaultSampleId: "mic-002" },
    );

    expect(preferred.song.tracks.sample.steps[1]).toMatchObject({ enabled: true, sampleId: "mic-002", note: "C4" });
    expect(fallback.song.tracks.sample.steps[1]).toMatchObject({ enabled: true, sampleId: "mic-003" });
    expect(keepsOwn.song.tracks.sample.steps[2]).toMatchObject({ enabled: true, sampleId: "mic-001" });
    expect(recorded.song.tracks.sample.steps[3]).toMatchObject({ enabled: true, sampleId: "mic-002", note: "G4" });
  });

  it("toggles mute and sets clamped track, master and speaker levels", () => {
    const song = createDefaultSongDocument();

    const edited = applyEdits(song, [
      { type: "toggle-track-mute", trackId: "noise" },
      { type: "set-track-volume", trackId: "triangle", volume: 1.4 },
      { type: "set-track-volume", trackId: "pulse2", volume: 0.456 },
      { type: "set-master-volume", volume: 0.61 },
      { type: "set-old-speaker-mode", enabled: true },
    ]);

    expect(edited.tracks.noise.muted).toBe(true);
    expect(edited.tracks.pulse1.muted).toBe(false);
    expect(edited.tracks.triangle.volume).toBe(1);
    expect(edited.tracks.pulse2.volume).toBe(0.46);
    expect(edited.tracks.pulse1.volume).toBe(song.tracks.pulse1.volume);
    expect(edited.mixer).toEqual({ masterVolume: 0.61, oldSpeakerMode: true });
  });

  it("edits song name, author and engine mode within the song limits", () => {
    const song = createDefaultSongDocument();

    const edited = applyEdits(song, [
      { type: "set-song-name", name: "N".repeat(90) },
      { type: "set-song-author", author: "Julio" },
      { type: "set-engine-mode", engineMode: "authentic" },
    ]);

    expect(edited.meta).toMatchObject({ name: "N".repeat(80), author: "Julio", engineMode: "authentic" });
    expect(applySongEdit(song, { type: "set-song-name", name: song.meta.name })).toEqual({ status: "unchanged", song });
  });

  it("clamps track volumes to the supported range and precision", () => {
    expect(clampTrackVolume(-0.3)).toBe(0);
    expect(clampTrackVolume(0.456)).toBe(0.46);
    expect(clampTrackVolume(1.8)).toBe(1);
  });

  it("replaces a track arrangement from text for each track kind", () => {
    const song = createDefaultSongDocument();

    const edited = applyEdits(song, [
      { type: "replace-arrangement", trackId: "triangle", text: "1-3: e3, 17: c3" },
      { type: "replace-arrangement", trackId: "noise", text: "2: hat" },
      { type: "replace-arrangement", trackId: "sample", text: "4: vox-hit>D5" },
    ]);

    expect(serializeTrackArrangement(edited, "triangle", "compact")).toBe("1-3: E3");
    expect(serializeTrackArrangement(edited, "noise", "compact")).toBe("2: short P1");
    expect(serializeTrackArrangement(edited, "sample", "compact")).toBe("4: mic-001>D5");
    expect(serializeTrackArrangement(edited, "pulse1")).toBe("1: C5 @12.5%\n5: E5 @25%\n9: G5\n13: E5 @25%");
  });

  it("rejects arrangement text that does not parse and keeps the song", () => {
    const song = createDefaultSongDocument();

    const result = applySongEdit(song, { type: "replace-arrangement", trackId: "noise", text: "1: thunder" });

    expect(result.status).toBe("rejected");
    expect(result.song).toBe(song);
    expect(result.status === "rejected" ? result.message : null).toMatch(/^Line 1 has an invalid noise trigger/);
  });
});
