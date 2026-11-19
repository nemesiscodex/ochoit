import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "ochoit-lib/web";

import { Toaster, toast } from "@ochoit/ui/components/toast";

import { WorkstationShell } from "@/components/workstation-shell";
import type { RecordedSampleDraft } from "@/features/audio/sample-recorder";
import {
  createDefaultSongDocument,
  createEmptySongDocument,
  SONG_MAX_SAMPLE_COUNT,
  type SongDocument,
  buildSongShareUrl,
  serializeSongShareText,
} from "ochoit-lib";
import * as useAudioEngineModule from "@/features/audio/use-audio-engine";
import { createPlayheadStore } from "@/features/audio/playhead-store";
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
    playbackState,
    playhead: createPlayheadStore(),
    initializeAudio: vi.fn(async () => null),
    suspendAudio: vi.fn(async () => undefined),
    startTransport: vi.fn(async () => undefined),
    startTransportAtStep: vi.fn(async () => undefined),
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

// The app root mounts the toaster beside the route, so the shell's toasts render there.
function withToaster(shell: React.ReactElement) {
  return React.createElement(React.Fragment, null, shell, React.createElement(Toaster));
}

function createWorkstationShellElement(initialSong: SongDocument = createDefaultSongDocument()) {
  return withToaster(React.createElement(WorkstationShell, { initialSong }));
}

function renderWorkstationShell(initialSong: SongDocument = createDefaultSongDocument()) {
  return render(createWorkstationShellElement(initialSong));
}

function renderEmptyWorkstationShell() {
  return render(withToaster(React.createElement(WorkstationShell)));
}

function inputValueOf(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected an input.");
  }

  return element.value;
}

