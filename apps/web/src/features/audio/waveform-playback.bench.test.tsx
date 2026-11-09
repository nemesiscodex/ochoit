import { act, cleanup, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackWaveformCanvas } from "@/components/waveform-canvas";
import { trackOrder, type TrackId } from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";

const frameMs = 1000 / 60;
const simulatedSeconds = 2;
const waveformSize = 256;

function Row({ engine, trackId }: { engine: AudioEngine; trackId: TrackId }) {
  return <TrackWaveformCanvas ariaLabel={`${trackId} waveform`} engine={engine} trackId={trackId} />;
}

function createEngine(mode: "playing" | "silent") {
  let frame = 0;
  const getWaveform = vi.fn((_trackId: TrackId, size = waveformSize) => {
    const data = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) {
      data[index] = mode === "silent" ? 128 : Math.round(128 + 90 * Math.sin((index + frame * 3) / 6));
    }
    frame += 1;
    return data;
  });
  return { engine: { getWaveform } as unknown as AudioEngine, getWaveform };
}

function measure(mode: "playing" | "silent") {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    callbacks.delete(handle);
  });
  Object.defineProperty(window, "requestAnimationFrame", { value: globalThis.requestAnimationFrame, configurable: true });
  Object.defineProperty(window, "cancelAnimationFrame", { value: globalThis.cancelAnimationFrame, configurable: true });

  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
  };
  vi.stubGlobal("CanvasRenderingContext2D", class {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const rectReads = vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 80, width: 600, height: 80, toJSON: () => ({}) }),
  );
  const widthWrites = vi.fn();
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width");
  Object.defineProperty(HTMLCanvasElement.prototype, "width", {
    configurable: true,
    get: () => 600,
    set: (value: number) => {
      widthWrites(value);
    },
  });

  const { engine, getWaveform } = createEngine(mode);
  let commits = 0;

  act(() => {
    render(
      <Profiler
        id="rows"
        onRender={() => {
          commits += 1;
        }}
      >
        {trackOrder.map((trackId) => (
          <Row key={trackId} engine={engine} trackId={trackId} />
        ))}
      </Profiler>,
    );
  });

  const commitsAfterMount = commits;
  const widthWritesAfterMount = widthWrites.mock.calls.length;
  const rectReadsAfterMount = rectReads.mock.calls.length;
  const strokesAfterMount = context.stroke.mock.calls.length;
  const startedAt = performance.now();

  for (let frame = 1; frame <= (simulatedSeconds * 1000) / frameMs; frame += 1) {
    const due = [...callbacks.entries()];
    callbacks.clear();
    act(() => {
      due.forEach(([, callback]) => callback(frame * frameMs));
    });
  }

  const wallMs = performance.now() - startedAt;

  if (widthDescriptor !== undefined) {
    Object.defineProperty(HTMLCanvasElement.prototype, "width", widthDescriptor);
  }

  return {
    mode,
    commitsPerSecond: (commits - commitsAfterMount) / simulatedSeconds,
    canvasBitmapResetsPerSecond: (widthWrites.mock.calls.length - widthWritesAfterMount) / simulatedSeconds,
    forcedLayoutReadsPerSecond: (rectReads.mock.calls.length - rectReadsAfterMount) / simulatedSeconds,
    strokesPerSecond: (context.stroke.mock.calls.length - strokesAfterMount) / simulatedSeconds,
    analyserReadsPerSecond: getWaveform.mock.calls.length / simulatedSeconds,
    wallMsForTwoSeconds: Math.round(wallMs),
  };
}

describe("waveform playback cost (5 tracks, 2 simulated seconds at 60 fps)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("redraws at 30 Hz while playing without React commits, bitmap resets or layout reads", () => {
    const result = measure("playing");
    console.log("BENCH", JSON.stringify(result));

    expect(result.commitsPerSecond).toBe(0);
    expect(result.canvasBitmapResetsPerSecond).toBe(0);
    expect(result.forcedLayoutReadsPerSecond).toBe(0);
    // Each paint strokes the grid line, the glow and the wave: 3 strokes per track per frame.
    expect(result.strokesPerSecond).toBe(trackOrder.length * 3 * 30);
  });

  it("draws nothing while the analysers report silence", () => {
    const result = measure("silent");
    console.log("BENCH", JSON.stringify(result));

    expect(result.commitsPerSecond).toBe(0);
    expect(result.canvasBitmapResetsPerSecond).toBe(0);
    expect(result.forcedLayoutReadsPerSecond).toBe(0);
    expect(result.strokesPerSecond).toBe(0);
    expect(result.analyserReadsPerSecond).toBeGreaterThan(0);
  });
});
