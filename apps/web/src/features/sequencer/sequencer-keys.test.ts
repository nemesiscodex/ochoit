import { describe, expect, it } from "vitest";

import { getSequencerKeyCommand } from "@/features/sequencer/sequencer-keys";

const idle = { recording: false, keyboardMode: false, baseOctave: 3 };
const recording = { ...idle, recording: true };
const keyboardMode = { ...idle, keyboardMode: true };

function press(
  key: string,
  modifiers: Partial<{ code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {},
) {
  return { key, code: "", altKey: false, ctrlKey: false, metaKey: false, ...modifiers };
}

describe("sequencer-keys", () => {
  it("records note keys while recording and enters them in keyboard mode", () => {
    expect(getSequencerKeyCommand(press("z"), recording)).toEqual({ type: "record-note", key: "z", note: "C3" });
    expect(getSequencerKeyCommand(press("Z"), recording)).toEqual({ type: "record-note", key: "z", note: "C3" });
    expect(getSequencerKeyCommand(press("q"), keyboardMode)).toEqual({ type: "enter-note", note: "C4" });
    expect(getSequencerKeyCommand(press("z"), { ...recording, keyboardMode: true })).toEqual({
      type: "record-note",
      key: "z",
      note: "C3",
    });
    expect(getSequencerKeyCommand(press("z"), idle)).toBeNull();
  });

  it("treats Cmd and Ctrl chords as shortcuts, never as notes", () => {
    for (const modes of [idle, recording, keyboardMode, { ...recording, keyboardMode: true }]) {
      expect(getSequencerKeyCommand(press("c", { metaKey: true }), modes)).toEqual({ type: "copy" });
      expect(getSequencerKeyCommand(press("C", { ctrlKey: true }), modes)).toEqual({ type: "copy" });
      expect(getSequencerKeyCommand(press("v", { ctrlKey: true }), modes)).toEqual({ type: "paste" });
      expect(getSequencerKeyCommand(press("z", { metaKey: true }), modes)).toBeNull();
      expect(getSequencerKeyCommand(press("r", { ctrlKey: true }), modes)).toBeNull();
    }
  });

  it("ignores Alt chords for notes", () => {
    expect(getSequencerKeyCommand(press("z", { altKey: true }), recording)).toBeNull();
    expect(getSequencerKeyCommand(press("z", { altKey: true }), keyboardMode)).toBeNull();
  });

  it("falls through to other shortcuts when a note key is out of range for the octave", () => {
    const topOctave = { ...recording, keyboardMode: true, baseOctave: 8 };

    expect(getSequencerKeyCommand(press("p"), topOctave)).toBeNull();
    expect(getSequencerKeyCommand(press("["), topOctave)).toEqual({ type: "shift-octave", delta: -1 });
  });

  it("shifts the keyboard octave only in keyboard mode", () => {
    expect(getSequencerKeyCommand(press("["), keyboardMode)).toEqual({ type: "shift-octave", delta: -1 });
    expect(getSequencerKeyCommand(press("]"), keyboardMode)).toEqual({ type: "shift-octave", delta: 1 });
    expect(getSequencerKeyCommand(press("["), recording)).toBeNull();
  });

  it("leaves Cmd and Ctrl bracket chords to the browser in keyboard mode", () => {
    for (const modes of [keyboardMode, { ...recording, keyboardMode: true }]) {
      for (const key of ["[", "]"]) {
        expect(getSequencerKeyCommand(press(key, { metaKey: true }), modes)).toBeNull();
        expect(getSequencerKeyCommand(press(key, { ctrlKey: true }), modes)).toBeNull();
      }
    }
  });

  it("toggles keyboard mode from the backslash key in any mode", () => {
    expect(getSequencerKeyCommand(press("\\"), idle)).toEqual({ type: "toggle-keyboard-mode" });
    expect(getSequencerKeyCommand(press("|", { code: "Backslash" }), recording)).toEqual({
      type: "toggle-keyboard-mode",
    });
  });

  it("maps editing and navigation keys to selection commands", () => {
    expect(getSequencerKeyCommand(press("Escape"), keyboardMode)).toEqual({ type: "clear-selection" });
    expect(getSequencerKeyCommand(press("Backspace"), idle)).toEqual({ type: "delete-selection" });
    expect(getSequencerKeyCommand(press("Delete"), idle)).toEqual({ type: "delete-selection" });
    expect(getSequencerKeyCommand(press("Enter"), recording)).toEqual({ type: "enable-anchor" });
    expect(getSequencerKeyCommand(press("ArrowLeft"), idle)).toEqual({ type: "move-selection", direction: "left" });
    expect(getSequencerKeyCommand(press("ArrowRight"), idle)).toEqual({ type: "move-selection", direction: "right" });
    expect(getSequencerKeyCommand(press("ArrowUp"), idle)).toEqual({ type: "move-selection", direction: "up" });
    expect(getSequencerKeyCommand(press("ArrowDown"), idle)).toEqual({ type: "move-selection", direction: "down" });
    expect(getSequencerKeyCommand(press("Tab"), idle)).toBeNull();
  });
});
