import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkstationShell } from "@/components/workstation-shell";
import * as useAudioEngineModule from "@/features/audio/use-audio-engine";

vi.mock("@/features/audio/use-audio-engine", () => ({
  useAudioEngine: vi.fn(),
}));

function createUseAudioEngineResult(
  playbackState: "stopped" | "playing" = "stopped",
): ReturnType<typeof useAudioEngineModule.useAudioEngine> {
  return {
    engine: null,
    engineState: "running",
    errorMessage: null,
    transportState: {
      playbackState,
      nextStep: 0,
      nextStepTime: null,
      loopCount: 0,
    },
    initializeAudio: vi.fn(async () => null),
    suspendAudio: vi.fn(async () => undefined),
    startTransport: vi.fn(async () => undefined),
    stopTransport: vi.fn(),
  };
}

describe("workstation-shell", () => {
  const mockUseAudioEngine = vi.mocked(useAudioEngineModule.useAudioEngine);

  beforeEach(() => {
    mockUseAudioEngine.mockReset();
    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult());
  });

  it("updates the bpm and loop length fields in the transport bar", () => {
    render(React.createElement(WorkstationShell));

    const bpmInput = screen.getByLabelText("BPM");
    const loopLengthInput = screen.getByLabelText("Loop Length");

    fireEvent.change(bpmInput, { target: { value: "172" } });
    fireEvent.change(loopLengthInput, { target: { value: "20" } });

    expect(screen.getByDisplayValue("172")).toBeTruthy();
    expect(screen.getByDisplayValue("20")).toBeTruthy();
    expect(screen.getByText("172 bpm")).toBeTruthy();
    expect(screen.getAllByText("20 steps").length).toBeGreaterThan(0);
  });

  it("forwards play and stop actions to the audio engine hook", () => {
    const stoppedResult = createUseAudioEngineResult("stopped");
    mockUseAudioEngine.mockReturnValueOnce(stoppedResult);

    const { rerender } = render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Play Pattern" }));

    expect(stoppedResult.startTransport).toHaveBeenCalledTimes(1);

    const playingResult = createUseAudioEngineResult("playing");
    mockUseAudioEngine.mockReturnValueOnce(playingResult);
    rerender(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(playingResult.stopTransport).toHaveBeenCalledTimes(1);
  });

  it("renders the full five-row sequencer matrix", () => {
    render(React.createElement(WorkstationShell));

    expect(screen.getByRole("heading", { name: "Pulse I" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pulse II" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triangle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Noise" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PCM" })).toBeTruthy();
    expect(screen.getByText("Pattern Ruler")).toBeTruthy();
  });

  it("describes the live audio engine status with the triangle voice included", () => {
    render(React.createElement(WorkstationShell));

    expect(
      screen.getByText(
        /Pulse and triangle note entry, the full five-voice playback engine, transport playback, and per-voice waveform monitoring are live/i,
      ),
    ).toBeTruthy();
  });

  it("toggles the mute state for a specific voice", () => {
    render(React.createElement(WorkstationShell));

    const pulseRowHeading = screen.getByRole("heading", { name: "Pulse I" });
    const pulseRow = pulseRowHeading.closest('[data-slot="card"]');

    if (!(pulseRow instanceof HTMLElement)) {
      throw new Error("Expected Pulse I row card.");
    }

    fireEvent.click(within(pulseRow).getByRole("button", { name: "Mute Pulse I" }));

    expect(within(pulseRow).getByRole("button", { name: "Unmute Pulse I" })).toBeTruthy();
    expect(within(pulseRow).getByText("yes")).toBeTruthy();
  });

  it("updates melodic steps from the note-entry controls", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Enable Pulse I step 2" }));

    const pulseStepTwoNote = screen.getByLabelText("Pulse I step 2 note");

    if (!(pulseStepTwoNote instanceof HTMLSelectElement)) {
      throw new Error("Expected Pulse I step 2 note to be a select.");
    }

    expect(pulseStepTwoNote.disabled).toBe(false);

    fireEvent.change(pulseStepTwoNote, {
      target: { value: "D5" },
    });

    expect(pulseStepTwoNote.value).toBe("D5");

    fireEvent.click(screen.getByRole("button", { name: "Disable Pulse I step 1" }));

    const pulseStepOneNote = screen.getByLabelText("Pulse I step 1 note");

    if (!(pulseStepOneNote instanceof HTMLSelectElement)) {
      throw new Error("Expected Pulse I step 1 note to be a select.");
    }

    expect(pulseStepOneNote.disabled).toBe(true);
  });
});
