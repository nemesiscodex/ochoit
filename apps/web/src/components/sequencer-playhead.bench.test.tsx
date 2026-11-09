import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import { WorkstationShell } from "@/components/workstation-shell";
import { createPlayheadStore } from "@/features/audio/playhead-store";
import type { useAudioEngine } from "@/features/audio/use-audio-engine";
import { applySongEdit, createEmptySongDocument, type SongDocument, type SongEdit } from "ochoit-lib";

const elementCounter = vi.hoisted(() => ({ elements: 0, stepElements: 0, rows: 0 }));

vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-dev-runtime")>();

  return {
    ...actual,
    jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
      const props = args[1] as Record<string, unknown> | null;
      elementCounter.elements += 1;

      if (props !== null && ("data-step-index" in props || "data-note-origin-step" in props)) {
        elementCounter.stepElements += 1;
      }

      if (typeof props?.className === "string" && props.className.includes("oc-voice-row")) {
        elementCounter.rows += 1;
      }

      return actual.jsxDEV(...args);
    },
  };
});

// The shell scenario renders without Web Audio: a stable idle engine result, as the real hook returns between renders.
const shellAudio = vi.hoisted(() => ({ result: null as unknown }));

vi.mock("@/features/audio/use-audio-engine", () => ({
  useAudioEngine: () => shellAudio.result,
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

type MatrixProps = ComponentProps<typeof SequencerMatrix>;

const loopLength = 128;
const stepsPlayed = 64;
const selectionClicks = 32;
const edits = 32;
const dragMoves = 32;
const shellEdits = 32;
const stepWidthPx = 20;

function buildBusySong(): SongDocument {
  let song = createEmptySongDocument();
  const apply = (edit: SongEdit) => {
    song = applySongEdit(song, edit, { defaultSampleId: song.samples[0]?.id ?? null }).song;
  };

  apply({ type: "set-loop-length", loopLength, confirmed: true });

  for (let step = 0; step < loopLength; step += 4) {
    apply({ type: "update-step", trackId: "pulse1", stepIndex: step, changes: { enabled: true, note: "C4", length: 2 } });
    apply({ type: "update-step", trackId: "pulse2", stepIndex: step + 1, changes: { enabled: true, note: "E4", length: 1 } });
    apply({ type: "update-step", trackId: "triangle", stepIndex: step, changes: { enabled: true, note: "C2", length: 4 } });
    apply({ type: "update-step", trackId: "noise", stepIndex: step + 2, changes: { enabled: true } });
  }

  return song;
}

function createCostMeter() {
  let commits = 0;
  let renderMs = 0;
  let mutations = 0;
  let startedAt = 0;
  let observer: MutationObserver | null = null;

  return {
    onRender: (_id: string, _phase: string, actualDuration: number) => {
      commits += 1;
      renderMs += actualDuration;
    },
    start(container: HTMLElement) {
      observer = new MutationObserver(() => undefined);
      observer.observe(container, { subtree: true, attributes: true, childList: true, characterData: true });
      commits = 0;
      renderMs = 0;
      mutations = 0;
      elementCounter.elements = 0;
      elementCounter.stepElements = 0;
      elementCounter.rows = 0;
      startedAt = performance.now();
    },
    takeMutations() {
      mutations += observer?.takeRecords().length ?? 0;
    },
    finish(operations: number) {
      const wallMs = performance.now() - startedAt;
      observer?.disconnect();

      return {
        commits,
        reactRenderMsPer: Number((renderMs / operations).toFixed(3)),
        wallMsPer: Number((wallMs / operations).toFixed(2)),
        domMutationsPer: Number((mutations / operations).toFixed(1)),
        elementsCreatedPer: Number((elementCounter.elements / operations).toFixed(1)),
        stepElementsRenderedPer: Number((elementCounter.stepElements / operations).toFixed(1)),
        rowsRenderedPer: Number((elementCounter.rows / operations).toFixed(1)),
      };
    },
  };
}

function setStepWidth(cell: HTMLElement) {
  Object.defineProperty(cell, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: stepWidthPx,
      height: 48,
      top: 0,
      left: 0,
      right: stepWidthPx,
      bottom: 48,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

describe("sequencer playhead cost (128-step song, 5 tracks)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function createProps(): MatrixProps {
    return {
      defaultSampleId: null,
      engine: null,
      onOpenArrangementEditor: vi.fn(),
      onEdit: vi.fn(),
      song: buildBusySong(),
      playbackState: "playing",
      playhead: createPlayheadStore(),
      onStartTransportAtStep: vi.fn(async () => undefined),
    };
  }

  function renderStatefulMatrix(props: MatrixProps, onRender: ComponentProps<typeof Profiler>["onRender"]) {
    const harness: { song: SongDocument; apply: (edit: SongEdit) => void } = {
      song: props.song,
      apply: () => undefined,
    };

    function MatrixWithSongState() {
      const [song, setSong] = useState(props.song);
      const onEdit = (edit: SongEdit) => {
        setSong((currentSong) => applySongEdit(currentSong, edit, { defaultSampleId: null }).song);
      };
      harness.song = song;
      harness.apply = onEdit;

      return <SequencerMatrix {...props} song={song} onEdit={onEdit} />;
    }

    const view = render(
      <Profiler id="matrix" onRender={onRender}>
        <MatrixWithSongState />
      </Profiler>,
    );

    return { view, harness };
  }

  it("reports render cost per playback step", () => {
    const props = createProps();
    const meter = createCostMeter();
    const view = render(
      <Profiler id="matrix" onRender={meter.onRender}>
        <SequencerMatrix {...props} />
      </Profiler>,
    );
    const buttons = view.container.querySelectorAll("button").length;

    meter.start(view.container);

    for (let step = 1; step <= stepsPlayed; step += 1) {
      act(() => {
        props.playhead.set({ nextStep: step, loopCount: 0 });
      });
      meter.takeMutations();
    }

    const result = meter.finish(stepsPlayed);
    console.log("BENCH", JSON.stringify({ scenario: "playback-step", buttonsInDom: buttons, ...result }));
    expect(result.commits).toBe(stepsPlayed);
    expect(view.container.querySelectorAll('[aria-current="step"]').length).toBeGreaterThan(1);
  });

  it("reports render cost per selection click", () => {
    const props = { ...createProps(), playbackState: "stopped" as const };
    const meter = createCostMeter();

    const view = render(
      <Profiler id="matrix" onRender={meter.onRender}>
        <SequencerMatrix {...props} />
      </Profiler>,
    );
    const targets = [screen.getByLabelText("Pulse I step 3"), screen.getByLabelText("Pulse I step 4")];

    fireEvent.click(targets[1]);
    meter.start(view.container);

    for (let click = 0; click < selectionClicks; click += 1) {
      fireEvent.click(targets[click % 2]);
      meter.takeMutations();
    }

    const result = meter.finish(selectionClicks);
    console.log("BENCH", JSON.stringify({ scenario: "select-step", ...result }));
    expect(targets[(selectionClicks - 1) % 2].getAttribute("aria-selected")).toBe("true");
  });

  it("reports render cost per step edit", () => {
    const props = { ...createProps(), playbackState: "stopped" as const };
    const meter = createCostMeter();
    const { view, harness } = renderStatefulMatrix(props, meter.onRender);

    meter.start(view.container);

    for (let edit = 0; edit < edits; edit += 1) {
      act(() => {
        harness.apply({
          type: "update-step",
          trackId: "pulse1",
          stepIndex: 2,
          changes: { enabled: !harness.song.tracks.pulse1.steps[2].enabled, note: "G4" },
        });
      });
      meter.takeMutations();
    }

    const result = meter.finish(edits);
    console.log("BENCH", JSON.stringify({ scenario: "edit-step", ...result }));
    expect(result.commits).toBe(edits);
    expect(harness.song.tracks.pulse1.steps[2].enabled).toBe(edits % 2 === 1);
    expect(screen.queryByLabelText("Pulse I step 3")?.dataset.noteOriginStep === "2").toBe(edits % 2 === 1);
  });

  it("reports render cost per pointer move while dragging a note", () => {
    const props = { ...createProps(), playbackState: "stopped" as const };
    const meter = createCostMeter();
    const { view, harness } = renderStatefulMatrix(props, meter.onRender);
    const pulseRow = screen.getByLabelText("Pulse I step 1").closest<HTMLElement>("[role='row']");
    const firstGridCell = pulseRow?.querySelector<HTMLElement>("[data-step-index='0']");

    if (firstGridCell === null || firstGridCell === undefined) {
      throw new Error("Expected the Pulse I grid");
    }

    setStepWidth(firstGridCell);
    fireEvent.mouseDown(screen.getByLabelText("Pulse I step 1"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: stepWidthPx, clientY: 0 });
    meter.start(view.container);

    for (let move = 2; move < dragMoves + 2; move += 1) {
      fireEvent.mouseMove(window, { clientX: move * stepWidthPx, clientY: 0 });
      meter.takeMutations();
    }

    const result = meter.finish(dragMoves);
    console.log("BENCH", JSON.stringify({ scenario: "drag-move", ...result }));
    expect(result.commits).toBe(dragMoves);

    fireEvent.mouseMove(window, { clientX: 2 * stepWidthPx, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 2 * stepWidthPx, clientY: 0 });
    expect(harness.song.tracks.pulse1.steps[2]).toMatchObject({ enabled: true, note: "C4", length: 2 });
    expect(harness.song.tracks.pulse1.steps[0].enabled).toBe(false);
  });
  it("reports shell render cost per step edit from the detail panel", () => {
    const audio: ReturnType<typeof useAudioEngine> = {
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
    shellAudio.result = audio;
    const meter = createCostMeter();
    const view = render(
      <Profiler id="shell" onRender={meter.onRender}>
        <WorkstationShell initialSong={buildBusySong()} />
      </Profiler>,
    );

    fireEvent.click(screen.getByLabelText("Pulse I step 3"));
    const toggle = screen.getByLabelText("Enable Pulse I step 3");
    meter.start(view.container);

    for (let edit = 0; edit < shellEdits; edit += 1) {
      fireEvent.click(toggle);
      meter.takeMutations();
    }

    const result = meter.finish(shellEdits);
    console.log("BENCH", JSON.stringify({ scenario: "shell-edit", ...result }));
    expect(result.commits).toBeGreaterThanOrEqual(shellEdits);
    expect(toggle.getAttribute("aria-label")).toBe("Enable Pulse I step 3");
    expect(screen.getByLabelText("Pulse I step 3").dataset.stepIndex).toBe("2");
  }, 30_000);
});
