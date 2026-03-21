import type { SongDocument, TrackId } from "@/features/song/song-document";

export const TRACK_VOLUME_PERCENT_RANGE = {
  min: 0,
  max: 100,
  step: 1,
} as const;

const trackVolumeMin = 0;
const trackVolumeMax = 1;
const trackVolumePrecision = 100;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampTrackVolume(value: number) {
  return clampNumber(Math.round(value * trackVolumePrecision) / trackVolumePrecision, trackVolumeMin, trackVolumeMax);
}

export function toTrackVolumePercent(value: number) {
  return Math.round(clampTrackVolume(value) * trackVolumePrecision);
}

export function updateMasterVolume(song: SongDocument, volume: number): SongDocument {
  if (!Number.isFinite(volume)) {
    return song;
  }

  return {
    ...song,
    mixer: {
      ...song.mixer,
      masterVolume: clampTrackVolume(volume),
    },
  };
}

export function updateOldSpeakerMode(song: SongDocument, enabled: boolean): SongDocument {
  return {
    ...song,
    mixer: {
      ...song.mixer,
      oldSpeakerMode: enabled,
    },
  };
}

export function updateTrackMute(song: SongDocument, trackId: TrackId): SongDocument {
  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: {
            ...song.tracks.pulse1,
            muted: !song.tracks.pulse1.muted,
          },
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: {
            ...song.tracks.pulse2,
            muted: !song.tracks.pulse2.muted,
          },
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: {
            ...song.tracks.triangle,
            muted: !song.tracks.triangle.muted,
          },
        },
      };
    case "noise":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          noise: {
            ...song.tracks.noise,
            muted: !song.tracks.noise.muted,
          },
        },
      };
    case "sample":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          sample: {
            ...song.tracks.sample,
            muted: !song.tracks.sample.muted,
          },
        },
      };
  }
}

export function updateTrackVolume(song: SongDocument, trackId: TrackId, volume: number): SongDocument {
  if (!Number.isFinite(volume)) {
    return song;
  }

  const nextVolume = clampTrackVolume(volume);

  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: {
            ...song.tracks.pulse1,
            volume: nextVolume,
          },
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: {
            ...song.tracks.pulse2,
            volume: nextVolume,
          },
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: {
            ...song.tracks.triangle,
            volume: nextVolume,
          },
        },
      };
    case "noise":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          noise: {
            ...song.tracks.noise,
            volume: nextVolume,
          },
        },
      };
    case "sample":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          sample: {
            ...song.tracks.sample,
            volume: nextVolume,
          },
        },
      };
  }
}
