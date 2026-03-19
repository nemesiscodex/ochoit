import type {
  NoiseTrack,
  SampleTrack,
  SerializedSampleAsset,
  SongDocument,
  TrackId,
} from "@/features/song/song-document";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const noteOctaves = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

type NoteName = (typeof noteNames)[number];
type NoteOctave = (typeof noteOctaves)[number];
export type NoteValue = `${NoteName}${NoteOctave}`;

export const melodicTrackIds = ["pulse1", "pulse2", "triangle"] as const;
export const triggerTrackIds = ["noise", "sample"] as const;

export type MelodicTrackId = (typeof melodicTrackIds)[number];
export type TriggerTrackId = (typeof triggerTrackIds)[number];

export type MelodicStepUpdates = {
  enabled?: boolean;
  note?: NoteValue;
};

export type NoiseTriggerPresetId =
  | "tick"
  | "hat"
  | "snare"
  | "burst"
  | "shaker"
  | "hiss"
  | "crash"
  | "rumble";

export type NoiseTriggerPreset = {
  id: NoiseTriggerPresetId;
  label: string;
  shortLabel: string;
  mode: NoiseTrack["steps"][number]["mode"];
  periodIndex: NoiseTrack["steps"][number]["periodIndex"];
};

export type NoiseStepUpdates = {
  enabled?: boolean;
  presetId?: NoiseTriggerPresetId;
};

export type SampleStepUpdates = {
  enabled?: boolean;
  sampleId?: string | null;
  playbackRate?: number;
};

export type MelodicArrangementEntry = {
  stepIndex: number;
  note: NoteValue;
};

export type NoiseArrangementEntry = {
  stepIndex: number;
  presetId: NoiseTriggerPresetId;
};

export type SampleArrangementEntry = {
  stepIndex: number;
  sampleId: string;
  playbackRate: number;
};

export type ParseMelodicArrangementResult =
  | {
      ok: true;
      entries: MelodicArrangementEntry[];
    }
  | {
      ok: false;
      error: string;
    };

export type ParseNoiseArrangementResult =
  | {
      ok: true;
      entries: NoiseArrangementEntry[];
    }
  | {
      ok: false;
      error: string;
    };

export type ParseSampleArrangementResult =
  | {
      ok: true;
      entries: SampleArrangementEntry[];
    }
  | {
      ok: false;
      error: string;
    };

export const noteEntryOptions: NoteValue[] = noteOctaves.flatMap((octave) =>
  noteNames.map((noteName) => `${noteName}${octave}` as NoteValue),
);

export const noiseTriggerPresets = [
  { id: "tick", label: "Tick", shortLabel: "tick", mode: "short", periodIndex: 0 },
  { id: "hat", label: "Hi-Hat", shortLabel: "hat", mode: "short", periodIndex: 1 },
  { id: "snare", label: "Snare", shortLabel: "snr", mode: "short", periodIndex: 3 },
  { id: "burst", label: "Burst", shortLabel: "brst", mode: "short", periodIndex: 7 },
  { id: "shaker", label: "Shaker", shortLabel: "shk", mode: "long", periodIndex: 5 },
  { id: "hiss", label: "Hiss", shortLabel: "hiss", mode: "long", periodIndex: 8 },
  { id: "crash", label: "Crash", shortLabel: "crsh", mode: "long", periodIndex: 12 },
  { id: "rumble", label: "Rumble", shortLabel: "rmb", mode: "long", periodIndex: 15 },
] as const satisfies readonly NoiseTriggerPreset[];

