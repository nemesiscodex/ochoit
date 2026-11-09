import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "ochoit-lib/web";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import { labelByTrackId, voiceColorByTrackId } from "@/components/sequencer-theme";
import { createPlayheadStore } from "@/features/audio/playhead-store";
import { applySongEdit, createEmptySongDocument, trackOrder, type SongDocument, type SongEdit } from "ochoit-lib";

type RenderedElement = { type: unknown; props: Record<string, unknown> };

const renderLog = vi.hoisted(() => ({ elements: [] as RenderedElement[] }));

// Every element a component returns passes through jsxDEV, so the log lists exactly what re-rendered.
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-dev-runtime")>();

  return {
    ...actual,
    jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
      renderLog.elements.push({ type: args[0], props: (args[1] ?? {}) as Record<string, unknown> });
      return actual.jsxDEV(...args);
    },
  };
});

type MatrixProps = ComponentProps<typeof SequencerMatrix>;

function renderMatrix(song: SongDocument, overrides: Partial<MatrixProps> = {}) {
  const playhead = createPlayheadStore();
  const props: MatrixProps = {
    defaultSampleId: null,
    engine: null,
    onOpenArrangementEditor: vi.fn(),
    onEdit: vi.fn(),
    song,
    playbackState: "stopped",
    playhead,
    onStartTransportAtStep: vi.fn(async () => undefined),
    ...overrides,
  };

  function MatrixWithSongState() {
    const [currentSong, setSong] = useState(props.song);

    return (
      <SequencerMatrix
        {...props}
        song={currentSong}
        onEdit={(edit: SongEdit) => {
          setSong((previous) => applySongEdit(previous, edit, { defaultSampleId: null }).song);
        }}
      />
    );
  }

  render(<MatrixWithSongState />);

  return props.playhead;
}

function getComponentName(type: unknown) {
  // memo() wraps the component function in an object that keeps it under `type`.
  const component = typeof type === "function" ? type : (type as { type?: unknown } | null)?.type;

  // The dev transform renames a memo() component's inner function (SequencerRow becomes SequencerRow2).
  return typeof component === "function" ? component.name.replace(/\d+$/, "") : null;
}

function recordRenders(update: () => void) {
  renderLog.elements = [];
  update();
  const elements = renderLog.elements;
  renderLog.elements = [];

  const describeStepElement = ({ props }: RenderedElement) =>
    typeof props["aria-label"] === "string" ? props["aria-label"] : `ruler ${String(props.children)}`;
  const isSweep = ({ props }: RenderedElement) =>
    props["aria-hidden"] === "true" && typeof (props.style as { left?: unknown } | undefined)?.left === "string";
  // A row's root element is created only when the row's own render function runs.
  const rowLabelByColor = new Map(trackOrder.map((trackId) => [voiceColorByTrackId[trackId], labelByTrackId[trackId]]));
  const isRowRoot = ({ props }: RenderedElement) =>
    typeof props.className === "string" && props.className.includes("oc-voice-row");

  return {
    stepElements: elements
      .filter(({ props }) => "aria-current" in props)
      .map(describeStepElement)
      .sort(),
    sweepLefts: elements.filter(isSweep).map(({ props }) => (props.style as { left: string }).left),
    noteSegments: elements
      .filter(({ props }) => "data-note-origin-step" in props)
      .map(({ props }) => String(props["aria-label"]))
      .sort(),
    rows: elements
      .filter(isRowRoot)
      .map(({ props }) => rowLabelByColor.get((props.style as { borderLeftColor: string }).borderLeftColor))
      .sort(),
    rowHeadings: elements.filter(({ type }) => type === "h3").map(({ props }) => String(props.children)),
    created: (componentName: string) => elements.filter(({ type }) => getComponentName(type) === componentName).length,
  };
}

function songWithSustainedPulseNote() {
  const song = createEmptySongDocument();
  song.tracks.pulse1.steps[4] = { ...song.tracks.pulse1.steps[4], enabled: true, note: "E4", length: 2 };
  return song;
}