function chooseShareAction(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

function getLatestSong() {
  const latestSong = vi.mocked(useAudioEngineModule.useAudioEngine).mock.lastCall?.[0];

  if (latestSong === undefined) {
    throw new Error("Expected the audio engine hook to receive song state.");
  }

  return latestSong;
}

describe("workstation-shell", () => {
  const mockUseAudioEngine = vi.mocked(useAudioEngineModule.useAudioEngine);
  const mockUseSampleRecorder = vi.mocked(sampleRecorderModule.useSampleRecorder);
  let latestRecorderOptions: Parameters<typeof sampleRecorderModule.useSampleRecorder>[0] | null = null;
  let clipboardWriteText: ReturnType<typeof vi.fn<(value: string) => Promise<void>>>;
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
    act(() => {
      toast.dismiss();
    });
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

    const bpmInput = screen.getByLabelText("Tempo");
    const loopLengthInput = screen.getByLabelText("Steps");

    fireEvent.change(bpmInput, { target: { value: "172" } });
    fireEvent.change(loopLengthInput, { target: { value: "20" } });

    expect(inputValueOf(bpmInput)).toBe("172");
    expect(inputValueOf(loopLengthInput)).toBe("20");
  });

  it("clamps the bpm and loop length transport inputs to the supported UI range", async () => {
    renderWorkstationShell();

    const bpmInput = screen.getByLabelText("Tempo");
    const loopLengthInput = screen.getByLabelText("Steps");

    fireEvent.focus(bpmInput);
    fireEvent.change(bpmInput, { target: { value: "1001" } });
    fireEvent.blur(bpmInput);

    fireEvent.focus(loopLengthInput);
    fireEvent.change(loopLengthInput, { target: { value: "2" } });
    fireEvent.blur(loopLengthInput);

    const question = await screen.findByRole("alertdialog", { name: "Reduce the pattern to 4 steps?" });

    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Shorten pattern" }));
    });

    expect(inputValueOf(bpmInput)).toBe("1000");
    expect(inputValueOf(loopLengthInput)).toBe("4");
    expect(getLatestSong().transport).toMatchObject({ bpm: 1000, loopLength: 4 });
  });

  it("extends and safely shrinks the pattern from the ruler without prompting when no content is lost", () => {
    renderWorkstationShell(createEmptySongDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add 4 steps" }));
    expect(screen.getByText("20 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove 4 steps" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("16 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();
  });

  it("switches the sequencer between beat grid and 1/8 recording grid", () => {
    renderWorkstationShell(createEmptySongDocument());

    fireEvent.click(screen.getByRole("button", { name: "Use 1/8 grid recording" }));

    expect(screen.getByText("32 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();

    let latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.transport.stepsPerBeat).toBe(8);
    expect(latestSong.transport.loopLength).toBe(32);

    fireEvent.click(screen.getByRole("button", { name: "Use beat grid recording" }));

    expect(screen.getByText("16 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();

    latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.transport.stepsPerBeat).toBe(4);
    expect(latestSong.transport.loopLength).toBe(16);
  });

  it("asks in a dialog before shrinking the pattern when content would be removed", async () => {
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[12] = {
      ...song.tracks.pulse1.steps[12],
      enabled: true,
    };

    renderWorkstationShell(song);

    fireEvent.click(screen.getByRole("button", { name: "Remove 4 steps" }));

    const question = await screen.findByRole("alertdialog", { name: "Reduce the pattern to 12 steps?" });

    expect(
      within(question).getByText("This will delete or shorten notes and triggers beyond the new end."),
    ).toBeTruthy();
    expect(screen.getByText("16 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("16 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();
    expect(getLatestSong().tracks.pulse1.steps[12]?.enabled).toBe(true);
  });

  it("asks before the Steps field shrinks the pattern and keeps the song when cancelled", async () => {
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[12] = {
      ...song.tracks.pulse1.steps[12],
      enabled: true,
    };

    renderWorkstationShell(song);

    const loopLengthInput = screen.getByLabelText("Steps");

    if (!(loopLengthInput instanceof HTMLInputElement)) {
      throw new Error("Expected Steps to be an input.");
    }

    fireEvent.focus(loopLengthInput);
    fireEvent.change(loopLengthInput, { target: { value: "12" } });
    fireEvent.blur(loopLengthInput);

    const question = await screen.findByRole("alertdialog", { name: "Reduce the pattern to 12 steps?" });

    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    });

    expect(screen.getByText("16 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();
    expect(loopLengthInput.value).toBe("16");

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.transport.loopLength).toBe(16);
    expect(latestSong.tracks.pulse1.steps[12]?.enabled).toBe(true);
  });

  it("trims the pattern from the Steps field once the shrink is confirmed", async () => {
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[12] = {
      ...song.tracks.pulse1.steps[12],
      enabled: true,
    };

    renderWorkstationShell(song);

    const loopLengthInput = screen.getByLabelText("Steps");

    fireEvent.focus(loopLengthInput);
    fireEvent.change(loopLengthInput, { target: { value: "12" } });
    fireEvent.blur(loopLengthInput);

    const question = await screen.findByRole("alertdialog", { name: "Reduce the pattern to 12 steps?" });

    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Shorten pattern" }));
    });

    expect(screen.getByText("12 step loop. Select empty steps, then press Enter to add.")).toBeTruthy();

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.transport.loopLength).toBe(12);
    expect(latestSong.tracks.pulse1.steps).toHaveLength(12);
    expect(latestSong.tracks.pulse1.steps.some((step) => step.enabled)).toBe(false);
  });

  it("updates the global volume from the transport bar", () => {
    renderWorkstationShell();

    const globalVolume = screen.getByLabelText("Master volume");

    if (!(globalVolume instanceof HTMLInputElement)) {
      throw new Error("Expected Master volume to be a range input.");
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

  it("toggles sequencer hover preview from the transport bar", () => {
    renderWorkstationShell();

    const hoverPreviewButton = screen.getByRole("button", { name: "Sequencer hover preview" });

    expect(hoverPreviewButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(hoverPreviewButton);

    expect(hoverPreviewButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles the sequencer ruler from the transport bar", () => {
    renderWorkstationShell();

    const rulerButton = screen.getByRole("button", { name: "Sequencer ruler" });

    expect(rulerButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Pattern ruler")).toBeTruthy();

    fireEvent.click(rulerButton);

    expect(rulerButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("Pattern ruler")).toBeNull();
  });

  it("offers Start audio with a note on why before the engine is ready", () => {
    const idle = createUseAudioEngineResult("stopped", "idle");
    mockUseAudioEngine.mockReturnValue(idle);

    renderWorkstationShell();

    const startAudioButton = screen.getByRole("button", { name: "Start audio" });
    const noteId = startAudioButton.getAttribute("aria-describedby");

    expect(noteId === null ? null : document.getElementById(noteId)?.textContent).toBe(
      "Browsers need one click before they play sound.",
    );
    expect(screen.queryByText("Audio on")).toBeNull();

    fireEvent.click(startAudioButton);

    expect(idle.initializeAudio).toHaveBeenCalledTimes(1);
  });

  it("swaps Start audio for a quiet audio-on note once audio is running", () => {
    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult("stopped", "idle"));

    const { rerender } = renderWorkstationShell();

    mockUseAudioEngine.mockReturnValue(createUseAudioEngineResult("stopped", "running"));
    rerender(createWorkstationShellElement());

    expect(screen.queryByRole("button", { name: "Start audio" })).toBeNull();
    expect(screen.queryByText("Browsers need one click before they play sound.")).toBeNull();
    expect(screen.getByText("Audio on")).toBeTruthy();
  });

  it("starts audio and playback with one press of Play while audio is off", () => {
    const idle = createUseAudioEngineResult("stopped", "idle");
    mockUseAudioEngine.mockReturnValue(idle);

    renderWorkstationShell();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(idle.startTransport).toHaveBeenCalledTimes(1);
  });

  it("shows an audio engine failure as an inline alert", () => {
    mockUseAudioEngine.mockReturnValue({
      ...createUseAudioEngineResult("stopped", "error"),
      errorMessage: "The audio device is busy.",
    });

    renderWorkstationShell();

    const alert = screen.getByText("Audio didn't start").closest('[role="alert"]');

    expect(alert?.textContent).toContain("The audio device is busy.");
    expect(screen.getByRole("button", { name: "Start audio" })).toBeTruthy();
  });

  it("shows the brand and links to the source repository from the band", () => {
    renderWorkstationShell();

    expect(screen.getByRole("heading", { level: 1, name: "Ochoit" })).toBeTruthy();
    expect(document.querySelector('img[src="/ochoit-logo.png"]')).toBeTruthy();

    const githubLink = screen.getByRole("link", { name: "Open GitHub repository" });

    expect(githubLink.getAttribute("href")).toBe("https://github.com/nemesiscodex/ochoit");
    expect(githubLink.getAttribute("target")).toBe("_blank");
    expect(githubLink.getAttribute("rel")).toBe("noreferrer");
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

  it("toggles transport with the spacebar shortcut", () => {
    const stoppedResult = createUseAudioEngineResult("stopped");
    mockUseAudioEngine.mockReturnValue(stoppedResult);

    const { rerender } = renderWorkstationShell();

    fireEvent.keyDown(document, { key: " " });

    expect(stoppedResult.startTransport).toHaveBeenCalledTimes(1);

    const playingResult = createUseAudioEngineResult("playing");
    mockUseAudioEngine.mockReturnValue(playingResult);
    rerender(createWorkstationShellElement());

    fireEvent.keyDown(document, { key: " " });

    expect(playingResult.stopTransport).toHaveBeenCalledTimes(1);
  });

  it("does not toggle transport with the spacebar while typing into an input", () => {
    const stoppedResult = createUseAudioEngineResult("stopped");
    mockUseAudioEngine.mockReturnValue(stoppedResult);

    renderWorkstationShell();

    fireEvent.keyDown(screen.getByLabelText("Tempo"), { key: " " });

    expect(stoppedResult.startTransport).not.toHaveBeenCalled();
  });

  it("copies and pastes selected notes from a new start position", () => {
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[0] = {
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      note: "C5",
      length: 2,
      duty: 0.125,
      volume: 0.61,
    };
    song.tracks.pulse1.steps[4] = {
      ...song.tracks.pulse1.steps[4],
      enabled: true,
      note: "E5",
      length: 1,
      duty: 0.75,
      volume: 0.43,
    };

    renderWorkstationShell(song);

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.click(screen.getByLabelText("Pulse I step 5"), { shiftKey: true });
    fireEvent.keyDown(document, { key: "c", ctrlKey: true });
    fireEvent.click(screen.getByLabelText("Pulse I step 9"));
    fireEvent.keyDown(document, { key: "v", ctrlKey: true });

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.tracks.pulse1.steps[8]).toMatchObject({
      enabled: true,
      note: "C5",
      length: 2,
      duty: 0.125,
      volume: 0.61,
    });
    expect(latestSong.tracks.pulse1.steps[12]).toMatchObject({
      enabled: true,
      note: "E5",
      length: 1,
      duty: 0.75,
      volume: 0.43,
    });
  });

  it("overrides existing notes when pasting", () => {
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[0] = {
      ...song.tracks.pulse1.steps[0],
      enabled: true,
      note: "C5",
      length: 4,
      duty: 0.25,
      volume: 0.52,
    };
    song.tracks.pulse1.steps[9] = {
      ...song.tracks.pulse1.steps[9],
      enabled: true,
      note: "G4",
      length: 1,
      duty: 0.5,
      volume: 0.2,
    };

    renderWorkstationShell(song);

    fireEvent.click(screen.getByLabelText("Pulse I step 1"));
    fireEvent.keyDown(document, { key: "c", ctrlKey: true });
    fireEvent.click(screen.getByLabelText("Pulse I step 9"));
    fireEvent.keyDown(document, { key: "v", ctrlKey: true });

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.tracks.pulse1.steps[8]).toMatchObject({
      enabled: true,
      note: "C5",
      length: 4,
      duty: 0.25,
      volume: 0.52,
    });
    expect(latestSong.tracks.pulse1.steps[9]?.enabled).toBe(false);
  });

  it("renders the full five-row sequencer matrix", () => {
    renderWorkstationShell();

    expect(screen.getByRole("heading", { name: "Pulse I" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pulse II" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triangle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Noise" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PCM" })).toBeTruthy();
    expect(screen.getByText("Pattern ruler")).toBeTruthy();
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
    expect(screen.getByText(/Record a sound to add your first clip/)).toBeTruthy();

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
    const engineResult = createUseAudioEngineResult();
    mockUseAudioEngine.mockReturnValue(engineResult);

    renderWorkstationShell();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Link Tune")).toBeTruthy();
      expect((screen.getByRole("textbox", { name: "Tempo" }) as HTMLInputElement).value).toBe("172");
      expect(screen.getByText("Loaded the song from the link")).toBeTruthy();
    });
    expect(window.location.hash).toContain("song=");
    expect(engineResult.stopTransport).not.toHaveBeenCalled();
  });

  it("loads a built-in example from the examples dialog", async () => {
    window.history.replaceState({}, "", buildSongShareUrl(window.location.href, createDefaultSongDocument()));
    const engineResult = createUseAudioEngineResult();
    mockUseAudioEngine.mockReturnValue(engineResult);

    renderEmptyWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Examples" }));
    fireEvent.click(screen.getByRole("button", { name: "Load example Mario Theme" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Mario Theme")).toBeTruthy();
      expect(screen.getByDisplayValue("nemesiscodex")).toBeTruthy();
      expect(screen.getByText("Loaded Mario Theme")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Load example Mario Theme" })).toBeNull();
    expect(window.location.hash).toBe("");
    expect(engineResult.stopTransport).toHaveBeenCalledTimes(1);
  });

  it("loads the Zelda Medley example from the examples dialog", async () => {
    renderEmptyWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Examples" }));
    fireEvent.click(screen.getByRole("button", { name: "Load example Zelda Medley" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Zelda Medley")).toBeTruthy();
      expect(screen.getByDisplayValue("nemesiscodex")).toBeTruthy();
      expect((screen.getByRole("textbox", { name: "Tempo" }) as HTMLInputElement).value).toBe("140");
      expect(screen.getByText("Loaded Zelda Medley")).toBeTruthy();
    });
  });

  it("copies a share link and updates the current url", async () => {
    renderWorkstationShell();

    chooseShareAction("Copy share link");

    await waitFor(() => {
      expect(window.location.hash).toContain("song=");
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText.mock.calls[0]?.[0]).toContain("#song=");
    expect(await screen.findByText("Share link copied")).toBeTruthy();
  });

  it("copies a share link for a four-step song", async () => {
    const song = createEmptySongDocument();
    song.transport.loopLength = 4;
    song.tracks.pulse1.steps = song.tracks.pulse1.steps.slice(0, 4);
    song.tracks.pulse2.steps = song.tracks.pulse2.steps.slice(0, 4);
    song.tracks.triangle.steps = song.tracks.triangle.steps.slice(0, 4);
    song.tracks.noise.steps = song.tracks.noise.steps.slice(0, 4);
    song.tracks.sample.steps = song.tracks.sample.steps.slice(0, 4);

    renderWorkstationShell(song);

    chooseShareAction("Copy share link");

    await waitFor(() => {
      expect(window.location.hash).toContain("song=");
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText.mock.calls[0]?.[0]).toContain("#song=v5.");
    expect(await screen.findByText("Share link copied")).toBeTruthy();
  });

  it("downloads the current arrangement as a wav file", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    renderWorkstationShell();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download WAV" }));
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
    expect(revokeObjectURL).not.toHaveBeenCalled();
    const downloadCleanupCall = setTimeoutSpy.mock.calls.find((call) => call[1] === 1_000);

    if (downloadCleanupCall === undefined) {
      throw new Error("Expected download cleanup to schedule a 1 second timeout.");
    }

    const revokeDownloadUrl = downloadCleanupCall[0];

    if (typeof revokeDownloadUrl !== "function") {
      throw new Error("Expected download cleanup to schedule a timeout callback.");
    }

    revokeDownloadUrl();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:arrangement");
    expect(screen.getByText("WAV download started")).toBeTruthy();
  });

  it("opens the song text editor from the share menu and copies the current song text", async () => {
    renderWorkstationShell();

    chooseShareAction("Edit song as text");

    const textarea = screen.getByLabelText("Song text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Song text to be a textarea.");
    }

    expect(textarea.value).toContain("!v=3;");
    expect(textarea.value).toContain("=1;vol=");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    });

    expect(clipboardWriteText).toHaveBeenCalled();
    expect(clipboardWriteText.mock.calls.at(-1)?.[0]).toContain("!v=3;");
    expect(screen.getByText("Song text copied")).toBeTruthy();
  });

  it("replaces the current song with pasted song text", async () => {
    const sharedSong = createDefaultSongDocument();
    sharedSong.meta.name = "DSL Tune";
    sharedSong.transport.bpm = 180;
    sharedSong.tracks.pulse1.muted = true;
    window.history.replaceState({}, "", "/#song=kept");
    const engineResult = createUseAudioEngineResult();
    mockUseAudioEngine.mockReturnValue(engineResult);

    renderWorkstationShell();

    chooseShareAction("Edit song as text");

    const textarea = screen.getByLabelText("Song text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Song text to be a textarea.");
    }

    fireEvent.change(textarea, {
      target: {
        value: serializeSongShareText(sharedSong),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Replace song" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("DSL Tune")).toBeTruthy();
      expect((screen.getByRole("textbox", { name: "Tempo" }) as HTMLInputElement).value).toBe("180");
      expect(screen.getByRole("button", { name: "Unmute Pulse I" })).toBeTruthy();
      expect(screen.getByText("Loaded the song from text")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Song text")).toBeNull();
    expect(window.location.hash).toBe("#song=kept");
    expect(engineResult.stopTransport).not.toHaveBeenCalled();
  });

  it("updates the song name from the song info panel", () => {
    renderWorkstationShell();

    const nameInput = screen.getByLabelText("Song name");

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error("Expected Song name to be an input.");
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

  it("starts a new song, clearing recordings and share link after confirmation", async () => {
    const sharedSong = createDefaultSongDocument();

    window.history.replaceState({}, "", buildSongShareUrl(window.location.href, sharedSong));
    const engineResult = createUseAudioEngineResult();
    mockUseAudioEngine.mockReturnValue(engineResult);

    renderWorkstationShell();

    await waitFor(() => {
      expect(window.location.hash).toContain("song=");
    });

    fireEvent.click(screen.getByRole("button", { name: "New song" }));

    const question = await screen.findByRole("alertdialog", { name: "Start a new song?" });

    expect(within(question).getByText("This clears every note, recording and the current song link.")).toBeTruthy();
    expect(engineResult.stopTransport).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Start new song" }));
    });

    expect(engineResult.stopTransport).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(window.location.hash).toBe("");
    });

    expect(await screen.findByText("Started a new song")).toBeTruthy();
    expect(screen.getByText(/Record a sound to add your first clip/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("");
  });

  it("keeps the song and its link when the new song question is cancelled", async () => {
    window.history.replaceState({}, "", buildSongShareUrl(window.location.href, createDefaultSongDocument()));
    const engineResult = createUseAudioEngineResult();
    mockUseAudioEngine.mockReturnValue(engineResult);

    renderWorkstationShell();

    await waitFor(() => {
      expect(window.location.hash).toContain("song=");
    });

    const newSongButton = screen.getByRole("button", { name: "New song" });

    fireEvent.click(newSongButton);

    const question = await screen.findByRole("alertdialog", { name: "Start a new song?" });

    await act(async () => {
      fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(engineResult.stopTransport).not.toHaveBeenCalled();
    expect(window.location.hash).toContain("song=");
    expect(getLatestSong().tracks.pulse1.steps.some((step) => step.enabled)).toBe(true);
  });

  it("closes the examples dialog with Escape and keeps the song", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Examples" }));

    const dialog = screen.getByRole("dialog", { name: "Examples" });

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Examples" })).toBeNull();
    expect(screen.getByDisplayValue("(No name)")).toBeTruthy();
  });

  it("opens the voice text editor with the current arrangement", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("1: C5 @12.5%, 5: E5 @25%, 9: G5, 13: E5 @25%");
  });

  it("switches arrangement text between compact and multiline formats", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const textarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(textarea.value).toBe("1: C5 @12.5%, 5: E5 @25%, 9: G5, 13: E5 @25%");

    fireEvent.click(screen.getByRole("radio", { name: "Lines" }));

    expect(textarea.value).toBe("1: C5 @12.5%\n5: E5 @25%\n9: G5\n13: E5 @25%");

    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));

    expect(textarea.value).toBe("1: C5 @12.5%, 5: E5 @25%, 9: G5, 13: E5 @25%");
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
        value: "1: e4 @25%, 3: g4, 5: a4 @75%, 17: c5",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply arrangement" }));

    expect(screen.queryByLabelText("Pulse I arrangement text")).toBeNull();

    // Verify the arrangement via re-opening the text editor (round-trip)
    fireEvent.click(screen.getByRole("button", { name: "Edit Pulse I arrangement as text" }));

    const verifyTextarea = screen.getByLabelText("Pulse I arrangement text");

    if (!(verifyTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Pulse I arrangement text to be a textarea.");
    }

    expect(verifyTextarea.value).toBe("1: E4 @25%, 3: G4, 5: A4 @75%");

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
    fireEvent.click(screen.getByRole("button", { name: "Apply arrangement" }));

    expect(screen.queryByLabelText("Pulse I arrangement text")).toBeNull();

    // Select step 1 to verify duration
    fireEvent.click(screen.getByLabelText("Pulse I step 1"));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("3 st");

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
      "1: short P3, 3: long P8, 5: short P3, 7: long P8, 9: short P3, 11: long P8, 13: short P3, 15: long P8",
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
        value: "2: short P1, 4: long P12, 18: short P3",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply arrangement" }));

    expect(screen.queryByLabelText("Noise trigger text")).toBeNull();

    // Verify via text editor round-trip
    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    const verifyNoiseTextarea = screen.getByLabelText("Noise trigger text");

    if (!(verifyNoiseTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected Noise trigger text to be a textarea.");
    }

    expect(verifyNoiseTextarea.value).toBe("2: short P1, 4: long P12");

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
        value: "2: vox-hit>D5, 6: mic-001>A#2, 20: vox-hit",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply arrangement" }));

    expect(screen.queryByLabelText("PCM trigger text")).toBeNull();

    // Verify via text editor round-trip
    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const verifyPcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(verifyPcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    expect(verifyPcmTextarea.value).toBe("2: mic-001>D5, 6: mic-001>A#2");
  });

  it("keeps the arrangement editor open with the parse error and leaves the song alone", () => {
    renderWorkstationShell();

    fireEvent.click(screen.getByRole("button", { name: "Edit Noise arrangement as text" }));

    const editor = screen.getByRole("dialog", { name: "Edit Noise as text" });

    fireEvent.change(within(editor).getByLabelText("Noise trigger text"), { target: { value: "1: thunder" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Apply arrangement" }));

    expect(screen.getByLabelText("Noise trigger text")).toBeTruthy();
    expect(within(editor).getByText(/^Line 1 has an invalid noise trigger/)).toBeTruthy();
    expect(screen.getAllByText(/^Line 1 has an invalid noise trigger/)).toHaveLength(1);

    const latestSong = mockUseAudioEngine.mock.lastCall?.[0];

    if (latestSong === undefined) {
      throw new Error("Expected the audio engine hook to receive song state.");
    }

    expect(latestSong.tracks.noise.steps[0]).toMatchObject({ enabled: true, mode: "short", periodIndex: 3 });
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

  it("renders the sample deck and song info panels", () => {
    renderWorkstationShell();

    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Clips" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load sample vox-hit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Song" }));
    expect(screen.getByRole("textbox", { name: "Song name" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Inspired" }).getAttribute("aria-checked")).toBe("true");
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

    const lengthFrameInput = screen.getByLabelText("Length in frames");
    const windowFrameInput = screen.getByLabelText("Start in frames");

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
    expect(screen.getByText("Frames 4 to 10 of 12")).toBeTruthy();
  });

  it("applies the current trim destructively from the sample deck", () => {
    renderWorkstationShell();

    const lengthFrameInput = screen.getByLabelText("Length in frames");
    const windowFrameInput = screen.getByLabelText("Start in frames");

    if (!(lengthFrameInput instanceof HTMLInputElement) || !(windowFrameInput instanceof HTMLInputElement)) {
      throw new Error("Expected sample trim frame inputs.");
    }

    fireEvent.change(lengthFrameInput, { target: { value: "6" } });
    fireEvent.change(windowFrameInput, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply trim" }));

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
    expect(screen.getByText("Frames 0 to 6 of 6")).toBeTruthy();
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

    // Select disabled step 2, then press Enter to create it
    fireEvent.click(screen.getByLabelText("Pulse I step 2"));
    fireEvent.keyDown(document, { key: "Enter" });

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

    fireEvent.click(screen.getByRole("button", { name: "Shorten Pulse I step 1 duration" }));

    expect(screen.getByLabelText("Pulse I step 1 duration").textContent).toBe("1 st");
  });

  it("updates the noise trigger controls from the detail panel", () => {
    renderWorkstationShell();

    // Select disabled step 2, then press Enter to create it
    fireEvent.click(screen.getByLabelText("Noise step 2"));
    fireEvent.keyDown(document, { key: "Enter" });

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

    // Select disabled step 2, then press Enter to create it
    fireEvent.click(screen.getByLabelText("PCM step 2"));
    fireEvent.keyDown(document, { key: "Enter" });

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

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));

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
    expect(screen.getByText("Frames 0 to 4 of 4")).toBeTruthy();

    // Verify PCM lane updated: re-open text editor to check
    fireEvent.click(screen.getByRole("button", { name: "Edit PCM arrangement as text" }));

    const pcmTextarea = screen.getByLabelText("PCM trigger text");

    if (!(pcmTextarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected PCM trigger text to be a textarea.");
    }

    expect(pcmTextarea.value).toBe("8: mic-002>C4, 16: mic-002>C4");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Select disabled PCM step 2, then press Enter to create it
    fireEvent.click(screen.getByLabelText("PCM step 2"));
    fireEvent.keyDown(document, { key: "Enter" });

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

    expect(screen.getByText("Frames 0 to 12 of 12")).toBeTruthy();

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

    fireEvent.click(screen.getByRole("button", { name: "Preview clip" }));

    expect(initializeAudio).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(previewSampleTrigger).toHaveBeenCalledWith("mic-002", 1, 500);
  });

  it("does not rebuild sample deck waveforms on transport-only rerenders", () => {
    const waveformSpy = vi.spyOn(sampleRecorderModule, "createWaveformFromPcm");
    const song = createDefaultSongDocument();
    const transportOnlyUpdate = createUseAudioEngineResult("playing");

    const { rerender } = renderWorkstationShell(song);
    const callCountAfterInitialRender = waveformSpy.mock.calls.length;

    mockUseAudioEngine.mockReturnValue(transportOnlyUpdate);
    rerender(createWorkstationShellElement(song));
    act(() => {
      transportOnlyUpdate.playhead.set({ nextStep: 4, loopCount: 0 });
    });

    expect(waveformSpy).toHaveBeenCalledTimes(callCountAfterInitialRender);
    waveformSpy.mockRestore();
  });

  it("moves the sequencer playhead without re-rendering the workstation shell", () => {
    const playing = createUseAudioEngineResult("playing");
    mockUseAudioEngine.mockReturnValue(playing);

    renderWorkstationShell(createEmptySongDocument());
    // useAudioEngine runs once per shell render, so its call count is the shell's render count.
    const shellRendersBeforePlayback = mockUseAudioEngine.mock.calls.length;

    for (let nextStep = 1; nextStep <= 8; nextStep += 1) {
      act(() => {
        playing.playhead.set({ nextStep, loopCount: 0 });
      });
    }

    expect(screen.getByLabelText("Noise step 9").getAttribute("aria-current")).toBe("step");
    expect(screen.getByLabelText("Noise step 8").getAttribute("aria-current")).toBe(null);
    expect(mockUseAudioEngine.mock.calls.length).toBe(shellRendersBeforePlayback);
  });
});
