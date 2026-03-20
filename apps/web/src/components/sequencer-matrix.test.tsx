import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import type { AudioEngine } from "@/features/audio/audio-engine";
import { createDefaultSongDocument } from "@/features/song/song-document";

function renderMatrix(overrides: Record<string, unknown> = {}) {
  const props = {
    defaultSampleId: null,
    engine: null,
    onOpenMelodicTrackEditor: vi.fn(),
    onOpenTriggerTrackEditor: vi.fn(),
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

    fireEvent.click(screen.getByLabelText("Pulse I step 2"));

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

    expect(previewNote).toHaveBeenCalledWith("triangle", "D3");
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

    expect(previewNote).toHaveBeenCalledWith("pulse1", "C5", 120, 0.75);
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
});
