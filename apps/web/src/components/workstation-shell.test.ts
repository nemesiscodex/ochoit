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

  it("opens the voice text editor with the current arrangement", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("1: C5\n5: E5\n9: G5\n13: E5");
  });

  it("applies a pasted voice arrangement and ignores steps beyond the loop length", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    fireEvent.change(textarea, {
      target: {
        value: "1: e4\n3: g4\n5: a4\n17: c5",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Arrangement" }));

    expect(screen.queryByLabelText("Pulse I arrangement text")).toBeNull();
    expect(screen.getByRole("button", { name: "Enable Pulse I step 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable Pulse I step 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable Pulse I step 9" })).toBeTruthy();

    const pulseStepOneNote = screen.getByLabelText("Pulse I step 1 note");
    const pulseStepThreeNote = screen.getByLabelText("Pulse I step 3 note");

    expect(pulseStepOneNote.textContent).toBe("E4");
    expect(pulseStepThreeNote.textContent).toBe("G4");
  });

  it("applies ranged melodic arrangements and renders held steps", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    fireEvent.change(textarea, {
      target: {
        value: "1-3: e4\n5-6: g4",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Arrangement" }));

    expect(screen.queryByLabelText("Pulse I arrangement text")).toBeNull();
    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("3 st");
    expect(screen.getAllByText("Hold E4")).toHaveLength(2);
    expect(screen.getByLabelText("Pulse I step 5 duration").textContent).toBe("2 st");
  });

  it("opens the noise trigger text editor with the current arrangement", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    const textarea = screen.getByLabelText("Noise trigger text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Noise trigger text to be a textarea.");
    }

    expect(textarea.value).toBe("1: snare\n3: hiss\n5: snare\n7: hiss\n9: snare\n11: hiss\n13: snare\n15: hiss");
  });

  it("applies pasted noise and PCM trigger text arrangements", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    const noiseTextarea = screen.getByLabelText("Noise trigger text");

    if (!(noiseTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Noise trigger text to be a textarea.");
    }

    fireEvent.change(noiseTextarea, {
      target: {
        value: "2: hat\n4: crash\n18: snare",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Arrangement" }));

    expect(screen.queryByLabelText("Noise trigger text")).toBeNull();
    expect(screen.getByRole("button", { name: "Enable Noise step 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable Noise step 2" })).toBeTruthy();
    expect(screen.getByLabelText("Noise step 2 trigger").textContent).toBe("hat");
    expect(screen.getByLabelText("Noise step 4 trigger").textContent).toBe("crsh");

    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const pcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(pcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    fireEvent.change(pcmTextarea, {
      target: {
        value: "2: vox-hit@0.75x\n6: mic-001@1.5\n20: vox-hit",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Arrangement" }));

    expect(screen.queryByLabelText("PCM trigger text")).toBeNull();
    expect(screen.getByRole("button", { name: "Disable PCM step 2" })).toBeTruthy();
    expect(screen.getByLabelText("PCM step 2 trigger").textContent).toBe("vox-hit 0.75x");
    expect(screen.getByLabelText("PCM step 6 trigger").textContent).toBe("vox-hit 1.5x");
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

  it("updates per-voice volume from the row controls", () => {
    render(React.createElement(WorkstationShell));

    const pulseVolume = screen.getByLabelText("Pulse I volume");

    if (!(pulseVolume instanceof HTMLInputElement)) {
      throw new Error("Expected Pulse I volume to be a range input.");
    }

    fireEvent.change(pulseVolume, { target: { value: "23" } });

    expect(pulseVolume.value).toBe("23");
    expect(screen.getByText("23%")).toBeTruthy();
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

  it("extends and shortens melodic step durations from the grid controls", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Extend Pulse I step 1 duration" }));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("2 st");
    expect(screen.getByText("Hold C5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Shorten Pulse I step 1 duration" }));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("1 st");
    expect(screen.queryByText("Hold C5")).toBeNull();
  });

  it("updates the noise trigger controls from the picker", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Enable Noise step 2" }));

    const triggerButton = screen.getByLabelText("Noise step 2 trigger");

    if (!(triggerButton instanceof HTMLButtonElement)) {
      throw new Error("Expected Noise step 2 trigger to be a button.");
    }

    expect(triggerButton.disabled).toBe(false);

    fireEvent.click(triggerButton);
    fireEvent.click(screen.getByRole("button", { name: "Select noise trigger Crash" }));

    expect(triggerButton.textContent).toBe("crsh");
  });

  it("updates the PCM trigger controls from the picker", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Enable PCM step 2" }));

    const triggerButton = screen.getByLabelText("PCM step 2 trigger");

    if (!(triggerButton instanceof HTMLButtonElement)) {
      throw new Error("Expected PCM step 2 trigger to be a button.");
    }

    expect(triggerButton.disabled).toBe(false);

    fireEvent.click(triggerButton);
    fireEvent.click(screen.getByRole("button", { name: "Assign vox-hit at 1.5x" }));

    expect(triggerButton.textContent).toBe("vox-hit 1.5x");
  });
});
