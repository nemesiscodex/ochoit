import {
  DEFAULT_PULSE_DUTY,
  type NoiseTrack,
  type PulseTrack,
  type SampleTrack,
  type SerializedSampleAsset,
  type SongDocument,
  type TrackId,
  type TriangleTrack,
} from "@/features/song/song-document";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const noteOctaves = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const minMelodicStepLength = 1;
const defaultMelodicStepLength = 1;

type NoteName = (typeof noteNames)[number];
type NoteOctave = (typeof noteOctaves)[number];
type MelodicTrack = PulseTrack | TriangleTrack;
export type PulseDutyValue = PulseTrack["steps"][number]["duty"];

type ParsedArrangementLine =
  | {
      ok: true;
      stepNumber: number;
      value: string;
    }
  | {
      ok: false;
      error: string;
    };

export type NoteValue = `${NoteName}${NoteOctave}`;

export const melodicTrackIds = ["pulse1", "pulse2", "triangle"] as const;
export const triggerTrackIds = ["noise", "sample"] as const;

export type MelodicTrackId = (typeof melodicTrackIds)[number];
export type TriggerTrackId = (typeof triggerTrackIds)[number];

export type MelodicStepUpdates = {
  enabled?: boolean;
  note?: NoteValue;
  length?: number;
  duty?: PulseDutyValue;
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
  length: number;
};

