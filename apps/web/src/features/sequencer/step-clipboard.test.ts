import {
  applySongEdit,
  createDefaultSongDocument,
  createEmptySongDocument,
  getMelodicArrangementEntries,
  type SongDocument,
  type SongEdit,
} from "ochoit-lib";
import { describe, expect, it } from "vitest";

import { copySteps, pasteSteps } from "@/features/sequencer/step-clipboard";
import type { StepSelection } from "@/features/sequencer/step-selection";

function songWith(...edits: SongEdit[]) {
  const song: SongDocument = { ...createEmptySongDocument(), samples: createDefaultSongDocument().samples };

  return edits.reduce((currentSong, edit) => applySongEdit(currentSong, edit).song, song);
}

function select(trackId: StepSelection["trackId"], ...selectedStepIndexes: number[]): StepSelection {
  return { trackId, anchorStepIndex: selectedStepIndexes[0], selectedStepIndexes };
}

function copyThenPaste(song: SongDocument, from: StepSelection, to: StepSelection) {
  const clipboard = copySteps(song, from);

  if (clipboard === null) {
    throw new Error("Expected copied steps");
  }

  const pasted = pasteSteps(song, clipboard, to);

  return pasted === null ? null : { song: applySongEdit(song, pasted.edit).song, selection: pasted.selection };
}

describe("step-clipboard", () => {
  it("pastes melodic notes with their length, duty and volume at the anchor", () => {
    const song = songWith({
      type: "place-steps",
      trackId: "pulse1",
      steps: [
        { stepIndex: 0, note: "A4", length: 2, duty: 0.25, volume: 0.4 },
        { stepIndex: 3, note: "C5", length: 1, duty: 0.75, volume: 0.9 },
      ],
    });

    const pasted = copyThenPaste(song, select("pulse1", 0, 3), select("pulse1", 8));

    expect(pasted?.song.tracks.pulse1.steps[8]).toMatchObject({
      enabled: true,
      note: "A4",
      length: 2,
      duty: 0.25,
      volume: 0.4,
    });
    expect(pasted?.song.tracks.pulse1.steps[11]).toMatchObject({
      enabled: true,
      note: "C5",
      length: 1,
      duty: 0.75,
      volume: 0.9,
    });
    expect(pasted?.song.tracks.pulse1.steps[0]).toMatchObject({ enabled: true, note: "A4" });
    expect(pasted?.selection).toEqual({ trackId: "pulse1", anchorStepIndex: 8, selectedStepIndexes: [8, 11] });
  });

  it("clears melodic notes the pasted notes overlap", () => {
    const song = songWith({
      type: "place-steps",
      trackId: "triangle",
      steps: [
        { stepIndex: 0, note: "C3", length: 4 },
        { stepIndex: 9, note: "G3", length: 2 },
      ],
    });

    const pasted = copyThenPaste(song, select("triangle", 0), select("triangle", 6));

    expect(pasted === null ? [] : getMelodicArrangementEntries(pasted.song.tracks.triangle)).toEqual([
      { stepIndex: 0, note: "C3", length: 4 },
      { stepIndex: 6, note: "C3", length: 4 },
    ]);
  });

  it("pastes noise triggers with their mode, period and volume", () => {
    const song = songWith({
      type: "place-steps",
      trackId: "noise",
      steps: [
        { stepIndex: 1, mode: "short", periodIndex: 2, volume: 0.3 },
        { stepIndex: 2, mode: "long", periodIndex: 9, volume: 0.7 },
      ],
    });

    const pasted = copyThenPaste(song, select("noise", 1, 2, 5), select("noise", 12));

    expect(pasted?.song.tracks.noise.steps[12]).toMatchObject({ enabled: true, mode: "short", periodIndex: 2, volume: 0.3 });
    expect(pasted?.song.tracks.noise.steps[13]).toMatchObject({ enabled: true, mode: "long", periodIndex: 9, volume: 0.7 });
    expect(pasted?.selection.selectedStepIndexes).toEqual([12, 13]);
  });

  it("pastes PCM triggers with their sample, note and playback rate", () => {
    const song = songWith({
      type: "place-steps",
      trackId: "sample",
      steps: [{ stepIndex: 4, sampleId: "mic-001", note: "E4", playbackRate: 1.5, volume: 0.6 }],
    });

    const pasted = copyThenPaste(song, select("sample", 4), select("sample", 0));

    expect(pasted?.song.tracks.sample.steps[0]).toMatchObject({
      enabled: true,
      sampleId: "mic-001",
      note: "E4",
      playbackRate: 1.5,
      volume: 0.6,
    });
  });

  it("drops steps that would land past the loop end", () => {
    const song = songWith({
      type: "place-steps",
      trackId: "noise",
      steps: [
        { stepIndex: 0, mode: "short", periodIndex: 2 },
        { stepIndex: 3, mode: "long", periodIndex: 9 },
      ],
    });

    const pasted = copyThenPaste(song, select("noise", 0, 3), select("noise", 14));

    expect(pasted?.song.tracks.noise.steps[14]).toMatchObject({ enabled: true, mode: "short" });
    expect(pasted?.selection.selectedStepIndexes).toEqual([14]);
  });

  it("copies nothing from empty steps", () => {
    expect(copySteps(songWith(), select("pulse1", 0, 1))).toBeNull();
    expect(copySteps(songWith(), select("sample", 0))).toBeNull();
  });

  it("pastes only onto the track the steps were copied from", () => {
    const song = songWith({ type: "place-steps", trackId: "pulse1", steps: [{ stepIndex: 0, note: "A4", length: 1 }] });

    expect(copyThenPaste(song, select("pulse1", 0), select("pulse2", 4))).toBeNull();
  });
});
