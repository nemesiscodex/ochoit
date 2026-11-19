import type { TrackId } from "ochoit-lib";
import type { CSSProperties } from "react";

export const labelByTrackId: Record<TrackId, string> = {
  pulse1: "Pulse I",
  pulse2: "Pulse II",
  triangle: "Triangle",
  noise: "Noise",
  sample: "PCM",
};

export const voiceColorByTrackId: Record<TrackId, string> = {
  pulse1: "var(--voice-pulse1)",
  pulse2: "var(--voice-pulse2)",
  triangle: "var(--voice-triangle)",
  noise: "var(--voice-noise)",
  sample: "var(--voice-sample)",
};

// A voice lane sets `--voice` once; its cells, scope, slider and step editor read `(--voice)` classes from it.
export function voiceStyle(trackId: TrackId): CSSProperties & { "--voice": string } {
  return { "--voice": voiceColorByTrackId[trackId] };
}

export const waveformLineColorByTrackId: Record<TrackId, string> = {
  pulse1: "var(--trace-pulse1)",
  pulse2: "var(--trace-pulse2)",
  triangle: "var(--trace-triangle)",
  noise: "var(--trace-noise)",
  sample: "var(--trace-sample)",
};

export const waveformGlowColorByTrackId: Record<TrackId, string> = voiceColorByTrackId;