export const samplePlaybackRateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const arrangementLinePattern = /^(\d+)\s*:\s*(.+)$/;
const arrangementNotePattern = /^([A-Ga-g])(#?)([0-8])$/;
const supportedNoteSet = new Set(noteEntryOptions);
const samplePlaybackRateMin = 0.25;
const samplePlaybackRateMax = 4;
const defaultSamplePlaybackRate = 1;

const noisePresetById = new Map<NoiseTriggerPresetId, NoiseTriggerPreset>(
  noiseTriggerPresets.map((preset) => [preset.id, preset]),
);
const noisePresetByStepSignature = new Map<string, NoiseTriggerPreset>(
  noiseTriggerPresets.map((preset) => [getNoisePresetSignature(preset.mode, preset.periodIndex), preset]),
);

export function isMelodicTrackId(trackId: TrackId): trackId is MelodicTrackId {
  return melodicTrackIds.includes(trackId as MelodicTrackId);
}

export function isTriggerTrackId(trackId: TrackId): trackId is TriggerTrackId {
  return triggerTrackIds.includes(trackId as TriggerTrackId);
}

export function updateMelodicTrackStep(
  song: SongDocument,
  trackId: MelodicTrackId,
  stepIndex: number,
  updates: MelodicStepUpdates,
): SongDocument {
  if (stepIndex < 0 || stepIndex >= song.transport.loopLength) {
    return song;
  }

  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: updatePulseTrackStep(song.tracks.pulse1, stepIndex, updates),
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: updatePulseTrackStep(song.tracks.pulse2, stepIndex, updates),
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: updateTriangleTrackStep(song.tracks.triangle, stepIndex, updates),
        },
      };
  }
}

export function updateNoiseTrackStep(song: SongDocument, stepIndex: number, updates: NoiseStepUpdates): SongDocument {
  if (stepIndex < 0 || stepIndex >= song.transport.loopLength) {
    return song;
  }

  return {
    ...song,
    tracks: {
      ...song.tracks,
      noise: {
        ...song.tracks.noise,
        steps: song.tracks.noise.steps.map((step, index) => {
          if (index !== stepIndex) {
            return step;
          }

          const preset = updates.presetId === undefined ? null : getNoiseTriggerPresetById(updates.presetId);

          return {
            ...step,
            enabled: updates.enabled ?? step.enabled,
            mode: preset?.mode ?? step.mode,
            periodIndex: preset?.periodIndex ?? step.periodIndex,
          };
        }),
      },
    },
  };
}

export function updateSampleTrackStep(song: SongDocument, stepIndex: number, updates: SampleStepUpdates): SongDocument {
  if (stepIndex < 0 || stepIndex >= song.transport.loopLength) {
    return song;
  }

  return {
    ...song,
    tracks: {
      ...song.tracks,
      sample: {
        ...song.tracks.sample,
        steps: song.tracks.sample.steps.map((step, index) => {
          if (index !== stepIndex) {
            return step;
          }

          return {
            ...step,
            enabled: updates.enabled ?? step.enabled,
            sampleId: updates.sampleId === undefined ? step.sampleId : updates.sampleId,
            playbackRate: updates.playbackRate ?? step.playbackRate,
          };
        }),
      },
    },
  };
}

export function serializeMelodicTrackArrangement(
  track: SongDocument["tracks"]["pulse1"] | SongDocument["tracks"]["pulse2"] | SongDocument["tracks"]["triangle"],
) {
  return track.steps
    .flatMap((step, index) => {
      if (!step.enabled) {
        return [];
      }

      return `${index + 1}: ${step.note}`;
    })
    .join("\n");
}

export function serializeNoiseTrackArrangement(track: NoiseTrack) {
  return track.steps
    .flatMap((step, index) => {
      if (!step.enabled) {
        return [];
      }

      const preset = getNoiseTriggerPresetForStep(step);
      return `${index + 1}: ${preset?.id ?? "hiss"}`;
    })
    .join("\n");
}

export function serializeSampleTrackArrangement(track: SampleTrack) {
  return track.steps
    .flatMap((step, index) => {
      if (!step.enabled || step.sampleId === null) {
        return [];
      }

      return `${index + 1}: ${step.sampleId}@${formatSamplePlaybackRate(step.playbackRate)}`;
    })
    .join("\n");
}

