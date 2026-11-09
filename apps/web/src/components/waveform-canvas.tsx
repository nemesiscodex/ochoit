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

type WaveformCanvasProps = Partial<WaveformColors> & {
  ariaLabel: string;
  samples: ArrayLike<number>;
  className?: string;
};

type TrackWaveformCanvasProps = Partial<WaveformColors> & {
  ariaLabel: string;
  engine: AudioEngine | null;
  trackId: TrackId;
  fallbackWaveform?: Uint8Array;
  sampleSize?: number;
  className?: string;
};

function useWaveformSurface(colors: WaveformColors) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const painterRef = useRef<ReturnType<typeof createWaveformPainter> | null>(null);
  const samplesRef = useRef<ArrayLike<number> | null>(null);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

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

  const { backgroundColor, glowColor, gridColor, lineColor } = colors;

  useEffect(() => {
    if (samplesRef.current !== null) {
      painterRef.current?.paint(samplesRef.current, colorsRef.current);
    }
  }, [backgroundColor, glowColor, gridColor, lineColor]);

  return { canvasRef, draw };
}

function resolveColors(colors: Partial<WaveformColors>): WaveformColors {
  return {
    backgroundColor: colors.backgroundColor ?? defaultWaveformColors.backgroundColor,
    glowColor: colors.glowColor ?? defaultWaveformColors.glowColor,
    gridColor: colors.gridColor ?? defaultWaveformColors.gridColor,
    lineColor: colors.lineColor ?? defaultWaveformColors.lineColor,
  };
}

export function WaveformCanvas({ ariaLabel, samples, className, ...colorOverrides }: WaveformCanvasProps) {
  const { backgroundColor, glowColor, gridColor, lineColor } = resolveColors(colorOverrides);
  const colors = useMemo(
    () => ({ backgroundColor, glowColor, gridColor, lineColor }),
    [backgroundColor, glowColor, gridColor, lineColor],
  );
  const { canvasRef, draw } = useWaveformSurface(colors);

  useEffect(() => {
    draw(samples);
  }, [draw, samples]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("block h-full w-full rounded-none", className)}
    />
  );
}

export function TrackWaveformCanvas({
  ariaLabel,
  engine,
  trackId,
  fallbackWaveform,
  sampleSize = WAVEFORM_SAMPLE_SIZE,
  className,
  ...colorOverrides
}: TrackWaveformCanvasProps) {
  const { backgroundColor, glowColor, gridColor, lineColor } = resolveColors(colorOverrides);
  const colors = useMemo(
    () => ({ backgroundColor, glowColor, gridColor, lineColor }),
    [backgroundColor, glowColor, gridColor, lineColor],
  );
  const { canvasRef, draw } = useWaveformSurface(colors);
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
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("block h-full w-full rounded-none", className)}
    />
  );
}
