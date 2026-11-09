import { clampTrackVolume } from "ochoit-lib";

export const TRACK_VOLUME_PERCENT_RANGE = {
  min: 0,
  max: 100,
  step: 1,
} as const;

const trackVolumePrecision = 100;

export function toTrackVolumePercent(value: number) {
  return Math.round(clampTrackVolume(value) * trackVolumePrecision);
}
