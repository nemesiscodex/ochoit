import { useCallback, useEffect, useMemo, useRef } from "react";

import { cn } from "@ochoit/ui/lib/utils";
import type { TrackId } from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";

import { WAVEFORM_SAMPLE_SIZE, createFlatWaveform } from "@/features/audio/waveform-data";
import {
  createWaveformPainter,
  defaultWaveformColors,
  sameSamples,
  type WaveformColors,
} from "@/features/audio/waveform-painter";

const liveWaveformIntervalMs = 1000 / 30;
const frameJitterMs = 2;

type WaveformColorProps = Partial<WaveformColors>;

type WaveformCanvasProps = WaveformColorProps & {
  ariaLabel: string;
  samples: ArrayLike<number>;
  className?: string;
};

type TrackWaveformCanvasProps = WaveformColorProps & {
  ariaLabel: string;
  engine: AudioEngine | null;
  trackId: TrackId;
  fallbackWaveform?: Uint8Array;
  sampleSize?: number;
  className?: string;
};

const cssVariablePattern = /^var\((--[\w-]+)\)$/;

// Canvas cannot read CSS variables, so colours come from the canvas's computed style: an unset colour uses its
// `color`, `background-color` and border colour, and a `var(--token)` colour is looked up on it.
function readCanvasColors(canvas: HTMLCanvasElement, colors: WaveformColorProps): WaveformColors {
  const style = window.getComputedStyle(canvas);
  const resolve = (value: string | undefined, computed: string, fallback: string) => {
    if (value === undefined) {
      return computed || fallback;
    }

    const variable = cssVariablePattern.exec(value.trim())?.[1];

    return variable === undefined ? value : style.getPropertyValue(variable).trim() || fallback;
  };

  return {
    backgroundColor: resolve(colors.backgroundColor, style.backgroundColor, "transparent"),
    glowColor: resolve(colors.glowColor, "", "transparent"),
    gridColor: resolve(colors.gridColor, style.borderTopColor, defaultWaveformColors.gridColor),
    lineColor: resolve(colors.lineColor, style.color, defaultWaveformColors.lineColor),
  };
}

function useWaveformSurface({ backgroundColor, glowColor, gridColor, lineColor }: WaveformColorProps, className?: string) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const painterRef = useRef<ReturnType<typeof createWaveformPainter> | null>(null);
  const samplesRef = useRef<ArrayLike<number> | null>(null);
  const colorsRef = useRef<WaveformColors>(defaultWaveformColors);

  const draw = useCallback((samples: ArrayLike<number>) => {
    samplesRef.current = samples;
    painterRef.current?.paint(samples, colorsRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const painter = createWaveformPainter(canvas);
    painterRef.current = painter;
    painter.measure();

    if (samplesRef.current !== null) {
      painter.paint(samplesRef.current, colorsRef.current);
    }

    const handleResize = () => {
      if (painter.measure() && samplesRef.current !== null) {
        painter.paint(samplesRef.current, colorsRef.current);
      }
    };

    let cleanup: () => void;

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      cleanup = () => observer.disconnect();
    } else {
      window.addEventListener("resize", handleResize);
      cleanup = () => window.removeEventListener("resize", handleResize);
    }

    return () => {
      cleanup();
      painterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    colorsRef.current = readCanvasColors(canvas, { backgroundColor, glowColor, gridColor, lineColor });

    if (samplesRef.current !== null) {
      painterRef.current?.paint(samplesRef.current, colorsRef.current);
    }
  }, [backgroundColor, glowColor, gridColor, lineColor, className]);

  return { canvasRef, draw };
}

export function WaveformCanvas({ ariaLabel, samples, className, ...colors }: WaveformCanvasProps) {
  const { canvasRef, draw } = useWaveformSurface(colors, className);

  useEffect(() => {
    draw(samples);
  }, [draw, samples]);

  return (
    <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className={cn("block h-full w-full", className)} />
  );
}

export function TrackWaveformCanvas({
  ariaLabel,
  engine,
  trackId,
  fallbackWaveform,
  sampleSize = WAVEFORM_SAMPLE_SIZE,
  className,
  ...colors
}: TrackWaveformCanvasProps) {
  const { canvasRef, draw } = useWaveformSurface(colors, className);
  const idleWaveform = useMemo(
    () => fallbackWaveform ?? createFlatWaveform(sampleSize),
    [fallbackWaveform, sampleSize],
  );

  useEffect(() => {
    if (engine === null) {
      draw(idleWaveform);
      return;
    }

    let isActive = true;
    let lastCaptureAt = -Infinity;
    let frameId: number | null = null;
    let previous = engine.getWaveform(trackId, sampleSize);

    draw(previous);

    const capture = (time: number) => {
      if (!isActive) {
        return;
      }

      if (time - lastCaptureAt >= liveWaveformIntervalMs - frameJitterMs) {
        lastCaptureAt = time;
        const next = engine.getWaveform(trackId, sampleSize);

        if (!sameSamples(previous, next)) {
          previous = next;
          draw(next);
        }
      }

      frameId = window.requestAnimationFrame(capture);
    };

    frameId = window.requestAnimationFrame(capture);

    return () => {
      isActive = false;

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [draw, engine, idleWaveform, sampleSize, trackId]);

  return (
    <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className={cn("block h-full w-full", className)} />
  );
}
