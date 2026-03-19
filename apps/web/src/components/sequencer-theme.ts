import { type Track, type TrackId } from "@/features/song/song-document";

export const accentByTrackId: Record<TrackId, string> = {
  pulse1: "border-[#ffd166]/45 bg-[#ffd166]/10 text-[#ffd166]",
  pulse2: "border-[#8bd3ff]/45 bg-[#8bd3ff]/10 text-[#8bd3ff]",
  triangle: "border-[#7ae582]/45 bg-[#7ae582]/10 text-[#7ae582]",
  noise: "border-[#ff8c69]/45 bg-[#ff8c69]/10 text-[#ff8c69]",
  sample: "border-[#ff70a6]/45 bg-[#ff70a6]/10 text-[#ff70a6]",
};

export const waveformLineColorByTrackId: Record<TrackId, string> = {
  pulse1: "#ffd166",
  pulse2: "#8bd3ff",
  triangle: "#7ae582",
  noise: "#ff8c69",
  sample: "#ff70a6",
};

export const waveformGlowColorByTrackId: Record<TrackId, string> = {
  pulse1: "rgba(255, 209, 102, 0.32)",
  pulse2: "rgba(139, 211, 255, 0.32)",
  triangle: "rgba(122, 229, 130, 0.28)",
  noise: "rgba(255, 140, 105, 0.32)",
  sample: "rgba(255, 112, 166, 0.34)",
};

export const labelByTrackId: Record<TrackId, string> = {
  pulse1: "Pulse I",
  pulse2: "Pulse II",
  triangle: "Triangle",
  noise: "Noise",
  sample: "PCM",
};

export function getTrackSummary(track: Track) {
  switch (track.kind) {
    case "pulse":
      return "Pulse lanes carry the lead and harmony phrases, with duty-cycle shaping called out in the row controls.";
    case "triangle":
      return "Triangle anchors the low-end pattern and stays note-driven for bass movement.";
    case "noise":
      return "Noise acts as the percussion lane, using discrete hits and period changes instead of pitched notes.";
    case "sample":
      return "PCM handles short recorded sounds from the sample deck, trimmed and triggered on the grid.";
  }
}

export function getTrackControls(track: Track) {
  switch (track.kind) {
    case "pulse":
      return [`duty ${getPulseDutyLabel(track)}`, "note grid", "volume"];
    case "triangle":
      return ["note grid", "bass lane", "volume"];
    case "noise":
      return ["noise mode", "period index", "hit grid"];
    case "sample":
      return ["recorded sample", "trim preview", "trigger grid"];
  }
}

export function getStepLabel(track: Track, index: number) {
  switch (track.kind) {
    case "pulse": {
      const step = track.steps[index];
      return step.enabled ? step.note : "--";
    }
    case "triangle": {
      const step = track.steps[index];
      return step.enabled ? step.note : "--";
    }
    case "noise": {
      const step = track.steps[index];
      if (!step.enabled) {
        return "--";
      }

      return step.mode === "short" ? "sn" : "nz";
    }
    case "sample": {
      const step = track.steps[index];
      if (!step.enabled) {
        return "--";
      }

      return step.sampleId === null ? "pcm" : "hit";
    }
  }
}

function getPulseDutyLabel(track: Extract<Track, { kind: "pulse" }>) {
  const pulseStep = track.steps.find((step) => step.enabled);

  if (pulseStep === undefined) {
    return "50%";
  }

  return `${pulseStep.duty * 100}%`;
}