export type MelodicStepState =
  | {
      kind: "start";
      note: NoteValue;
      length: number;
    }
  | {
      kind: "hold";
      note: NoteValue;
      startIndex: number;
      length: number;
      offset: number;
    }
  | {
      kind: "rest";
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
export const pulseDutyOptions = [0.125, 0.25, 0.5, 0.75] as const satisfies readonly PulseDutyValue[];

const arrangementLinePattern = /^(\d+)\s*:\s*(.+)$/;
const melodicArrangementLinePattern = /^(\d+)(?:\s*-\s*(\d+))?\s*:\s*(.+)$/;
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

export function getMelodicTrackMaxLength(track: MelodicTrack, stepIndex: number) {
  const step = track.steps[stepIndex];

  if (step === undefined || !step.enabled) {
    return defaultMelodicStepLength;
  }

  const nextEnabledStepIndex = findNextEnabledMelodicStepIndex(track, stepIndex);
  const loopLength = track.steps.length;

  return nextEnabledStepIndex === null ? loopLength - stepIndex : nextEnabledStepIndex - stepIndex;
}

export function getMelodicArrangementEntries(track: MelodicTrack): MelodicArrangementEntry[] {
  return track.steps.flatMap((step, index) => {
    if (!step.enabled) {
      return [];
    }

      return [
        {
          stepIndex: index,
          note: step.note as NoteValue,
          length: clampMelodicStepLength(step.length, index, track.steps.length),
        },
      ];
  });
}

export function getMelodicStepState(track: MelodicTrack, stepIndex: number): MelodicStepState {
  const currentStep = track.steps[stepIndex];

  if (currentStep?.enabled) {
    return {
      kind: "start",
      note: currentStep.note as NoteValue,
      length: clampMelodicStepLength(currentStep.length, stepIndex, track.steps.length),
    };
  }

  for (let index = stepIndex - 1; index >= 0; index -= 1) {
    const step = track.steps[index];

    if (!step?.enabled) {
      continue;
    }

    const length = clampMelodicStepLength(step.length, index, track.steps.length);

    if (stepIndex < index + length) {
      return {
        kind: "hold",
        note: step.note as NoteValue,
        startIndex: index,
        length,
        offset: stepIndex - index,
      };
    }

    break;
  }

  return {
    kind: "rest",
  };
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
          pulse1: updateMelodicTrack(song.tracks.pulse1, stepIndex, updates),
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: updateMelodicTrack(song.tracks.pulse2, stepIndex, updates),
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: updateMelodicTrack(song.tracks.triangle, stepIndex, updates),
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

export function serializeMelodicTrackArrangement(track: MelodicTrack) {
  return getMelodicArrangementEntries(track)
    .map((entry) => {
      if (entry.length === 1) {
        return `${entry.stepIndex + 1}: ${entry.note}`;
      }

      return `${entry.stepIndex + 1}-${entry.stepIndex + entry.length}: ${entry.note}`;
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
  const entriesByStep = new Map<number, MelodicArrangementEntry>();

  for (const [lineIndex, line] of lines.entries()) {
    const parsedLine = parseMelodicArrangementLine(line, lineIndex);

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

    const finalEndStep = Math.min(parsedLine.endStepNumber ?? parsedLine.stepNumber, loopLength);

    entriesByStep.set(parsedLine.stepNumber - 1, {
      stepIndex: parsedLine.stepNumber - 1,
      note,
      length: finalEndStep - parsedLine.stepNumber + 1,
    });
  }

  return {
    ok: true,
    entries: Array.from(entriesByStep.values()).sort(
      (left: MelodicArrangementEntry, right: MelodicArrangementEntry) => left.stepIndex - right.stepIndex,
    ),
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
  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: buildMelodicTrack(song.tracks.pulse1, entries, { normalizePulseDuty: true }),
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: buildMelodicTrack(song.tracks.pulse2, entries, { normalizePulseDuty: true }),
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: buildMelodicTrack(song.tracks.triangle, entries),
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

export function formatPulseDutyLabel(duty: PulseDutyValue) {
  const dutyPercent = duty * 100;

  if (Number.isInteger(dutyPercent)) {
    return `${dutyPercent}%`;
  }

  return `${dutyPercent.toFixed(1)}%`;
}

function updateMelodicTrack<TTrack extends MelodicTrack>(
  track: TTrack,
  stepIndex: number,
  updates: MelodicStepUpdates,
) {
  const entries = getMelodicArrangementEntries(track);
  const existingEntryIndex = entries.findIndex((entry) => entry.stepIndex === stepIndex);

  if (updates.enabled === false) {
    if (existingEntryIndex === -1) {
      return track;
    }

    const nextEntries = entries.filter((entry) => entry.stepIndex !== stepIndex);
    return applyPulseDutyUpdate(track, stepIndex, updates.duty, buildMelodicTrack(track, nextEntries));
  }

  if (existingEntryIndex !== -1) {
    const nextEntries = entries.map((entry) => {
      if (entry.stepIndex !== stepIndex) {
        return entry;
      }

      return {
        ...entry,
        note: updates.note ?? entry.note,
        length:
          updates.length === undefined
            ? entry.length
            : clampMelodicStepLength(updates.length, stepIndex, track.steps.length),
      };
    });

    return applyPulseDutyUpdate(track, stepIndex, updates.duty, buildMelodicTrack(track, nextEntries));
  }

  if (updates.enabled !== true) {
    return track;
  }

  const coveringEntry = entries.find(
    (entry) => entry.stepIndex < stepIndex && stepIndex < entry.stepIndex + entry.length,
  );
  const nextEntries = entries
    .map((entry) =>
      coveringEntry !== undefined && entry.stepIndex === coveringEntry.stepIndex
        ? {
            ...entry,
            length: stepIndex - entry.stepIndex,
          }
        : entry,
    )
    .filter((entry) => entry.length >= minMelodicStepLength);

  nextEntries.push({
    stepIndex,
    note: updates.note ?? (track.steps[stepIndex]?.note as NoteValue | undefined) ?? "C4",
    length:
      updates.length === undefined
        ? defaultMelodicStepLength
        : clampMelodicStepLength(updates.length, stepIndex, track.steps.length),
  });

  return applyPulseDutyUpdate(track, stepIndex, updates.duty, buildMelodicTrack(track, nextEntries));
}

function buildMelodicTrack<TTrack extends MelodicTrack>(
  track: TTrack,
  entries: readonly MelodicArrangementEntry[],
  options?: { normalizePulseDuty?: boolean },
) {
  const dedupedEntriesByStep = new Map(entries.map((entry) => [entry.stepIndex, entry]));
  const sortedEntries = Array.from(dedupedEntriesByStep.values())
    .filter((entry) => entry.stepIndex >= 0 && entry.stepIndex < track.steps.length)
    .sort((left, right) => left.stepIndex - right.stepIndex);
  const normalizedEntries = sortedEntries.map((entry, index) => {
    const nextStart = sortedEntries[index + 1]?.stepIndex ?? track.steps.length;
    const maxLength = Math.min(track.steps.length - entry.stepIndex, nextStart - entry.stepIndex);

    return {
      ...entry,
      length: Math.max(minMelodicStepLength, Math.min(Math.round(entry.length), maxLength)),
    };
  });
  const steps = track.steps.map((step) => ({
    ...step,
    ...(track.kind === "pulse" && options?.normalizePulseDuty ? { duty: DEFAULT_PULSE_DUTY } : {}),
    enabled: false,
    length: defaultMelodicStepLength,
  }));

  normalizedEntries.forEach((entry) => {
    const step = steps[entry.stepIndex];

    if (step === undefined) {
      return;
    }

    steps[entry.stepIndex] = {
      ...step,
      enabled: true,
      note: entry.note,
      length: entry.length,
    };
  });

  return {
    ...track,
    steps,
  };
}

function applyPulseDutyUpdate<TTrack extends MelodicTrack>(
  previousTrack: TTrack,
  stepIndex: number,
  duty: PulseDutyValue | undefined,
  nextTrack: TTrack,
) {
  if (duty === undefined || previousTrack.kind !== "pulse") {
    return nextTrack;
  }

  const step = nextTrack.steps[stepIndex];

  if (step === undefined || !step.enabled) {
    return nextTrack;
  }

  return {
    ...nextTrack,
    steps: nextTrack.steps.map((entry, index) => {
      if (index !== stepIndex) {
        return entry;
      }

      return {
        ...entry,
        duty,
      };
    }),
  };
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

function parseMelodicArrangementLine(
  line: string,
  lineIndex: number,
):
  | {
      ok: true;
      stepNumber: number;
      endStepNumber: number | null;
      value: string;
    }
  | {
      ok: false;
      error: string;
    } {
  const match = melodicArrangementLinePattern.exec(line);

  if (match === null) {
    return {
      ok: false,
      error: `Line ${lineIndex + 1} must match "<step>: <value>" or "<start>-<end>: <value>" like "1-4: E4".`,
    };
  }

  const stepNumber = Number(match[1]);
  const endStepNumber = match[2] === undefined ? null : Number(match[2]);

  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    return {
      ok: false,
      error: `Line ${lineIndex + 1} must use a step number starting at 1.`,
    };
  }

  if (endStepNumber !== null && (!Number.isInteger(endStepNumber) || endStepNumber < stepNumber)) {
    return {
      ok: false,
      error: `Line ${lineIndex + 1} must use an end step greater than or equal to the start step.`,
    };
  }

  return {
    ok: true,
    stepNumber,
    endStepNumber,
    value: match[3].trim(),
  };
}

function parseArrangementLine(line: string, lineIndex: number): ParsedArrangementLine {
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

function clampMelodicStepLength(length: number, stepIndex: number, loopLength: number) {
  return Math.max(minMelodicStepLength, Math.min(Math.round(length), loopLength - stepIndex));
}

function findNextEnabledMelodicStepIndex(track: MelodicTrack, stepIndex: number) {
  for (let index = stepIndex + 1; index < track.steps.length; index += 1) {
    if (track.steps[index]?.enabled) {
      return index;
    }
  }

  return null;
}
