import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import type { AudioEngine } from "@/features/audio/audio-engine";
import { createDefaultSongDocument, createEmptySongDocument } from "@/features/song/song-document";

function setCellWidth(element: HTMLElement, width: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        width,
        height: 48,
        top: 0,
        left: 0,
        right: width,
        bottom: 48,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  });
}

function setCellRect(element: HTMLElement, left: number, top: number, width: number, height = 48) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        width,
        height,
        top,
        left,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  });
}

function renderMatrix(overrides: Record<string, unknown> = {}) {
  const props = {
    defaultSampleId: null,
    engine: null,
    onOpenMelodicTrackEditor: vi.fn(),
    onOpenTriggerTrackEditor: vi.fn(),
    onMoveMelodicSelection: vi.fn(),
    onResizeMelodicStep: vi.fn(),
    onMoveNoiseSelection: vi.fn(),
    onMoveSampleSelection: vi.fn(),
    onToggleTrackMute: vi.fn(),
    onUpdateTrackVolume: vi.fn(),
    onUpdateMelodicStep: vi.fn(),
    onUpdateNoiseStep: vi.fn(),
    onUpdateSampleStep: vi.fn(),
    song: createDefaultSongDocument(),
    playbackState: "stopped" as const,
    nextStep: 0,
    ...overrides,
  };

  return { ...render(<SequencerMatrix {...props} />), props };
}

