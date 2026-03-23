import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef } from "react";

import { cn } from "@ochoit/ui/lib/utils";

/** Visual theme for the canvas fill and grid — pair with app light/dark (e.g. 8bitcn light mode). */
export type WaveformCanvasVariant = "dark" | "light";

type WaveformCanvasProps = {
  ariaLabel: string;
  samples: ArrayLike<number>;
  className?: string;
  /** When set, picks background + grid defaults; explicit color props still override. */
  variant?: WaveformCanvasVariant;
  backgroundColor?: string;
  glowColor?: string;
  gridColor?: string;
  lineColor?: string;
};

type DrawConfig = Required<Pick<WaveformCanvasProps, "backgroundColor" | "glowColor" | "gridColor" | "lineColor">> & {
  samples: ArrayLike<number>;
};

const defaultDrawConfig: DrawConfig = {
  samples: new Uint8Array([128]),
  backgroundColor: "rgba(5, 8, 22, 0.94)",
  glowColor: "rgba(139, 211, 255, 0.28)",
  gridColor: "rgba(255, 255, 255, 0.12)",
  lineColor: "#8bd3ff",
};

/** Defaults aligned with retro dark / light surfaces from `retro-themes.ts`. */
const variantPresets: Record<
  WaveformCanvasVariant,
  Pick<WaveformCanvasProps, "backgroundColor" | "gridColor">
> = {
  dark: {
    backgroundColor: "rgba(7, 8, 14, 0.92)",
    gridColor: "rgba(255, 255, 255, 0.12)",
  },
  light: {
    backgroundColor: "rgba(247, 244, 234, 0.94)",
    gridColor: "rgba(23, 23, 23, 0.18)",
  },
};

/** Maps `next-themes` resolved mode to canvas waveform colors (retro light vs dark). */
export function useWaveformCanvasVariant(): WaveformCanvasVariant {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? "light" : "dark";
}

function getCanvasSize(canvas: HTMLCanvasElement) {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width || canvas.clientWidth || 320));
  const height = Math.max(1, Math.round(bounds.height || canvas.clientHeight || 80));

  return { width, height };
}

function toWaveformY(sample: number, height: number) {
  const normalizedSample = (sample - 128) / 128;
  const amplitude = (height / 2) * 0.82;
  return height / 2 - normalizedSample * amplitude;
}

export function WaveformCanvas({
  ariaLabel,
  samples,
  className,
  variant = "dark",
  backgroundColor,
  glowColor = defaultDrawConfig.glowColor,
  gridColor,
  lineColor = defaultDrawConfig.lineColor,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawConfigRef = useRef<DrawConfig>(defaultDrawConfig);

  const preset = variantPresets[variant];
  const resolvedBackground = backgroundColor ?? preset.backgroundColor ?? defaultDrawConfig.backgroundColor;
  const resolvedGrid = gridColor ?? preset.gridColor ?? defaultDrawConfig.gridColor;

  drawConfigRef.current = {
    samples,
    backgroundColor: resolvedBackground,
    glowColor,
    gridColor: resolvedGrid,
    lineColor,
  };

  const drawCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (typeof CanvasRenderingContext2D === "undefined") {
      return;
    }

    let context: CanvasRenderingContext2D | null = null;

    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }

    if (context === null) {
      return;
    }

    const ctx = context;

    const { width, height } = getCanvasSize(canvas);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const { samples: nextSamples, backgroundColor, glowColor, gridColor, lineColor } = drawConfigRef.current;

    canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(height * devicePixelRatio));

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (nextSamples.length === 0) {
      return;
    }

    const lastSampleIndex = nextSamples.length - 1;

    const drawWavePath = () => {
      ctx.beginPath();

      for (let index = 0; index < nextSamples.length; index += 1) {
        const sample = nextSamples[index] ?? 128;
        const x = lastSampleIndex === 0 ? 0 : (index / lastSampleIndex) * width;
        const y = toWaveformY(sample, height);

        if (index === 0) {
          ctx.moveTo(x, y);
          continue;
        }

        ctx.lineTo(x, y);
      }
    };

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    drawWavePath();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    drawWavePath();
    ctx.stroke();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    drawCanvas(canvas);
  }, [drawCanvas, samples, resolvedBackground, glowColor, resolvedGrid, lineColor]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const redraw = () => {
      drawCanvas(canvas);
    };

    redraw();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(redraw);
      observer.observe(canvas);

      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", redraw);

    return () => {
      window.removeEventListener("resize", redraw);
    };
  }, [drawCanvas]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("block h-full w-full rounded-none", className)}
    />
  );
}
