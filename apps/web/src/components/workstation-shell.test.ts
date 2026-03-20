import { act, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkstationShell } from "@/components/workstation-shell";
import type { AudioEngine } from "@/features/audio/audio-engine";
import type { RecordedSampleDraft } from "@/features/audio/sample-recorder";
import * as useAudioEngineModule from "@/features/audio/use-audio-engine";
import * as sampleRecorderModule from "@/features/audio/sample-recorder";

vi.mock("@/features/audio/use-audio-engine", () => ({
  useAudioEngine: vi.fn(),
}));

vi.mock("@/features/audio/sample-recorder", async () => {
  const actual = await vi.importActual<typeof import("@/features/audio/sample-recorder")>(
    "@/features/audio/sample-recorder",
  );

  return {
    ...actual,
    useSampleRecorder: vi.fn(),
  };
});

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

function createUseSampleRecorderResult(
  overrides: Partial<ReturnType<typeof sampleRecorderModule.useSampleRecorder>> = {},
): ReturnType<typeof sampleRecorderModule.useSampleRecorder> {
  return {
    errorMessage: null,
    permissionState: "granted",
    recordingDurationMs: 0,
    startRecording: vi.fn(async () => undefined),
    status: "ready",
    stopRecording: vi.fn(),
    waveform: new Uint8Array([128]),
    ...overrides,
  };
}

