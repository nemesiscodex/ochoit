import type { SongDocument, Track } from "./song-document.js";

export const TRIANGLE_OUTPUT_GAIN = 1.7;

const stepGainByKind: Record<Track["kind"], (stepVolume: number) => number> = {
  pulse: (stepVolume) => stepVolume,
  triangle: (stepVolume) => Math.min(1, stepVolume * TRIANGLE_OUTPUT_GAIN),
  noise: (stepVolume) => stepVolume,
  sample: (stepVolume) => stepVolume,
};

export function getVoiceStepGain(kind: Track["kind"], stepVolume: number) {
  return stepGainByKind[kind](stepVolume);
}

export function getTrackGain(track: Pick<Track, "muted" | "volume">) {
  return track.muted ? 0 : track.volume;
}

export function getStepOutputGain(
  mixer: Pick<SongDocument["mixer"], "masterVolume">,
  track: Pick<Track, "kind" | "muted" | "volume">,
  stepVolume: number,
) {
  return mixer.masterVolume * getTrackGain(track) * getVoiceStepGain(track.kind, stepVolume);
}
