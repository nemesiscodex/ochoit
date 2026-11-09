export type WaveformColors = {
  backgroundColor: string;
  glowColor: string;
  gridColor: string;
  lineColor: string;
};

export const defaultWaveformColors: WaveformColors = {
  backgroundColor: "rgba(5, 8, 22, 0.94)",
  glowColor: "rgba(139, 211, 255, 0.28)",
  gridColor: "rgba(255, 255, 255, 0.12)",
  lineColor: "#8bd3ff",
};

type Surface = { width: number; height: number; devicePixelRatio: number };

function toWaveformY(sample: number, height: number) {
  const normalizedSample = (sample - 128) / 128;
  const amplitude = (height / 2) * 0.82;
  return height / 2 - normalizedSample * amplitude;
}

export function sameSamples(a: ArrayLike<number> | null, b: ArrayLike<number>) {
  if (a === null || a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

export function createWaveformPainter(canvas: HTMLCanvasElement) {
  let surface: Surface | null = null;

  const measure = () => {
    const bounds = canvas.getBoundingClientRect();
    const next: Surface = {
      width: Math.max(1, Math.round(bounds.width || canvas.clientWidth || 320)),
      height: Math.max(1, Math.round(bounds.height || canvas.clientHeight || 80)),
      devicePixelRatio: window.devicePixelRatio || 1,
    };

    if (
      surface !== null &&
      surface.width === next.width &&
      surface.height === next.height &&
      surface.devicePixelRatio === next.devicePixelRatio
    ) {
      return false;
    }

    surface = next;
    canvas.width = Math.max(1, Math.round(next.width * next.devicePixelRatio));
    canvas.height = Math.max(1, Math.round(next.height * next.devicePixelRatio));
    return true;
  };

  const paint = (samples: ArrayLike<number>, colors: WaveformColors) => {
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

    if (surface === null) {
      measure();
    }

    const { width, height, devicePixelRatio } = surface as Surface;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.backgroundColor;
    context.fillRect(0, 0, width, height);

    context.beginPath();
    context.strokeStyle = colors.gridColor;
    context.lineWidth = 1;
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();

    if (samples.length === 0) {
      return;
    }

    const lastSampleIndex = samples.length - 1;

    const drawWavePath = () => {
      context.beginPath();

      for (let index = 0; index < samples.length; index += 1) {
        const x = lastSampleIndex === 0 ? 0 : (index / lastSampleIndex) * width;
        const y = toWaveformY(samples[index] ?? 128, height);

        if (index === 0) {
          context.moveTo(x, y);
          continue;
        }

        context.lineTo(x, y);
      }
    };

    context.save();
    context.globalAlpha = 0.45;
    context.strokeStyle = colors.glowColor;
    context.lineWidth = 3;
    drawWavePath();
    context.stroke();
    context.restore();

    context.strokeStyle = colors.lineColor;
    context.lineWidth = 1.5;
    drawWavePath();
    context.stroke();
  };

  return { measure, paint };
}
