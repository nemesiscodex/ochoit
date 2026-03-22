import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkstationShell } from "@/components/workstation-shell";
import type { AudioEngine } from "@/features/audio/audio-engine";
import type { RecordedSampleDraft } from "@/features/audio/sample-recorder";
import { createDefaultSongDocument, SONG_MAX_SAMPLE_COUNT, type SongDocument } from "@/features/song/song-document";
import { buildSongShareUrl, serializeSongShareText } from "@/features/song/song-share";
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
  engineState: useAudioEngineModule.AudioBootstrapState = "running",
): ReturnType<typeof useAudioEngineModule.useAudioEngine> {
  return {
    engine: null,
    engineState,
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

function createWorkstationShellElement(initialSong: SongDocument = createDefaultSongDocument()) {
  return React.createElement(WorkstationShell, { initialSong, skin: "classic" });
}

function createSkinnedWorkstationShellElement(
  skin: "classic" | "8bitcn",
  initialSong: SongDocument = createDefaultSongDocument(),
) {
  return React.createElement(WorkstationShell, { initialSong, skin });
}

function renderWorkstationShell(initialSong: SongDocument = createDefaultSongDocument()) {
  return render(createWorkstationShellElement(initialSong));
}

function renderEmptyWorkstationShell() {
  return render(React.createElement(WorkstationShell, { skin: "classic" }));
}

describe("workstation-shell", () => {
  const mockUseAudioEngine = vi.mocked(useAudioEngineModule.useAudioEngine);
  const mockUseSampleRecorder = vi.mocked(sampleRecorderModule.useSampleRecorder);
  let latestRecorderOptions: Parameters<typeof sampleRecorderModule.useSampleRecorder>[0] | null = null;
  let clipboardWriteText: ReturnType<typeof vi.fn<(value: string) => Promise<void>>>;
  let confirmDialog: ReturnType<typeof vi.fn<(message?: string) => boolean>>;
  let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  let anchorClick: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    mockUseAudioEngine.mockReset();
    mockUseSampleRecorder.mockReset();
    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult());
    latestRecorderOptions = null;
    mockUseSampleRecorder.mockImplementation((options) => {
      latestRecorderOptions = options;

      return createUseSampleRecorderResult();
    });
    clipboardWriteText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });
    confirmDialog = vi.fn(() => true);
    window.confirm = confirmDialog;
    createObjectURL = vi.fn(() => "blob:arrangement");
    revokeObjectURL = vi.fn();
    anchorClick = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: anchorClick,
    });
    window.history.replaceState({}, "", "/");
  });

  it("updates the bpm and loop length fields in the transport bar", () => {
    renderWorkstationShell();

    const bpmInput = screen.getByLabelText("BPM");
    const loopLengthInput = screen.getByLabelText("Loop Length");

    fireEvent.change(bpmInput, { target: { value: "172" } });
    fireEvent.change(loopLengthInput, { target: { value: "20" } });

    expect(screen.getByDisplayValue("172")).toBeTruthy();
    expect(screen.getByDisplayValue("20")).toBeTruthy();
  });

  it("renders the classic workstation view", () => {
    renderWorkstationShell();

    expect(screen.getByTestId("classic-workstation-view")).toBeTruthy();
    expect(screen.queryByTestId("retro-workstation-view")).toBeNull();
  });

  it("renders the retro wrapper when 8bitcn skin is selected", () => {
    render(createSkinnedWorkstationShellElement("8bitcn"));

    expect(screen.getByTestId("retro-workstation-view")).toBeTruthy();
  });

  it("updates the global volume from the transport bar", () => {
    renderWorkstationShell();

    const globalVolume = screen.getByLabelText("Global Volume");

    if (!(globalVolume instanceof HTMLInputElement)) {
      throw new Error("Expected Global Volume to be a range input.");
    }

    fireEvent.change(globalVolume, { target: { value: "61" } });

    expect(globalVolume.value).toBe("61");
    expect(screen.getByText("61%")).toBeTruthy();

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.mixer.masterVolume).toBe(0.61);
  });

  it("toggles old speaker mode from the transport bar", () => {
    renderWorkstationShell();

    const speakerModeButton = screen.getByRole("button", { name: "Lo-fi speaker filter" });

    expect(speakerModeButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(speakerModeButton);

    expect(speakerModeButton.getAttribute("aria-pressed")).toBe("true");

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.mixer.oldSpeakerMode).toBe(true);
  });

  it("highlights start audio as the first action before the engine is ready", () => {
    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult("stopped", "idle"));

    renderWorkstationShell();

    expect(screen.getByText("First step")).toBeTruthy();
    expect(screen.getByText(/before using the sequencer/i)).toBeTruthy();

    const startAudioButton = screen.getByRole("button", { name: "Start Audio" });
    expect(startAudioButton.getAttribute("aria-describedby")).toBe("audio-init-prompt");
  });

  it("removes the audio gate once audio is running", () => {
    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult("stopped", "idle"));

    const { rerender } = renderWorkstationShell();

    expect(screen.getByText("First step")).toBeTruthy();

    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult("stopped", "running"));
    rerender(createWorkstationShellElement());

    expect(screen.queryByText("First step")).toBeNull();
    expect(screen.getByRole("button", { name: "Audio On" }).getAttribute("aria-describedby")).toBeNull();
  });

  it("forwards play and stop actions to the audio engine hook", () => {
    const stoppedResult = createUseAudioEngineResult("stopped");
    mockUseAudioEngine.mockReturnValue(stoppedResult);

    const { rerender } = renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(stoppedResult.startTransport).toHaveBeenCalledTimes(1);

    const playingResult = createUseAudioEngineResult("playing");
    mockUseAudioEngine.mockReturnValue(playingResult);
    rerender(createWorkstationShellElement());

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    expect(playingResult.stopTransport).toHaveBeenCalledTimes(1);
  });

  it("renders the full five-row sequencer matrix", () => {
    renderWorkstationShell();

    expect(screen.getByRole("heading", { name: "Pulse I" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pulse II" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triangle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Noise" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PCM" })).toBeTruthy();
    expect(screen.getByText("Pattern Ruler")).toBeTruthy();
  });

  it("surfaces the current inspired PCM behavior in the song info panel", () => {
    renderWorkstationShell();

    expect(screen.getByText("Inspired Sampler")).toBeTruthy();
    expect(screen.getByText(/chromatic sampler/i)).toBeTruthy();
    expect(screen.getByText(/every clip gets a base note/i)).toBeTruthy();
  });

  it("starts without any preconfigured notes or recordings when no initial song is provided", () => {
    renderEmptyWorkstationShell();

    expect(screen.getByDisplayValue("(No name)")).toBeTruthy();
    expect(screen.getByDisplayValue("(Anonymous)")).toBeTruthy();
    expect(screen.getByText("Record something to build your PCM clip list.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("");
  });

  it("loads a shared song from the url on mount", async () => {
    const sharedSong = createDefaultSongDocument();
    sharedSong.meta.name = "Link Tune";
    sharedSong.transport.bpm = 172;

    window.history.replaceState({}, "", buildSongShareUrl(window.location.href, sharedSong));

    renderWorkstationShell();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Link Tune")).toBeTruthy();
      expect(screen.getByText("172 bpm")).toBeTruthy();
      expect(screen.getByText("Loaded shared song from the current link.")).toBeTruthy();
    });
  });

  it("loads a built-in example from the examples dialog", async () => {
    renderEmptyWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Open examples" }));
    fireEvent.click(screen.getByRole("button", { name: "Load example Mario Theme" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Mario Theme")).toBeTruthy();
      expect(screen.getByDisplayValue("nemesiscodex")).toBeTruthy();
      expect(screen.getByText("Loaded example: Mario Theme.")).toBeTruthy();
    });
  });

  it("copies a share link and updates the current url", async () => {
    renderWorkstationShell();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy shareable link to clipboard" }));
    });

    await waitFor(() => {
      expect(window.location.hash).toContain("song=");
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText.mock.calls[0]?.[0]).toContain("#song=");
    expect(screen.getByText("Share link copied to clipboard.")).toBeTruthy();
  });

  it("downloads the current arrangement as a wav file", async () => {
    renderWorkstationShell();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download arrangement as WAV file" }));
    });

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });

    const exportedBlob = createObjectURL.mock.calls[0]?.[0];

    if (!(exportedBlob instanceof Blob)) {
      throw new Error("Expected WAV export to create a Blob.");
    }

    expect(exportedBlob.type).toBe("audio/wav");
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:arrangement");
    expect(screen.getByText("WAV download started.")).toBeTruthy();
  });

  it("opens the share dsl editor and copies the current dsl text", async () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit share DSL" }));

    const textarea = screen.getByLabelText("Share DSL text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected share DSL text to be a textarea.");
    }

    expect(textarea.value).toContain("!v=3;");
    expect(textarea.value).toContain("=1;vol=");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy DSL" }));
    });

    expect(clipboardWriteText).toHaveBeenCalled();
    expect(clipboardWriteText.mock.calls.at(-1)?.[0]).toContain("!v=3;");
    expect(screen.getByText("Share DSL copied to clipboard.")).toBeTruthy();
  });

  it("applies pasted share dsl text to replace the current song", async () => {
    const sharedSong = createDefaultSongDocument();
    sharedSong.meta.name = "DSL Tune";
    sharedSong.transport.bpm = 180;
    sharedSong.tracks.pulse1.muted = true;

    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit share DSL" }));

    const textarea = screen.getByLabelText("Share DSL text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected share DSL text to be a textarea.");
    }

    fireEvent.change(textarea, {
      target: {
        value: serializeSongShareText(sharedSong),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply DSL" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("DSL Tune")).toBeTruthy();
      expect(screen.getByText("180 bpm")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Unmute Pulse I" })).toBeTruthy();
      expect(screen.getByText("Loaded song from share DSL.")).toBeTruthy();
    });
  });

  it("updates the song name from the song info panel", () => {
    renderWorkstationShell();

    const nameInput = screen.getByLabelText("Song Name");

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error("Expected Song Name to be an input.");
    }

    fireEvent.change(nameInput, { target: { value: "Boss Theme" } });

    expect(nameInput.value).toBe("Boss Theme");

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.meta.name).toBe("Boss Theme");
  });

  it("updates the author from the song info panel", () => {
    renderWorkstationShell();

    const authorInput = screen.getByLabelText("Author");

    if (!(authorInput instanceof HTMLInputElement)) {
      throw new Error("Expected Author to be an input.");
    }

    fireEvent.change(authorInput, { target: { value: "Julio" } });

    expect(authorInput.value).toBe("Julio");

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.meta.author).toBe("Julio");
  });

  it("clears the current song, recordings, and share link after confirmation", async () => {
    const sharedSong = createDefaultSongDocument();

    window.history.replaceState({}, "", buildSongShareUrl(window.location.href, sharedSong));

    renderWorkstationShell();

    await waitFor(() => {
      expect(window.location.hash).toContain("song=");
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear song" }));

    expect(confirmDialog).toHaveBeenCalledWith(
      "Are you sure? This will clear all notes, recordings, and the current song link.",
    );

    await waitFor(() => {
      expect(window.location.hash).toBe("");
    });

    expect(screen.getByText("Cleared the current song and removed the shared link.")).toBeTruthy();
    expect(screen.getByText("Record something to build your PCM clip list.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("");
  });

  it("opens the voice text editor with the current arrangement", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("1: C5 @12.5%\n5: E5 @25%\n9: G5\n13: E5 @25%");
  });

  it("applies a pasted voice arrangement and ignores steps beyond the loop length", () => {
    renderWorkstationShell();

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

    // Verify the arrangement via re-opening the text editor (round-trip)
    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const verifyTextarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(verifyTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(verifyTextarea.value).toBe("1: E4 @25%\n3: G4\n5: A4 @75%");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Spot check: select step 1 to verify note + duty
    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 note").textContent).toBe("E4");
  });

  it("applies ranged melodic arrangements and renders held steps", () => {
    renderWorkstationShell();

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

    // Select step 1 to verify duration
    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("3 st");

    // Hold cells should show the note name
    expect(screen.getByLabelText("Pulse I step 2").textContent).toContain("E4");
    expect(screen.getByLabelText("Pulse I step 3").textContent).toContain("E4");

    // Deselect, then select step 5
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("Pulse I step 5"));

    expect(screen.getByLabelText("Pulse I step 5 duration").textContent).toBe("2 st");
  });

  it("describes the pulse text format with optional duty values", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    expect(screen.getByText(/format 1: E4 @25% or 1-4: E4 @12.5%/i)).toBeTruthy();
    expect(screen.getByText(/defaults to 50%/i)).toBeTruthy();
  });

  it("opens the noise trigger text editor with the current arrangement", () => {
    renderWorkstationShell();

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
    renderWorkstationShell();

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

    // Verify via text editor round-trip
    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    const verifyNoiseTextarea = screen.getByLabelText("Noise trigger text");

    if (!(verifyNoiseTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Noise trigger text to be a textarea.");
    }

    expect(verifyNoiseTextarea.value).toBe("2: short P1\n4: long P12");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Select noise step 2 to verify config
    fireEvent.click(screen.getByLabelText("Noise step 2"));

    expect(screen.getByLabelText("Noise step 2 noise settings").textContent).toBe("short P1");

    fireEvent.keyDown(document, { key: "Escape" });

    // Apply PCM arrangement
    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const pcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(pcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    fireEvent.change(pcmTextarea, {
      target: {
        value: "2: vox-hit>D5\n6: mic-001>A#2\n20: vox-hit",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Arrangement" }));

    expect(screen.queryByLabelText("PCM trigger text")).toBeNull();

    // Verify via text editor round-trip
    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const verifyPcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(verifyPcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    expect(verifyPcmTextarea.value).toBe("2: mic-001>D5\n6: mic-001>A#2");
  });

  it("describes the noise text format with explicit mode and period values", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    expect(screen.getByText(/format 1: short P3 or 1: long P12/i)).toBeTruthy();
    expect(screen.getByText(/preset aliases/i)).toBeTruthy();
  });

  it("describes the PCM text format as note-based in inspired mode", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    expect(screen.getByText(/Inspired mode is note-based/i)).toBeTruthy();
    expect(screen.getByText(/set its base note/i)).toBeTruthy();
    expect(screen.getByText(/format 8: mic-001>C5/i)).toBeTruthy();
    expect(screen.getByText(/target note from C0 to B8/i)).toBeTruthy();
  });

  it("renders the sample deck sidebar", () => {
    renderWorkstationShell();

    expect(screen.getByText("Sample Deck")).toBeTruthy();
    expect(screen.getByText("Song Info")).toBeTruthy();
    expect(screen.getByText("Recorded Clips")).toBeTruthy();
  });

  it("blocks new recordings once the sample deck reaches the share limit", () => {
    const song = createDefaultSongDocument();
    const baseSample = song.samples[0];

    if (baseSample === undefined) {
      throw new Error("Expected the default song to include a sample.");
    }

    song.samples = [
      ...song.samples,
      {
        ...baseSample,
        id: "mic-002",
        name: "mic-002",
      },
      {
        ...baseSample,
        id: "mic-003",
        name: "mic-003",
      },
      {
        ...baseSample,
        id: "mic-004",
        name: "mic-004",
      },
    ];

    renderWorkstationShell(song);

    const recordButton = screen.getByRole("button", { name: "Record" });

    if (!(recordButton instanceof HTMLButtonElement)) {
      throw new Error("Expected the sample deck record control to be a button.");
    }

    expect(song.samples).toHaveLength(SONG_MAX_SAMPLE_COUNT);
    expect(recordButton.disabled).toBe(true);
    expect(screen.getByText(`Clip limit reached (${SONG_MAX_SAMPLE_COUNT}/${SONG_MAX_SAMPLE_COUNT})`)).toBeTruthy();
    expect(screen.getByText(/delete a clip before recording another one/i)).toBeTruthy();
  });

  it("moves the trim window while preserving the selected length", () => {
    renderWorkstationShell();

    const lengthFrameInput = screen.getByLabelText("Sample trim length frame");
    const windowFrameInput = screen.getByLabelText("Sample trim window frame");

    if (!(lengthFrameInput instanceof HTMLInputElement) || !(windowFrameInput instanceof HTMLInputElement)) {
      throw new Error("Expected sample trim frame inputs.");
    }

    fireEvent.change(lengthFrameInput, { target: { value: "6" } });
    fireEvent.change(windowFrameInput, { target: { value: "4" } });

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(lengthFrameInput.value).toBe("6");
    expect(windowFrameInput.value).toBe("4");
    expect(latestSong.samples[0]?.trim).toEqual({
      startFrame: 4,
      endFrame: 10,
    });
    expect(screen.getByText("4-10 · 6 / 12 fr")).toBeTruthy();
  });

  it("applies the current trim destructively from the sample deck", () => {
    renderWorkstationShell();

    const lengthFrameInput = screen.getByLabelText("Sample trim length frame");
    const windowFrameInput = screen.getByLabelText("Sample trim window frame");

    if (!(lengthFrameInput instanceof HTMLInputElement) || !(windowFrameInput instanceof HTMLInputElement)) {
      throw new Error("Expected sample trim frame inputs.");
    }

    fireEvent.change(lengthFrameInput, { target: { value: "6" } });
    fireEvent.change(windowFrameInput, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Trim" }));

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.samples[0]?.frameCount).toBe(6);
    expect(latestSong.samples[0]?.pcm).toEqual([ -0.2, -0.56, -0.14, 0.1, 0.34, 0.12 ]);
    expect(latestSong.samples[0]?.trim).toEqual({
      startFrame: 0,
      endFrame: 6,
    });
    expect(screen.getByText("0-6 · 6 / 6 fr")).toBeTruthy();
  });

  it("toggles the mute state for a specific voice", () => {
    renderWorkstationShell();

    const muteButton = screen.getByRole("button", { name: "Mute Pulse I" });

    fireEvent.click(muteButton);

    expect(screen.getByRole("button", { name: "Unmute Pulse I" })).toBeTruthy();
  });

  it("updates per-voice volume from the row controls", () => {
    renderWorkstationShell();

    const pulseVolume = screen.getByLabelText("Pulse I volume");

    if (!(pulseVolume instanceof HTMLInputElement)) {
      throw new Error("Expected Pulse I volume to be a range input.");
    }

    fireEvent.change(pulseVolume, { target: { value: "23" } });

    expect(pulseVolume.value).toBe("23");
    expect(screen.getByText("23%")).toBeTruthy();
  });

  it("updates pulse duty from the step detail panel", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    const panel = screen.getByLabelText("Pulse I step 1 editor");
    const dutyGroup = within(panel).getByRole("group", { name: "Pulse I step 1 duty cycle" });

    expect(within(dutyGroup).getByRole("button", { name: "Set duty 12.5%" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(within(dutyGroup).getByRole("button", { name: "Set duty 75%" }));

    expect(within(dutyGroup).getByRole("button", { name: "Set duty 75%" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("updates melodic steps from the detail panel controls", () => {
    renderWorkstationShell();

    // Click disabled step 2 to enable + select
    fireEvent.click(screen.getByLabelText("Pulse I step 2"));

    const panel = screen.getByLabelText("Pulse I step 2 editor");

    expect(within(panel).getByLabelText("Pulse I step 2 note")).toBeTruthy();

    // Change the note
    fireEvent.click(within(panel).getByLabelText("Pulse I step 2 note"));
    fireEvent.click(screen.getByRole("button", { name: "Select note D5" }));

    expect(within(panel).getByLabelText("Pulse I step 2 note").textContent).toBe("D5");

    // Disable step 1 via detail panel
    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    fireEvent.click(screen.getByRole("button", { name: "Disable Pulse I step 1" }));

    const step1NotePicker = screen.getByLabelText("Pulse I step 1 note");

    if (!(step1NotePicker instanceof HTMLButtonElement)) {
      throw new Error("Expected Pulse I step 1 note to be a button.");
    }

    expect(step1NotePicker.disabled).toBe(true);
  });

  it("extends and shortens melodic step durations from the detail panel", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    fireEvent.click(screen.getByRole("button", { name: "Extend Pulse I step 1 duration" }));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("2 st");
    expect(screen.getByLabelText("Pulse I step 2").textContent).toContain("C5");

    fireEvent.click(screen.getByRole("button", { name: "Shorten Pulse I step 1 duration" }));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("1 st");
    expect(screen.getByLabelText("Pulse I step 2").textContent).toContain("\u00b7");
  });

  it("updates the noise trigger controls from the detail panel", () => {
    renderWorkstationShell();

    // Click disabled step 2 to enable + select
    fireEvent.click(screen.getByLabelText("Noise step 2"));

    const panel = screen.getByLabelText("Noise step 2 editor");

    fireEvent.click(within(panel).getByRole("button", { name: "Select noise trigger Crash" }));

    // The preset should now be crash
    expect(
      within(panel).getByRole("button", { name: "Select noise trigger Crash" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("updates the noise rate and mode controls from the detail panel", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByLabelText("Noise step 1"));

    const panel = screen.getByLabelText("Noise step 1 editor");

    expect(within(panel).getByLabelText("Noise step 1 noise settings").textContent).toBe("short P3");

    fireEvent.click(within(panel).getByRole("button", { name: "Set noise mode long" }));

    fireEvent.change(within(panel).getByLabelText("Noise step 1 noise period"), {
      target: { value: "12" },
    });

    expect(within(panel).getByLabelText("Noise step 1 noise settings").textContent).toBe("long P12");
  });

  it("updates the inspired PCM note controls from the detail panel", () => {
    renderWorkstationShell();

    // Click disabled step 2 to enable + select
    fireEvent.click(screen.getByLabelText("PCM step 2"));

    const panel = screen.getByLabelText("PCM step 2 editor");

    // Default sample should be assigned
    expect(
      within(panel).getByRole("button", { name: "Assign vox-hit" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(within(panel).getByRole("button", { name: "PCM step 2 note" }));
    fireEvent.click(screen.getByRole("button", { name: "Select note D5" }));

    expect(within(panel).getByRole("button", { name: "PCM step 2 note" }).textContent).toBe("D5");
  });

  it("stores a completed microphone take in the sample deck and routes it to the PCM lane", () => {
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

    renderWorkstationShell();

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
        baseNote: "C4",
        detectedBaseNote: "C4",
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

    expect(screen.getAllByText("mic-002").length).toBeGreaterThan(0);
    expect(screen.getByText("0-4 · 4 / 4 fr")).toBeTruthy();

    // Verify PCM lane updated: re-open text editor to check
    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const pcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(pcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    expect(pcmTextarea.value).toBe("8: mic-002>C4\n16: mic-002>C4");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Click disabled PCM step 2 to enable + select
    fireEvent.click(screen.getByLabelText("PCM step 2"));

    const panel = screen.getByLabelText("PCM step 2 editor");
    expect(within(panel).getByRole("button", { name: "Assign mic-002" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lets you load another sample from the deck list and delete clips", () => {
    renderWorkstationShell();

    const recording: RecordedSampleDraft = {
      asset: {
        id: "mic-002",
        name: "mic-002",
        source: "mic",
        baseNote: "C4",
        detectedBaseNote: "C4",
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

    fireEvent.click(screen.getByRole("button", { name: "Load sample vox-hit" }));

    expect(screen.getByText("0-12 · 12 / 12 fr")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete sample mic-002" }));

    expect(screen.queryByRole("button", { name: "Load sample mic-002" })).toBeNull();

    // Verify via PCM text editor that steps referencing deleted sample were cleared
    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const pcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(pcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    expect(pcmTextarea.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("button", { name: "Load sample vox-hit" })).toBeTruthy();
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

    renderWorkstationShell();

    const sidebar = screen.getByText("Sample Deck").closest("aside");

    if (sidebar === null) {
      throw new Error("Expected sample deck sidebar.");
    }

    const recording: RecordedSampleDraft = {
      asset: {
        id: "mic-002",
        name: "mic-002",
        source: "mic",
        baseNote: "C4",
        detectedBaseNote: "C4",
        sampleRate: 11_025,
        frameCount: 22_050,
        channels: 1,
        trim: {
          startFrame: 5_512,
          endFrame: 11_025,
        },
        pcm: Array.from({ length: 22_050 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5)),
      },
      durationMs: 2_000,
      waveform: new Uint8Array([128, 160, 96, 128]),
    };

    act(() => {
      latestRecorderOptions?.onRecordingComplete(recording);
    });

    fireEvent.click(within(sidebar).getByRole("button", { name: "Preview" }));

    expect(initializeAudio).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(previewSampleTrigger).toHaveBeenCalledWith("mic-002", 1, 500);
  });
});