export function parseMelodicTrackArrangement(input: string, loopLength: number): ParseMelodicArrangementResult {
  const lines = splitArrangementLines(input);
  const entriesByStep = new Map<number, NoteValue>();

  for (const [lineIndex, line] of lines.entries()) {
    const parsedLine = parseArrangementLine(line, lineIndex);

    if (!parsedLine.ok) {
      return parsedLine;
    }

    const note = normalizeArrangementNote(parsedLine.value);

    if (note === null) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} has an unsupported note. Use notes from C0 to B8 with optional sharps.`,
      };
    }

    if (parsedLine.stepNumber > loopLength) {
      continue;
    }

    entriesByStep.set(parsedLine.stepNumber - 1, note);
  }

  return {
    ok: true,
    entries: Array.from(entriesByStep.entries())
      .map(([stepIndex, note]) => ({ stepIndex, note }))
      .sort((left: MelodicArrangementEntry, right: MelodicArrangementEntry) => left.stepIndex - right.stepIndex),
  };
}

export function parseNoiseTrackArrangement(input: string, loopLength: number): ParseNoiseArrangementResult {
  const lines = splitArrangementLines(input);
  const entriesByStep = new Map<number, NoiseTriggerPresetId>();

  for (const [lineIndex, line] of lines.entries()) {
    const parsedLine = parseArrangementLine(line, lineIndex);

    if (!parsedLine.ok) {
      return parsedLine;
    }

    const presetId = normalizeNoiseTriggerPresetId(parsedLine.value);

    if (presetId === null) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} has an unknown noise trigger. Use one of: ${noiseTriggerPresets.map((preset) => preset.id).join(", ")}.`,
      };
    }

    if (parsedLine.stepNumber > loopLength) {
      continue;
    }

    entriesByStep.set(parsedLine.stepNumber - 1, presetId);
  }

  return {
    ok: true,
    entries: Array.from(entriesByStep.entries())
      .map(([stepIndex, presetId]) => ({ stepIndex, presetId }))
      .sort((left: NoiseArrangementEntry, right: NoiseArrangementEntry) => left.stepIndex - right.stepIndex),
  };
}

export function parseSampleTrackArrangement(
  input: string,
  loopLength: number,
  samples: readonly SerializedSampleAsset[],
): ParseSampleArrangementResult {
  const lines = splitArrangementLines(input);
  const entriesByStep = new Map<number, SampleArrangementEntry>();
  const sampleReferenceMap = createSampleReferenceMap(samples);

  for (const [lineIndex, line] of lines.entries()) {
    const parsedLine = parseArrangementLine(line, lineIndex);

    if (!parsedLine.ok) {
      return parsedLine;
    }

    const parsedTrigger = parseSampleTriggerDescriptor(parsedLine.value);

    if (!parsedTrigger.ok) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} ${parsedTrigger.error}`,
      };
    }

    const sample = sampleReferenceMap.get(normalizeSampleReference(parsedTrigger.sampleReference));

    if (sample === undefined) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} references an unknown sample. Use a sample id or name from the deck.`,
      };
    }

    if (parsedLine.stepNumber > loopLength) {
      continue;
    }

    entriesByStep.set(parsedLine.stepNumber - 1, {
      stepIndex: parsedLine.stepNumber - 1,
      sampleId: sample.id,
      playbackRate: parsedTrigger.playbackRate,
    });
  }

  return {
    ok: true,
    entries: Array.from(entriesByStep.values()).sort(
      (left: SampleArrangementEntry, right: SampleArrangementEntry) => left.stepIndex - right.stepIndex,
    ),
  };
}