describe("sequencer-matrix render scope", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("re-renders only the step elements whose highlight changes on a playback step", () => {
    const playhead = renderMatrix(songWithSustainedPulseNote(), { playbackState: "playing" });

    act(() => {
      playhead.set({ nextStep: 4, loopCount: 0 });
    });

    const renders = recordRenders(() => {
      act(() => {
        playhead.set({ nextStep: 5, loopCount: 0 });
      });
    });

    expect(renders.stepElements).toEqual([
      "Noise step 5",
      "Noise step 6",
      "PCM step 5",
      "PCM step 6",
      "Pulse II step 5",
      "Pulse II step 6",
      "Triangle step 5",
      "Triangle step 6",
      "ruler 5",
      "ruler 6",
    ]);
    expect(renders.sweepLefts).toEqual(["50%"]);
    expect(renders.rows).toEqual([]);
    expect(renders.rowHeadings).toEqual([]);
  });

  it("keeps every track an edit does not touch by reference", () => {
    const song = createEmptySongDocument();
    const edited = applySongEdit(song, {
      type: "update-step",
      trackId: "pulse1",
      stepIndex: 2,
      changes: { enabled: true, note: "G4" },
    }).song;

    expect(edited.tracks.pulse1).not.toBe(song.tracks.pulse1);
    expect(trackOrder.filter((trackId) => edited.tracks[trackId] === song.tracks[trackId])).toEqual([
      "pulse2",
      "triangle",
      "noise",
      "sample",
    ]);
    expect(edited.samples).toBe(song.samples);
    expect(edited.transport).toBe(song.transport);
  });

  it("re-renders only the edited row, and in it only the new note and the cells near it, when a step is enabled", () => {
    const song = applySongEdit(createEmptySongDocument(), { type: "set-loop-length", loopLength: 64, confirmed: true }).song;
    song.tracks.pulse1.steps[8] = { ...song.tracks.pulse1.steps[8], enabled: true, note: "C4", length: 2 };
    song.tracks.pulse1.steps[40] = { ...song.tracks.pulse1.steps[40], enabled: true, note: "E4", length: 1 };
    renderMatrix(song);
    fireEvent.click(screen.getByLabelText("Pulse I step 3"));

    const renders = recordRenders(() => {
      fireEvent.keyDown(document, { key: "Enter" });
    });

    expect(screen.getByLabelText("Disable Pulse I step 3")).toBeTruthy();
    expect(renders.rows).toEqual(["Pulse I"]);
    expect(renders.rowHeadings).toEqual([]);
    expect(renders.noteSegments).toEqual(["Pulse I step 3"]);
    expect(renders.created("MelodicGridCell")).toBeLessThanOrEqual(16);
    expect(renders.created("RulerStepCell")).toBe(0);
  });

  it("re-renders only the two rows a selection moves between", () => {
    renderMatrix(createEmptySongDocument());
    fireEvent.click(screen.getByLabelText("Noise step 3"));

    const renders = recordRenders(() => {
      fireEvent.click(screen.getByLabelText("Pulse I step 3"));
    });

    expect(screen.getByLabelText("Pulse I step 3").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pulse I step 3 editor")).toBeTruthy();
    expect(renders.rows).toEqual(["Noise", "Pulse I"]);
    expect(renders.stepElements).toEqual(["Noise step 3", "Pulse I step 3"]);
    expect(renders.rowHeadings).toEqual([]);
    expect(renders.created("RulerStepCell")).toBe(0);
  });

  it("re-renders only the selected row and the two cells whose selection changes", () => {
    renderMatrix(createEmptySongDocument());
    fireEvent.click(screen.getByLabelText("Noise step 3"));

    const renders = recordRenders(() => {
      fireEvent.click(screen.getByLabelText("Noise step 4"));
    });

    expect(screen.getByLabelText("Noise step 4").getAttribute("aria-selected")).toBe("true");
    expect(renders.stepElements).toEqual(["Noise step 3", "Noise step 4"]);
    expect(renders.rows).toEqual(["Noise"]);
  });

  it("re-renders only the dragged row and the cells whose drag preview moves", () => {
    const song = createEmptySongDocument();
    song.tracks.noise.steps[1] = { ...song.tracks.noise.steps[1], enabled: true };
    renderMatrix(song);

    const noiseCell = screen.getByLabelText("Noise step 2");
    const noiseRow = noiseCell.closest<HTMLElement>("[role='row']");
    const firstNoiseCell = noiseRow?.querySelector<HTMLElement>("[data-step-index='0']");

    if (firstNoiseCell === null || firstNoiseCell === undefined) {
      throw new Error("Expected the noise row grid");
    }

    Object.defineProperty(firstNoiseCell, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 20, height: 48, top: 0, left: 0, right: 20, bottom: 48, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.mouseDown(noiseCell, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });

    const renders = recordRenders(() => {
      fireEvent.mouseMove(window, { clientX: 60, clientY: 0 });
    });

    expect(renders.rows).toEqual(["Noise"]);
    expect(renders.stepElements).toEqual(["Noise step 4", "Noise step 5"]);
  });

  it("re-renders only the moving preview when a melodic note is dragged", () => {
    const song = createEmptySongDocument();
    song.tracks.pulse1.steps[0] = { ...song.tracks.pulse1.steps[0], enabled: true, note: "C4", length: 2 };
    renderMatrix(song);

    const note = screen.getByLabelText("Pulse I step 1");
    const firstPulseCell = note.closest<HTMLElement>("[role='row']")?.querySelector<HTMLElement>("[data-step-index='0']");

    if (firstPulseCell === null || firstPulseCell === undefined) {
      throw new Error("Expected the Pulse I grid");
    }

    Object.defineProperty(firstPulseCell, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 20, height: 48, top: 0, left: 0, right: 20, bottom: 48, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.mouseDown(note, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });

    const renders = recordRenders(() => {
      fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });
    });

    expect(document.querySelector("[data-note-origin-step='2']")?.getAttribute("aria-label")).toBe("Pulse I step 3");
    expect(renders.rows).toEqual(["Pulse I"]);
    expect(renders.stepElements).toEqual(["Pulse I step 3"]);
    expect(renders.created("MelodicGridCell")).toBe(0);
    expect(renders.created("MelodicStepDetail")).toBe(0);
  });

  it("animates track waveforms without committing a React render", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(nextFrameId, callback);
      return nextFrameId++;
    });
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      frames.delete(frameId);
    });
    let waveformFrame = 0;
    const getWaveform = vi.fn(() => Uint8Array.from({ length: 256 }, (_, index) => (index + waveformFrame) % 256));
    const engine = { getWaveform } as unknown as AudioEngine;
    let commits = 0;

    render(
      <Profiler id="matrix" onRender={() => void (commits += 1)}>
        <SequencerMatrix
          defaultSampleId={null}
          engine={engine}
          onEdit={vi.fn()}
          onOpenArrangementEditor={vi.fn()}
          onStartTransportAtStep={vi.fn(async () => undefined)}
          playbackState="playing"
          playhead={createPlayheadStore()}
          song={createEmptySongDocument()}
        />
      </Profiler>,
    );
    const commitsAfterMount = commits;
    const readsAfterMount = getWaveform.mock.calls.length;

    for (let frame = 1; frame <= 12; frame += 1) {
      waveformFrame = frame;
      const due = [...frames.values()];
      frames.clear();
      act(() => {
        due.forEach((callback) => callback(frame * 50));
      });
    }

    expect(getWaveform.mock.calls.length - readsAfterMount).toBe(12 * trackOrder.length);
    expect(commits).toBe(commitsAfterMount);
  });
});
