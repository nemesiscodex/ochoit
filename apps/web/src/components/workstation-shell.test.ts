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
        /Pulse voices 1 and 2, the triangle voice, the noise voice, transport playback, and per-voice waveform monitoring are live/i,
      ),
    ).toBeTruthy();
  });
});