export function replaceMelodicTrackArrangement(
  song: SongDocument,
  trackId: MelodicTrackId,
  entries: readonly MelodicArrangementEntry[],
): SongDocument {
  const entriesByStep = new Map(entries.map((entry) => [entry.stepIndex, entry.note]));

  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: {
            ...song.tracks.pulse1,
            steps: song.tracks.pulse1.steps.map((step, index) => ({
              ...step,
              enabled: entriesByStep.has(index),
              note: entriesByStep.get(index) ?? step.note,
            })),
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
            steps: song.tracks.pulse2.steps.map((step, index) => ({
              ...step,
              enabled: entriesByStep.has(index),
              note: entriesByStep.get(index) ?? step.note,
            })),
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
            steps: song.tracks.triangle.steps.map((step, index) => ({
              ...step,
              enabled: entriesByStep.has(index),
              note: entriesByStep.get(index) ?? step.note,
            })),
          },
        },
      };
  }
}

export function replaceNoiseTrackArrangement(
  song: SongDocument,
  entries: readonly NoiseArrangementEntry[],
): SongDocument {
  const entriesByStep = new Map(entries.map((entry) => [entry.stepIndex, entry.presetId]));

  return {
    ...song,
    tracks: {
      ...song.tracks,
      noise: {
        ...song.tracks.noise,
        steps: song.tracks.noise.steps.map((step, index) => {
          const presetId = entriesByStep.get(index);
          const preset = presetId === undefined ? null : getNoiseTriggerPresetById(presetId);

          return {
            ...step,
            enabled: preset !== null,
            mode: preset?.mode ?? step.mode,
            periodIndex: preset?.periodIndex ?? step.periodIndex,
          };
        }),
      },
    },
  };
}

export function replaceSampleTrackArrangement(
  song: SongDocument,
  entries: readonly SampleArrangementEntry[],
): SongDocument {
  const entriesByStep = new Map(entries.map((entry) => [entry.stepIndex, entry]));

  return {
    ...song,
    tracks: {
      ...song.tracks,
      sample: {
        ...song.tracks.sample,
        steps: song.tracks.sample.steps.map((step, index) => {
          const entry = entriesByStep.get(index);

          return {
            ...step,
            enabled: entry !== undefined,
            sampleId: entry?.sampleId ?? step.sampleId,
            playbackRate: entry?.playbackRate ?? step.playbackRate,
          };
        }),
      },
    },
  };
}

export function getNoiseTriggerPresetById(presetId: NoiseTriggerPresetId) {
  return noisePresetById.get(presetId) ?? null;
}

export function getNoiseTriggerPresetForStep(step: NoiseTrack["steps"][number]) {
  return noisePresetByStepSignature.get(getNoisePresetSignature(step.mode, step.periodIndex)) ?? null;
}

export function getNoiseStepLabel(step: NoiseTrack["steps"][number]) {
  if (!step.enabled) {
    return "·";
  }

  return getNoiseTriggerPresetForStep(step)?.shortLabel ?? step.mode;
}

export function getSampleStepLabel(
  step: SampleTrack["steps"][number],
  samples: readonly SerializedSampleAsset[],
) {
  if (!step.enabled) {
    return "·";
  }

  const sample = step.sampleId === null ? null : samples.find((entry) => entry.id === step.sampleId) ?? null;

  if (sample === null) {
    return "none";
  }

  return `${sample.name} ${formatPlaybackRateLabel(step.playbackRate)}`;
}

export function getDefaultSampleTrigger(
  samples: readonly SerializedSampleAsset[],
): Pick<SampleTrack["steps"][number], "sampleId" | "playbackRate"> {
  return {
    sampleId: samples[0]?.id ?? null,
    playbackRate: defaultSamplePlaybackRate,
  };
}

export function formatPlaybackRateLabel(playbackRate: number) {
  return `${formatSamplePlaybackRate(playbackRate)}x`;
}

function normalizeArrangementNote(rawNote: string): NoteValue | null {
  const match = arrangementNotePattern.exec(rawNote.trim());

  if (match === null) {
    return null;
  }

  const normalizedNote = `${match[1].toUpperCase()}${match[2]}${match[3]}` as NoteValue;
  return supportedNoteSet.has(normalizedNote) ? normalizedNote : null;
}

function splitArrangementLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseArrangementLine(
  line: string,
  lineIndex: number,
): { ok: true; stepNumber: number; value: string } | { ok: false; error: string } {
  const match = arrangementLinePattern.exec(line);

  if (match === null) {
    return {
      ok: false,
      error: `Line ${lineIndex + 1} must match "<step>: <value>" like "1: E4".`,
    };
  }

  const stepNumber = Number(match[1]);

  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    return {
      ok: false,
      error: `Line ${lineIndex + 1} must use a step number starting at 1.`,
    };
  }

  return {
    ok: true,
    stepNumber,
    value: match[2].trim(),
  };
}

function parseSampleTriggerDescriptor(
  value: string,
): { ok: true; sampleReference: string; playbackRate: number } | { ok: false; error: string } {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return {
      ok: false,
      error: 'must include a sample reference like "mic-001@1x".',
    };
  }

  const rateSeparatorIndex = trimmedValue.lastIndexOf("@");
  let sampleReference = trimmedValue;
  let playbackRate = defaultSamplePlaybackRate;

  if (rateSeparatorIndex > 0) {
    const nextSampleReference = trimmedValue.slice(0, rateSeparatorIndex).trim();
    const rateToken = trimmedValue
      .slice(rateSeparatorIndex + 1)
      .trim()
      .replace(/x$/i, "");

    if (nextSampleReference.length === 0) {
      return {
        ok: false,
        error: 'must include a sample reference before the "@" symbol.',
      };
    }

    const parsedPlaybackRate = Number(rateToken);

    if (!Number.isFinite(parsedPlaybackRate)) {
      return {
        ok: false,
        error: `has an invalid playback rate. Use a value between ${samplePlaybackRateMin} and ${samplePlaybackRateMax}.`,
      };
    }

    if (parsedPlaybackRate < samplePlaybackRateMin || parsedPlaybackRate > samplePlaybackRateMax) {
      return {
        ok: false,
        error: `has an unsupported playback rate. Use a value between ${samplePlaybackRateMin} and ${samplePlaybackRateMax}.`,
      };
    }

    sampleReference = nextSampleReference;
    playbackRate = parsedPlaybackRate;
  }

  return {
    ok: true,
    sampleReference,
    playbackRate,
  };
}

function normalizeNoiseTriggerPresetId(value: string): NoiseTriggerPresetId | null {
  const normalizedValue = value.trim().toLowerCase();
  const preset = noiseTriggerPresets.find((entry) => entry.id === normalizedValue);

  return preset?.id ?? null;
}

function getNoisePresetSignature(mode: NoiseTrack["steps"][number]["mode"], periodIndex: number) {
  return `${mode}:${periodIndex}`;
}

function createSampleReferenceMap(samples: readonly SerializedSampleAsset[]) {
  const sampleReferenceMap = new Map<string, SerializedSampleAsset>();

  for (const sample of samples) {
    sampleReferenceMap.set(normalizeSampleReference(sample.id), sample);
    sampleReferenceMap.set(normalizeSampleReference(sample.name), sample);
  }

  return sampleReferenceMap;
}

function normalizeSampleReference(value: string) {
  return value.trim().toLowerCase();
}

function formatSamplePlaybackRate(playbackRate: number) {
  if (Number.isInteger(playbackRate)) {
    return playbackRate.toString();
  }

  return playbackRate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function updatePulseTrackStep(
  track: SongDocument["tracks"]["pulse1"] | SongDocument["tracks"]["pulse2"],
  stepIndex: number,
  updates: MelodicStepUpdates,
) {
  return {
    ...track,
    steps: track.steps.map((step, index) => {
      if (index !== stepIndex) {
        return step;
      }

      return {
        ...step,
        ...updates,
      };
    }),
  };
}

function updateTriangleTrackStep(track: SongDocument["tracks"]["triangle"], stepIndex: number, updates: MelodicStepUpdates) {
  return {
    ...track,
    steps: track.steps.map((step, index) => {
      if (index !== stepIndex) {
        return step;
      }

      return {
        ...step,
        ...updates,
      };
    }),
  };
}
