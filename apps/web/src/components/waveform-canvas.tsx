import { useCallback, useEffect, useRef } from "react";

import { cn } from "@ochoit/ui/lib/utils";

type WaveformCanvasProps = {
  ariaLabel: string;
  samples: ArrayLike<number>;
  className?: string;
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
  backgroundColor = defaultDrawConfig.backgroundColor,
  glowColor = defaultDrawConfig.glowColor,
  gridColor = defaultDrawConfig.gridColor,
  lineColor = defaultDrawConfig.lineColor,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawConfigRef = useRef<DrawConfig>(defaultDrawConfig);

  drawConfigRef.current = {
    samples,
    backgroundColor,
    glowColor,
    gridColor,
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

    const { width, height } = getCanvasSize(canvas);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const { samples: nextSamples, backgroundColor, glowColor, gridColor, lineColor } = drawConfigRef.current;

    canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(height * devicePixelRatio));

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);

    context.beginPath();
    context.strokeStyle = gridColor;
    context.lineWidth = 1;
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();

    if (nextSamples.length === 0) {
      return;
    }

    const lastSampleIndex = nextSamples.length - 1;

    const drawWavePath = () => {
      context.beginPath();

      for (let index = 0; index < nextSamples.length; index += 1) {
        const sample = nextSamples[index] ?? 128;
        const x = lastSampleIndex === 0 ? 0 : (index / lastSampleIndex) * width;
        const y = toWaveformY(sample, height);

        if (index === 0) {
          context.moveTo(x, y);
          continue;
        }

        context.lineTo(x, y);
      }
    };

    context.save();
    context.globalAlpha = 0.45;
    context.strokeStyle = glowColor;
    context.lineWidth = 3;
    drawWavePath();
    context.stroke();
    context.restore();

    context.strokeStyle = lineColor;
    context.lineWidth = 1.5;
    drawWavePath();
    context.stroke();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    drawCanvas(canvas);
  }, [drawCanvas, samples, backgroundColor, glowColor, gridColor, lineColor]);

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
