import { type Track, type TrackId } from "ochoit-lib";

export const accentByTrackId: Record<TrackId, string> = {
  pulse1: "border-[var(--oc-pulse1)]/40 bg-[var(--oc-pulse1)]/10 text-[var(--oc-pulse1)]",
  pulse2: "border-[var(--oc-pulse2)]/40 bg-[var(--oc-pulse2)]/10 text-[var(--oc-pulse2)]",
  triangle: "border-[var(--oc-triangle)]/40 bg-[var(--oc-triangle)]/10 text-[var(--oc-triangle)]",
  noise: "border-[var(--oc-noise)]/40 bg-[var(--oc-noise)]/10 text-[var(--oc-noise)]",
  sample: "border-[var(--oc-sample)]/40 bg-[var(--oc-sample)]/10 text-[var(--oc-sample)]",
};

export const voiceColorByTrackId: Record<TrackId, string> = {
  pulse1: "var(--oc-pulse1)",
  pulse2: "var(--oc-pulse2)",
  triangle: "var(--oc-triangle)",
  noise: "var(--oc-noise)",
  sample: "var(--oc-sample)",
};

export const waveformLineColorByTrackId: Record<TrackId, string> = {
  pulse1: "#ffcf4a",
  pulse2: "#5cb8ff",
  triangle: "#4ae06a",
  noise: "#ff6b4a",
  sample: "#ff5ea0",
};

export const waveformGlowColorByTrackId: Record<TrackId, string> = {
  pulse1: "rgba(255, 207, 74, 0.34)",
  pulse2: "rgba(92, 184, 255, 0.32)",
  triangle: "rgba(74, 224, 106, 0.28)",
  noise: "rgba(255, 107, 74, 0.34)",
  sample: "rgba(255, 94, 160, 0.34)",
};

export const labelByTrackId: Record<TrackId, string> = {
  pulse1: "Pulse I",
  pulse2: "Pulse II",
  triangle: "Triangle",
  noise: "Noise",
  sample: "PCM",
};

export const shortLabelByTrackId: Record<TrackId, string> = {
  pulse1: "PU1",
  pulse2: "PU2",
  triangle: "TRI",
  noise: "NOS",
  sample: "PCM",
};

export function getStepLabel(track: Track, index: number) {
  switch (track.kind) {
    case "pulse": {
      const step = track.steps[index];
      return step.enabled ? step.note : "·";
    }
    case "triangle": {
      const step = track.steps[index];
      return step.enabled ? step.note : "·";
    }
    case "noise": {
      const step = track.steps[index];
      if (!step.enabled) {
        return "·";
      }

      return step.mode === "short" ? "sn" : "nz";
    }
    case "sample": {
      const step = track.steps[index];
      if (!step.enabled) {
        return "·";
      }

      return step.sampleId === null ? "pcm" : "hit";
    }
  }
}