describe("sequencer-matrix", () => {
  it("renders one sequencer row per voice", () => {
    renderMatrix();

    expect(screen.getByRole("heading", { name: "Pulse I" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pulse II" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triangle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Noise" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PCM" })).toBeTruthy();
  });

  it("highlights the current playback step across the ruler and all rows", () => {
    const { container } = renderMatrix({ playbackState: "playing", nextStep: 4 });

    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(6);
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-current")).toBe("step");
    expect(screen.getByLabelText("PCM step 5").getAttribute("aria-current")).toBe("step");
  });

  it("calls the mute toggle callback for a specific voice", () => {
    const onToggleTrackMute = vi.fn();

    renderMatrix({ onToggleTrackMute });

    fireEvent.click(screen.getByRole("button", { name: "Mute Pulse I" }));

    expect(onToggleTrackMute).toHaveBeenCalledWith("pulse1");
  });

  it("calls the volume update callback for a specific voice", () => {
    const onUpdateTrackVolume = vi.fn();

    renderMatrix({ onUpdateTrackVolume });

    fireEvent.change(screen.getByLabelText("Pulse I volume"), { target: { value: "23" } });

    expect(onUpdateTrackVolume).toHaveBeenCalledWith("pulse1", 0.23);
  });

  it("updates noise config via the step detail panel", () => {
    const onUpdateNoiseStep = vi.fn();

    renderMatrix({ onUpdateNoiseStep });

    fireEvent.click(screen.getByLabelText("Noise step 1"));

    const panel = screen.getByLabelText("Noise step 1 editor");

    fireEvent.click(within(panel).getByRole("button", { name: "Set noise mode long" }));

    expect(onUpdateNoiseStep).toHaveBeenCalledWith(0, { mode: "long" });

    fireEvent.change(within(panel).getByLabelText("Noise step 1 noise period"), {
      target: { value: "12" },
    });

    expect(onUpdateNoiseStep).toHaveBeenCalledWith(0, { periodIndex: 12 });
  });

  it("updates pulse duty via the step detail panel", () => {
    const onUpdateMelodicStep = vi.fn();

    renderMatrix({ onUpdateMelodicStep });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByRole("button", { name: "Set duty 75%" }));

    expect(onUpdateMelodicStep).toHaveBeenCalledWith("pulse1", 0, { duty: 0.75 });
  });

  it("disables and edits notes via the step detail panel", () => {
    const onUpdateMelodicStep = vi.fn();

    renderMatrix({ onUpdateMelodicStep });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByRole("button", { name: "Disable Pulse I step 1" }));

    expect(onUpdateMelodicStep).toHaveBeenNthCalledWith(1, "pulse1", 0, { enabled: false });

    fireEvent.click(screen.getByLabelText("Triangle step 1"));
    fireEvent.click(screen.getByLabelText("Triangle step 1 note"));
    fireEvent.click(screen.getByRole("button", { name: "Select note D3" }));

    expect(onUpdateMelodicStep).toHaveBeenNthCalledWith(2, "triangle", 0, { note: "D3" });
  });

  it("shows duration controls in the detail panel for sustained notes", () => {
    const onUpdateMelodicStep = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = {
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      length: 3,
    };

    renderMatrix({ song, onUpdateMelodicStep });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("3 st");

    fireEvent.click(screen.getByRole("button", { name: "Extend Pulse I step 1 duration" }));

    expect(onUpdateMelodicStep).toHaveBeenNthCalledWith(1, "pulse1", 0, { length: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Shorten Pulse I step 1 duration" }));

    expect(onUpdateMelodicStep).toHaveBeenNthCalledWith(2, "pulse1", 0, { length: 2 });
  });

  it("redirects hold step clicks to the origin step", () => {
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = {
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      length: 3,
    };

    renderMatrix({ song });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();
  });

  it("passes hovered note to the audio preview via the detail panel", () => {
    const previewNote = vi.fn();
    const engine = {
      getWaveform: vi.fn(() => new Uint8Array([128])),
      previewNote,
    } as unknown as AudioEngine;

    renderMatrix({ engine });

    fireEvent.click(screen.getByLabelText("Triangle step 1"));
    fireEvent.click(screen.getByLabelText("Triangle step 1 note"));
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Select note D3" }));

    expect(previewNote).toHaveBeenCalledWith("triangle", "D3", expect.any(Number), 0.5, 0.72);
  });

  it("passes hovered pulse duty to the audio preview via the detail panel", () => {
    const previewNote = vi.fn();
    const engine = {
      getWaveform: vi.fn(() => new Uint8Array([128])),
      previewNote,
    } as unknown as AudioEngine;

    renderMatrix({ engine });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Set duty 75%" }));

    expect(previewNote).toHaveBeenCalledWith("pulse1", "C5", expect.any(Number), 0.75, 0.84);
  });

  it("opens the text editor for a melodic voice", () => {
    const onOpenMelodicTrackEditor = vi.fn();

    renderMatrix({ onOpenMelodicTrackEditor });

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    expect(onOpenMelodicTrackEditor).toHaveBeenCalledWith("pulse1");
  });

  it("passes hovered noise and PCM controls to the audio preview via detail panel", () => {
    const previewNoiseTrigger = vi.fn();
    const previewNoiseConfig = vi.fn();
    const previewSampleTrigger = vi.fn();
    const engine = {
      getWaveform: vi.fn(() => new Uint8Array([128])),
      previewNote: vi.fn(),
      previewNoiseTrigger,
      previewNoiseConfig,
      previewSampleTrigger,
    } as unknown as AudioEngine;

    renderMatrix({ engine });

    fireEvent.click(screen.getByLabelText("Noise step 1"));
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Select noise trigger Crash" }));

    expect(previewNoiseTrigger).toHaveBeenCalledWith("crash");

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Set noise mode short" }));

    expect(previewNoiseConfig).toHaveBeenCalledWith("short", 3);

    fireEvent.click(screen.getByLabelText("PCM step 8"));

    const pcmPanel = screen.getByLabelText("PCM step 8 editor");
    fireEvent.mouseEnter(within(pcmPanel).getByRole("button", { name: "Assign vox-hit" }));

    expect(previewSampleTrigger).toHaveBeenCalledWith("mic-001", 1);
  });

  it("previews enabled sequencer steps on hover and ignores empty cells", () => {
    const previewNote = vi.fn();
    const previewNoiseConfig = vi.fn();
    const previewSampleNote = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = {
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      length: 3,
      duty: 0.125,
      note: "C5",
    };
    const engine = {
      getWaveform: vi.fn(() => new Uint8Array([128])),
      previewNote,
      previewNoiseConfig,
      previewSampleNote,
      previewSampleTrigger: vi.fn(),
    } as unknown as AudioEngine;

    renderMatrix({ engine, song });

    fireEvent.mouseEnter(screen.getByLabelText("Pulse I step 1"));
    fireEvent.mouseEnter(screen.getByLabelText("Noise step 1"));
    fireEvent.mouseEnter(screen.getByLabelText("PCM step 8"));
    fireEvent.mouseEnter(screen.getByLabelText("Pulse I step 4"));

    expect(previewNote).toHaveBeenCalledWith("pulse1", "C5", expect.any(Number), 0.125, 0.84);
    expect(previewNoiseConfig).toHaveBeenCalledWith("short", 3);
    expect(previewSampleNote).toHaveBeenCalledWith("mic-001", "C4", "C4");
    expect(previewNote).toHaveBeenCalledTimes(1);
  });

  it("renders sustained melodic notes as continuous note blocks", () => {
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = {
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      length: 4,
      note: "C5",
    };

    const { container } = renderMatrix({ song });
    const noteBlock = screen.getByLabelText("Pulse I step 1");

    expect(noteBlock.textContent).toContain("C5");
    expect(container.querySelector('[data-note-origin-step="0"]')).toBeTruthy();
  });

  it("uses playback-rate preview for authentic PCM hover previews", () => {
    const previewSampleTrigger = vi.fn();
    const song = createDefaultSongDocument();
    song.meta.engineMode = "authentic";
    song.tracks.sample.steps[7] = {
      ...song.tracks.sample.steps[7],
      enabled: true,
      playbackRate: 1.5,
      sampleId: "mic-001",
    };
    const engine = {
      getWaveform: vi.fn(() => new Uint8Array([128])),
      previewNote: vi.fn(),
      previewNoiseConfig: vi.fn(),
      previewSampleTrigger,
    } as unknown as AudioEngine;

    renderMatrix({ engine, song });

    fireEvent.mouseEnter(screen.getByLabelText("PCM step 8"));

    expect(previewSampleTrigger).toHaveBeenCalledWith("mic-001", 1.5);
  });

  it("enables a disabled step on click and selects it", () => {
    const onUpdateMelodicStep = vi.fn();

    renderMatrix({ onUpdateMelodicStep });

    fireEvent.click(screen.getByLabelText("Pulse I step 2"));

    expect(onUpdateMelodicStep).toHaveBeenCalledWith("pulse1", 1, { enabled: true });
    expect(screen.getByLabelText("Pulse I step 2 editor")).toBeTruthy();
  });

  it("deselects a step on Escape key", () => {
    renderMatrix();

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByLabelText("Pulse I step 1 editor")).toBeNull();
  });

  it("navigates between steps with arrow keys", () => {
    renderMatrix();

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(screen.queryByLabelText("Pulse I step 1 editor")).toBeNull();
    expect(screen.getByLabelText("Pulse I step 2 editor")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();
  });

  it("navigates between voice tracks with up/down arrow keys", () => {
    renderMatrix();

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowDown" });

    expect(screen.getByLabelText("Pulse II step 1 editor")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowUp" });

    expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();
  });

  it("deletes a selected melodic step with Delete", () => {
    const onUpdateMelodicStep = vi.fn();

    renderMatrix({ onUpdateMelodicStep });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.keyDown(document, { key: "Delete" });

    expect(onUpdateMelodicStep).toHaveBeenCalledWith("pulse1", 0, { enabled: false });
    expect(screen.queryByLabelText("Pulse I step 1 editor")).toBeNull();
  });

  it("deletes a selected trigger step with Backspace", () => {
    const onUpdateNoiseStep = vi.fn();
    const song = createEmptySongDocument();
    song.tracks.noise.steps[2] = {
      ...song.tracks.noise.steps[2],
      enabled: true,
      mode: "long",
      periodIndex: 8,
    };

    renderMatrix({ onUpdateNoiseStep, song });

    fireEvent.click(screen.getByLabelText("Noise step 3"));
    fireEvent.keyDown(document, { key: "Backspace" });

    expect(onUpdateNoiseStep).toHaveBeenCalledWith(2, { enabled: false });
    expect(screen.queryByLabelText("Noise step 3 editor")).toBeNull();
  });

  it("shift-click selects enabled origin entries between the anchor and target", () => {
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, length: 3 };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, length: 1 };
    song.tracks.pulse1.steps[8] = { ...song.tracks.pulse1.steps[8], enabled: true, length: 1 };

    renderMatrix({ song });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByLabelText("Pulse I step 9"), { shiftKey: true });

    expect(screen.getByLabelText("Pulse I step 1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 9").getAttribute("aria-selected")).toBe("true");
  });

  it("does not arm drag from an unselected step before shift-click range selection", () => {
    const onMoveMelodicSelection = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, length: 3 };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, length: 1 };
    renderMatrix({ song, onMoveMelodicSelection });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.mouseDown(screen.getByLabelText("Pulse I step 5"), { clientX: 0, shiftKey: true });
    fireEvent.click(screen.getByLabelText("Pulse I step 5"), { shiftKey: true });

    expect(screen.getByLabelText("Pulse I step 1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-selected")).toBe("true");
    expect(onMoveMelodicSelection).not.toHaveBeenCalled();
  });

  it("shift-click on a hold cell resolves to the origin step", () => {
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, length: 3 };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, length: 1 };

    renderMatrix({ song });

    fireEvent.click(screen.getByLabelText("Pulse I step 5"));
    fireEvent.click(screen.getByLabelText("Pulse I step 1"), { shiftKey: true });

    expect(screen.getByLabelText("Pulse I step 1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-selected")).toBe("true");
  });

  it("shift-click on another row collapses to a single selection on that row", () => {
    renderMatrix();

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByLabelText("Pulse I step 5"), { shiftKey: true });
    fireEvent.click(screen.getByLabelText("Triangle step 1"), { shiftKey: true });

    expect(screen.getByLabelText("Triangle step 1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 1").getAttribute("aria-selected")).toBe(null);
  });

  it("drags a selected melodic note and calls the move callback with the computed delta", async () => {
    const onMoveMelodicSelection = vi.fn();
    const song = createDefaultSongDocument();

    const { container } = renderMatrix({ song, onMoveMelodicSelection });

    const cell = screen.getByLabelText("Pulse I step 1");
    const gridCell = container.querySelector<HTMLElement>('[data-step-index="0"]');

    if (gridCell === null) {
      throw new Error("Expected step cell");
    }

    setCellWidth(gridCell, 20);

    fireEvent.mouseDown(cell, { clientX: 0, clientY: 0 });
    await waitFor(() => {
      expect(screen.getByLabelText("Pulse I step 1 editor")).toBeTruthy();
    });
    fireEvent.mouseMove(window, { clientX: 45, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 45, clientY: 0 });

    expect(onMoveMelodicSelection).toHaveBeenCalledWith("pulse1", [0], 2);
    expect(cell.getAttribute("aria-selected")).toBe(null);
    expect(screen.getByLabelText("Pulse I step 3").getAttribute("aria-selected")).toBe("true");
  });

  it("drags a multi-selection once with all selected origin indexes", async () => {
    const onMoveMelodicSelection = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true };

    const { container } = renderMatrix({ song, onMoveMelodicSelection });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByLabelText("Pulse I step 5"), { shiftKey: true });

    const cell = screen.getByLabelText("Pulse I step 1");
    const gridCell = container.querySelector<HTMLElement>('[data-step-index="0"]');

    if (gridCell === null) {
      throw new Error("Expected step cell");
    }

    setCellWidth(gridCell, 20);

    fireEvent.mouseDown(cell, { clientX: 0, clientY: 0 });
    await waitFor(() => {
      expect(screen.getByLabelText("Pulse I step 1").getAttribute("aria-selected")).toBe("true");
    });
    fireEvent.mouseMove(window, { clientX: 45, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 45, clientY: 0 });

    expect(onMoveMelodicSelection).toHaveBeenCalledTimes(1);
    expect(onMoveMelodicSelection).toHaveBeenCalledWith("pulse1", [0, 4], 2);
  });

  it("does not call move callbacks for invalid drags", () => {
    const onMoveMelodicSelection = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, length: 3 };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, length: 1 };

    const { container } = renderMatrix({ song, onMoveMelodicSelection });

    const cell = screen.getByLabelText("Pulse I step 1");
    const gridCell = container.querySelector<HTMLElement>('[data-step-index="0"]');

    if (gridCell === null) {
      throw new Error("Expected step cell");
    }

    setCellWidth(gridCell, 20);

    fireEvent.pointerDown(cell, { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 80 });
    fireEvent.pointerUp(window, { clientX: 80 });

    expect(onMoveMelodicSelection).not.toHaveBeenCalled();
  });

  it("drags the right edge to resize a melodic note", () => {
    const onResizeMelodicStep = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, length: 2 };
    const { container } = renderMatrix({ song, onResizeMelodicStep });
    const firstCell = container.querySelector<HTMLElement>('[data-step-index="0"]');

    if (firstCell === null) {
      throw new Error("Expected first step cell");
    }

    setCellWidth(firstCell, 20);

    fireEvent.mouseDown(screen.getByLabelText("Resize end of Pulse I step 1"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 40, clientY: 0 });

    expect(onResizeMelodicStep).toHaveBeenCalledWith("pulse1", 0, 0, 4);
  });

  it("drags the left edge to resize a melodic note", () => {
    const onResizeMelodicStep = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, length: 3 };
    const { container } = renderMatrix({ song, onResizeMelodicStep });
    const firstCell = container.querySelector<HTMLElement>('[data-step-index="0"]');

    if (firstCell === null) {
      throw new Error("Expected first step cell");
    }

    setCellWidth(firstCell, 20);

    fireEvent.mouseDown(screen.getByLabelText("Resize start of Pulse I step 5"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: -40, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: -40, clientY: 0 });

    expect(onResizeMelodicStep).toHaveBeenCalledWith("pulse1", 4, 2, 5);
  });

  it("resizes across a wrapped row boundary", () => {
    const originalMatchMedia = window.matchMedia;
    const matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMedia,
    });

    const onResizeMelodicStep = vi.fn();
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[7] = { ...song.tracks.pulse1.steps[7], enabled: true, length: 1 };
    const { container } = renderMatrix({ song, onResizeMelodicStep });
    const step0 = container.querySelector<HTMLElement>('[data-step-index="0"]');
    const step1 = container.querySelector<HTMLElement>('[data-step-index="1"]');
    const step8 = container.querySelector<HTMLElement>('[data-step-index="8"]');

    if (step0 === null || step1 === null || step8 === null) {
      throw new Error("Expected grid cells");
    }

    setCellRect(step0, 0, 0, 20);
    setCellRect(step1, 24, 0, 20);
    setCellRect(step8, 0, 52, 20);

    fireEvent.mouseDown(screen.getByLabelText("Resize end of Pulse I step 8"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: -144, clientY: 52 });
    fireEvent.mouseUp(window, { clientX: -144, clientY: 52 });

    expect(onResizeMelodicStep).toHaveBeenCalledWith("pulse1", 7, 7, 3);

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it("clamps resize before the next melodic note", () => {
    const onResizeMelodicStep = vi.fn();
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, length: 2 };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, length: 1 };
    const { container } = renderMatrix({ song, onResizeMelodicStep });
    const firstCell = container.querySelector<HTMLElement>('[data-step-index="0"]');

    if (firstCell === null) {
      throw new Error("Expected first step cell");
    }

    setCellWidth(firstCell, 20);

    fireEvent.mouseDown(screen.getByLabelText("Resize end of Pulse I step 1"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 0 });

    expect(onResizeMelodicStep).toHaveBeenCalledWith("pulse1", 0, 0, 4);
  });

  it("collapses multi-selection to the anchor before arrow navigation", () => {
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true };

    renderMatrix({ song });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByLabelText("Pulse I step 5"), { shiftKey: true });
    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(screen.getByLabelText("Pulse I step 2 editor")).toBeTruthy();
    expect(screen.getByLabelText("Pulse I step 2").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-selected")).toBe(null);
  });

  it("clears multi-selection on Escape", () => {
    const song = createDefaultSongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true };
    song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true };

    renderMatrix({ song });

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByLabelText("Pulse I step 5"), { shiftKey: true });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByLabelText("Pulse I step 1 editor")).toBeNull();
    expect(screen.getByLabelText("Pulse I step 1").getAttribute("aria-selected")).toBe(null);
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-selected")).toBe(null);
  });
});
