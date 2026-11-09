import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkstationShell } from "@/components/workstation-shell";
import { createPlayheadStore } from "@/features/audio/playhead-store";
import type { useAudioEngine } from "@/features/audio/use-audio-engine";
import { createDefaultSongDocument } from "ochoit-lib";

const renderLog = vi.hoisted(() => ({ types: [] as unknown[] }));

// Every element a component returns passes through jsxDEV, so the log lists exactly what re-rendered.
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-dev-runtime")>();

  return {
    ...actual,
    jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
      renderLog.types.push(args[0]);
      return actual.jsxDEV(...args);
    },
  };
});

const audio = vi.hoisted(() => ({ result: null as unknown }));

vi.mock("@/features/audio/use-audio-engine", () => ({
  useAudioEngine: () => audio.result,
}));

vi.mock("@/features/audio/sample-recorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/audio/sample-recorder")>();
  const recorder = {
    errorMessage: null,
    permissionState: "granted",
    recordingDurationMs: 0,
    startRecording: async () => undefined,
    status: "ready",
    stopRecording: () => undefined,
    waveform: new Uint8Array([128]),
  };

  return { ...actual, useSampleRecorder: () => recorder };
});

function getComponentName(type: unknown) {
  // memo() wraps the component function in an object that keeps it under `type`.
  const component = typeof type === "function" ? type : (type as { type?: unknown } | null)?.type;

  // The dev transform renames a memo() component's inner function (SequencerRow becomes SequencerRow2).
  return typeof component === "function" ? component.name.replace(/\d+$/, "") : null;
}

function recordRenders(update: () => void) {
  renderLog.types = [];
  update();
  const types = renderLog.types;
  renderLog.types = [];

  return (componentName: string) => types.filter((type) => getComponentName(type) === componentName).length;
}

function renderShell() {
  const engine: ReturnType<typeof useAudioEngine> = {
    engine: null,
    engineState: "running",
    errorMessage: null,
    playbackState: "stopped",
    playhead: createPlayheadStore(),
    initializeAudio: async () => null,
    suspendAudio: async () => undefined,
    startTransport: async () => undefined,
    startTransportAtStep: async () => undefined,
    stopTransport: () => undefined,
  };
  audio.result = engine;
  render(<WorkstationShell initialSong={createDefaultSongDocument()} />);
}

describe("workstation-shell render scope", () => {
  afterEach(() => {
    cleanup();
  });

  it("re-renders only the sequencer when a step edit leaves the transport, actions, meta and deck data alone", () => {
    renderShell();
    fireEvent.click(screen.getByLabelText("Pulse I step 3"));

    const created = recordRenders(() => {
      fireEvent.click(screen.getByLabelText("Enable Pulse I step 3"));
    });

    expect(screen.getByLabelText("Disable Pulse I step 3")).toBeTruthy();
    expect(created("SequencerMatrix")).toBe(1);
    expect(created("CompactStepGrid")).toBe(1);
    expect(created("TransportField")).toBe(0);
    expect(created("BorderGlow")).toBe(0);
    expect(created("MetaRow")).toBe(0);
    expect(created("SampleTrimControl")).toBe(0);
  });

  it("re-renders the song info panel and nothing else when the song name changes", () => {
    renderShell();

    const created = recordRenders(() => {
      fireEvent.change(screen.getByLabelText("Song Name"), { target: { value: "Night Drive" } });
    });

    expect(screen.getByDisplayValue("Night Drive")).toBeTruthy();
    expect(created("MetaRow")).toBeGreaterThan(0);
    expect(created("TransportField")).toBe(0);
    expect(created("BorderGlow")).toBe(0);
    expect(created("SampleTrimControl")).toBe(0);
    expect(created("CompactStepGrid")).toBe(0);
  });
});
