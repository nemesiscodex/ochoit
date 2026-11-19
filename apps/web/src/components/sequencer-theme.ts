import type { TrackId } from "ochoit-lib";

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

// Tailwind only generates classes it can read whole in the source, so each voice spells its classes out.
// In light mode the waveform line mixes in ink: a bright voice colour on the pale well falls under 3:1.
export const voiceClassesByTrackId: Record<TrackId, { fill: string; swatch: string; wave: string }> = {
  pulse1: { fill: "bg-voice-pulse1 text-voice-ink", swatch: "bg-voice-pulse1", wave: "text-[color-mix(in_oklab,var(--voice-pulse1)_62%,var(--ink))] dark:text-voice-pulse1" },
  pulse2: { fill: "bg-voice-pulse2 text-voice-ink", swatch: "bg-voice-pulse2", wave: "text-[color-mix(in_oklab,var(--voice-pulse2)_62%,var(--ink))] dark:text-voice-pulse2" },
  triangle: { fill: "bg-voice-triangle text-voice-ink", swatch: "bg-voice-triangle", wave: "text-[color-mix(in_oklab,var(--voice-triangle)_62%,var(--ink))] dark:text-voice-triangle" },
  noise: { fill: "bg-voice-noise text-voice-ink", swatch: "bg-voice-noise", wave: "text-[color-mix(in_oklab,var(--voice-noise)_62%,var(--ink))] dark:text-voice-noise" },
  sample: { fill: "bg-voice-sample text-voice-ink", swatch: "bg-voice-sample", wave: "text-[color-mix(in_oklab,var(--voice-sample)_62%,var(--ink))] dark:text-voice-sample" },
};

// The sample deck and shell still read these; the waveform canvas resolves the CSS variables itself.
export const waveformLineColorByTrackId: Record<TrackId, string> = voiceColorByTrackId;

export const waveformGlowColorByTrackId: Record<TrackId, string> = {
  pulse1: "transparent",
  pulse2: "transparent",
  triangle: "transparent",
  noise: "transparent",
  sample: "transparent",
};
