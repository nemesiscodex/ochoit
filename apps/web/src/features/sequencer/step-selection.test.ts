import { applySongEdit, createEmptySongDocument, type SongEdit } from "ochoit-lib";
import { describe, expect, it } from "vitest";

import { clickStep, grabStep, moveSelection, type StepSelection } from "@/features/sequencer/step-selection";

function songWith(...edits: SongEdit[]) {
  return edits.reduce((song, edit) => applySongEdit(song, edit).song, createEmptySongDocument());
}

const pulseNotes = songWith({
  type: "place-steps",
  trackId: "pulse1",
  steps: [
    { stepIndex: 0, note: "C4", length: 3 },
    { stepIndex: 4, note: "E4", length: 1 },
    { stepIndex: 8, note: "G4", length: 5 },
  ],
});

describe("step-selection", () => {
  it("selects the note a clicked hold step belongs to", () => {
    expect(clickStep(null, pulseNotes, { trackId: "pulse1", stepIndex: 2, shiftKey: false })).toEqual({
      trackId: "pulse1",
      anchorStepIndex: 0,
      selectedStepIndexes: [0],
    });
  });

  it("selects an empty step on its own", () => {
    expect(clickStep(null, pulseNotes, { trackId: "pulse1", stepIndex: 14, shiftKey: true })).toEqual({
      trackId: "pulse1",
      anchorStepIndex: 14,
      selectedStepIndexes: [14],
    });
  });

  it("extends with shift-click to every note between the anchor and the target", () => {
    const anchored = clickStep(null, pulseNotes, { trackId: "pulse1", stepIndex: 9, shiftKey: false });
    const extended = clickStep(anchored, pulseNotes, { trackId: "pulse1", stepIndex: 1, shiftKey: true });

    expect(extended).toEqual({ trackId: "pulse1", anchorStepIndex: 8, selectedStepIndexes: [0, 4, 8] });
  });

  it("starts over when shift-clicking an empty step or another track", () => {
    const anchored: StepSelection = { trackId: "pulse1", anchorStepIndex: 0, selectedStepIndexes: [0, 4] };

    expect(clickStep(anchored, pulseNotes, { trackId: "pulse1", stepIndex: 6, shiftKey: true })).toEqual({
      trackId: "pulse1",
      anchorStepIndex: 6,
      selectedStepIndexes: [6],
    });
    expect(clickStep(anchored, pulseNotes, { trackId: "triangle", stepIndex: 0, shiftKey: true })).toEqual({
      trackId: "triangle",
      anchorStepIndex: 0,
      selectedStepIndexes: [0],
    });
  });

  it("keeps the selection when grabbing a note inside it", () => {
    const selection: StepSelection = { trackId: "pulse1", anchorStepIndex: 8, selectedStepIndexes: [0, 4, 8] };

    expect(grabStep(selection, pulseNotes, { trackId: "pulse1", stepIndex: 10 })).toEqual({
      trackId: "pulse1",
      anchorStepIndex: 0,
      selectedStepIndexes: [0, 4, 8],
    });
  });

  it("grabs only the note under the pointer when it is outside the selection", () => {
    const selection: StepSelection = { trackId: "pulse1", anchorStepIndex: 0, selectedStepIndexes: [0] };

    expect(grabStep(selection, pulseNotes, { trackId: "pulse1", stepIndex: 4 })).toEqual({
      trackId: "pulse1",
      anchorStepIndex: 4,
      selectedStepIndexes: [4],
    });
  });

  it("grabs nothing from an empty step", () => {
    expect(grabStep(null, pulseNotes, { trackId: "pulse1", stepIndex: 6 })).toBeNull();
    expect(grabStep(null, pulseNotes, { trackId: "noise", stepIndex: 0 })).toBeNull();
  });

  it("steps left and right over whole sustained notes", () => {
    const onFirstNote: StepSelection = { trackId: "pulse1", anchorStepIndex: 0, selectedStepIndexes: [0, 4] };

    expect(moveSelection(onFirstNote, pulseNotes, "right")).toEqual({
      trackId: "pulse1",
      anchorStepIndex: 3,
      selectedStepIndexes: [3],
    });
    expect(moveSelection({ ...onFirstNote, anchorStepIndex: 13 }, pulseNotes, "left").anchorStepIndex).toBe(8);
    expect(moveSelection({ ...onFirstNote, anchorStepIndex: 8 }, pulseNotes, "right").anchorStepIndex).toBe(13);
    expect(moveSelection({ ...onFirstNote, anchorStepIndex: 15 }, pulseNotes, "right").anchorStepIndex).toBe(15);
  });

  it("steps one cell at a time on trigger tracks and stops at the loop edges", () => {
    const noise: StepSelection = { trackId: "noise", anchorStepIndex: 0, selectedStepIndexes: [0] };

    expect(moveSelection(noise, pulseNotes, "left").anchorStepIndex).toBe(0);
    expect(moveSelection(noise, pulseNotes, "right").anchorStepIndex).toBe(1);
  });

  it("moves between tracks at the same step and stops at the first and last track", () => {
    const pulse1: StepSelection = { trackId: "pulse1", anchorStepIndex: 4, selectedStepIndexes: [0, 4] };

    expect(moveSelection(pulse1, pulseNotes, "down")).toEqual({
      trackId: "pulse2",
      anchorStepIndex: 4,
      selectedStepIndexes: [4],
    });
    expect(moveSelection(pulse1, pulseNotes, "up")).toBe(pulse1);
    expect(moveSelection({ ...pulse1, trackId: "sample" }, pulseNotes, "down").trackId).toBe("sample");
  });
});