describe("workstation-shell", () => {
  const mockUseAudioEngine = vi.mocked(useAudioEngineModule.useAudioEngine);
  const mockUseSampleRecorder = vi.mocked(sampleRecorderModule.useSampleRecorder);
  let latestRecorderOptions: Parameters<typeof sampleRecorderModule.useSampleRecorder>[0] | null = null;

  beforeEach(() => {
    mockUseAudioEngine.mockReset();
    mockUseSampleRecorder.mockReset();
    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult());
    latestRecorderOptions = null;
    mockUseSampleRecorder.mockImplementation((options) => {
      latestRecorderOptions = options;

      return createUseSampleRecorderResult();
    });
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
    mockUseAudioEngine.mockReturnValue(stoppedResult);

    const { rerender } = render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(stoppedResult.startTransport).toHaveBeenCalledTimes(1);

    const playingResult = createUseAudioEngineResult("playing");
    mockUseAudioEngine.mockReturnValue(playingResult);
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

    expect(textarea.value).toBe("1: C5 @12.5%\n5: E5 @25%\n9: G5 @50%\n13: E5 @25%");
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
        value: "1: e4 @25%\n3: g4\n5: a4 @75%\n17: c5",
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
    expect(screen.getByLabelText("Pulse I step 1 duty cycle").textContent).toBe("25%");
    expect(screen.getByLabelText("Pulse I step 3 duty cycle").textContent).toBe("50%");
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

  it("describes the pulse text format with optional duty values", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    expect(screen.getByText(/format 1: E4 @25% or 1-4: E4 @12.5%/i)).toBeTruthy();
    expect(screen.getByText(/defaults to 50%/i)).toBeTruthy();
  });

  it("opens the noise trigger text editor with the current arrangement", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    const textarea = screen.getByLabelText("Noise trigger text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Noise trigger text to be a textarea.");
    }

    expect(textarea.value).toBe(
      "1: short P3\n3: long P8\n5: short P3\n7: long P8\n9: short P3\n11: long P8\n13: short P3\n15: long P8",
    );
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
        value: "2: short P1\n4: long P12\n18: short P3",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Arrangement" }));

    expect(screen.queryByLabelText("Noise trigger text")).toBeNull();
    expect(screen.getByRole("button", { name: "Enable Noise step 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable Noise step 2" })).toBeTruthy();
    expect(screen.getByLabelText("Noise step 2 trigger").textContent).toBe("hat");
    expect(screen.getByLabelText("Noise step 4 trigger").textContent).toBe("crsh");
    expect(screen.getByLabelText("Noise step 2 noise settings").textContent).toBe("short P1");
    expect(screen.getByLabelText("Noise step 4 noise settings").textContent).toBe("long P12");

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

  it("describes the noise text format with explicit mode and period values", () => {
    render(React.createElement(WorkstationShell));

    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    expect(screen.getByText(/format 1: short P3 or 1: long P12/i)).toBeTruthy();
    expect(screen.getByText(/preset aliases/i)).toBeTruthy();
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

  it("updates pulse duty from the sequencer controls", () => {
    render(React.createElement(WorkstationShell));

    const pulseDuty = screen.getByLabelText("Pulse I step 1 duty cycle");

    if (!(pulseDuty instanceof HTMLButtonElement)) {
      throw new Error("Expected Pulse I step 1 duty cycle to be a button.");
    }

    expect(pulseDuty.textContent).toBe("12.5%");

    fireEvent.click(pulseDuty);
    fireEvent.click(screen.getByRole("button", { name: "Select pulse duty 75%" }));

    expect(screen.getByLabelText("Pulse I step 1 duty cycle").textContent).toBe("75%");
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

  it("updates the noise rate and mode controls from the picker", () => {
    render(React.createElement(WorkstationShell));

    const noiseSettings = screen.getByLabelText("Noise step 1 noise settings");

    if (!(noiseSettings instanceof HTMLButtonElement)) {
      throw new Error("Expected Noise step 1 noise settings to be a button.");
    }

    expect(noiseSettings.textContent).toBe("short P3");

    fireEvent.click(noiseSettings);
    fireEvent.click(screen.getByRole("button", { name: "Select noise config long P12" }));

    expect(screen.getByLabelText("Noise step 1 noise settings").textContent).toBe("long P12");
    expect(screen.getAllByText("long P12").length).toBeGreaterThan(0);
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

  it("stores a completed microphone take in the sample deck", () => {
    const startRecording = vi.fn(async () => undefined);
    const stopRecording = vi.fn();

    mockUseSampleRecorder.mockImplementation((options) => {
      latestRecorderOptions = options;

      return createUseSampleRecorderResult({
        startRecording,
        status: "recording",
        stopRecording,
      });
    });

    render(React.createElement(WorkstationShell));

    const sidebar = screen.getByText("Sample Deck").closest("aside");

    if (sidebar === null) {
      throw new Error("Expected sample deck sidebar.");
    }

    fireEvent.click(within(sidebar).getByRole("button", { name: "Stop" }));

    expect(stopRecording).toHaveBeenCalledTimes(1);

    const recording: RecordedSampleDraft = {
      asset: {
        id: "mic-002",
        name: "mic-002",
        source: "mic",
        sampleRate: 11_025,
        frameCount: 4,
        channels: 1,
        trim: {
          startFrame: 0,
          endFrame: 4,
        },
        pcm: [0, 0.5, -0.25, 0],
      },
      durationMs: 180,
      waveform: new Uint8Array([128, 160, 100, 128]),
    };

    act(() => {
      latestRecorderOptions?.onRecordingComplete(recording);
    });

    expect(screen.getByText("mic-002")).toBeTruthy();
    expect(screen.getByText("4 fr")).toBeTruthy();
  });

  it("previews the current deck sample through the audio engine", async () => {
    const previewSampleTrigger = vi.fn();
    const previewEngine = {
      previewSampleTrigger,
    } as unknown as AudioEngine;
    const initializeAudio = vi.fn<() => Promise<AudioEngine | null>>(async () => previewEngine);

    mockUseAudioEngine.mockReturnValue({
      ...createUseAudioEngineResult(),
      initializeAudio,
    });

    render(React.createElement(WorkstationShell));

    const sidebar = screen.getByText("Sample Deck").closest("aside");

    if (sidebar === null) {
      throw new Error("Expected sample deck sidebar.");
    }

    fireEvent.click(within(sidebar).getByRole("button", { name: "Preview" }));

    expect(initializeAudio).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(previewSampleTrigger).toHaveBeenCalledWith("mic-001");
  });
});
