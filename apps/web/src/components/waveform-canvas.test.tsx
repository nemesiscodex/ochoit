import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WaveformCanvas } from "@/components/waveform-canvas";

class MockResizeObserver {
  readonly observe = vi.fn<(target: Element) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(readonly callback: ResizeObserverCallback) {}
}

function createMockContext() {
  return {
    beginPath: vi.fn<() => void>(),
    clearRect: vi.fn<(x: number, y: number, width: number, height: number) => void>(),
    fillRect: vi.fn<(x: number, y: number, width: number, height: number) => void>(),
    lineTo: vi.fn<(x: number, y: number) => void>(),
    moveTo: vi.fn<(x: number, y: number) => void>(),
    restore: vi.fn<() => void>(),
    save: vi.fn<() => void>(),
    setTransform: vi.fn<(a: number, b: number, c: number, d: number, e: number, f: number) => void>(),
    stroke: vi.fn<() => void>(),
    fillStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: "",
  };
}

describe("waveform-canvas", () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.stubGlobal("CanvasRenderingContext2D", class {});
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 240,
      bottom: 80,
      width: 240,
      height: 80,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws a waveform path and attaches resize handling", () => {
    render(
      <WaveformCanvas
        ariaLabel="Pulse 1 waveform"
        samples={new Uint8Array([128, 180, 92, 144, 128])}
        className="h-20 w-full"
        lineColor="#ffd166"
      />,
    );

    expect(screen.getByRole("img", { name: "Pulse 1 waveform" })).toBeTruthy();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith("2d");
    expect(mockContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 240, 80);
    expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 240, 80);
    expect(mockContext.moveTo).toHaveBeenCalled();
    expect(mockContext.lineTo).toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
  });
});
