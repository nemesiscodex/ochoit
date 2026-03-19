import { fireEvent, render, screen } from "@testing-library/react";
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
  });

  it("forwards play and stop actions to the audio engine hook", () => {
    const stoppedResult = createUseAudioEngineResult("stopped");
    mockUseAudioEngine.mockReturnValueOnce(stoppedResult);

    const { rerender } = render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(stoppedResult.startTransport).toHaveBeenCalledTimes(1);

    const playingResult = createUseAudioEngineResult("playing");
    mockUseAudioEngine.mockReturnValueOnce(playingResult);
    rerender(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

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

  it("renders the sample deck sidebar", () => {
    render(React.createElement(WorkstationShell));

    expect(screen.getByText("Sample Deck")).toBeTruthy();
    expect(screen.getByText("Song Info")).toBeTruthy();
  });

  it("toggles the mute state for a specific voice", () => {
    render(React.createElement(WorkstationShell));

    const muteButton = screen.getByRole("button", { name: "Mute Pulse I" });

    fireEvent.click(muteButton);

    expect(screen.getByRole("button", { name: "Unmute Pulse I" })).toBeTruthy();
  });

  it("updates melodic steps from the note-entry controls", () => {
    render(React.createElement(WorkstationShell));

    // Enable Pulse I step 2
    fireEvent.click(screen.getByRole("button", { name: "Enable Pulse I step 2" }));

    // Open the note picker for Pulse I step 2
    const pulseStepTwoNote = screen.getByLabelText("Pulse I step 2 note");

    if (!(pulseStepTwoNote instanceof HTMLButtonElement)) {
      throw new Error("Expected Pulse I step 2 note to be a button.");
    }

    expect(pulseStepTwoNote.disabled).toBe(false);

    // Open the picker and select D5
    fireEvent.click(pulseStepTwoNote);
    fireEvent.click(screen.getByRole("button", { name: "Select note D5" }));

    // The trigger button should now show D5
    expect(pulseStepTwoNote.textContent).toBe("D5");

    // Disable Pulse I step 1
    fireEvent.click(screen.getByRole("button", { name: "Disable Pulse I step 1" }));

    const pulseStepOneNote = screen.getByLabelText("Pulse I step 1 note");

    if (!(pulseStepOneNote instanceof HTMLButtonElement)) {
      throw new Error("Expected Pulse I step 1 note to be a button.");
    }

    expect(pulseStepOneNote.disabled).toBe(true);
  });
});
