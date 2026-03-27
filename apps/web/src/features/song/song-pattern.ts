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
  volume?: number;
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
  mode?: NoiseTrack["steps"][number]["mode"];
  periodIndex?: NoiseTrack["steps"][number]["periodIndex"];
  volume?: number;
};

export type SampleStepUpdates = {
  enabled?: boolean;
  sampleId?: string | null;
  note?: NoteValue;
  playbackRate?: number;
  volume?: number;
};

export type MelodicArrangementEntry = {
  stepIndex: number;
  note: NoteValue;
  length: number;
  duty?: PulseDutyValue;
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
  mode: NoiseTrack["steps"][number]["mode"];
  periodIndex: NoiseTrack["steps"][number]["periodIndex"];
};

export type SampleArrangementEntry = {
  stepIndex: number;
  sampleId: string;
  note: NoteValue;
  playbackRate: number;
};

type MelodicTrackEntryWithVolume = MelodicArrangementEntry & {
  volume: number;
};

type NoiseTrackEntryWithVolume = NoiseArrangementEntry & {
  volume: number;
};

type SampleTrackEntryWithVolume = SampleArrangementEntry & {
  volume: number;
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
const pulseDutyPattern = /^(12\.5|25|50|75)%?$/;
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

    const pulseStep = track.kind === "pulse" ? track.steps[index] : null;

    return [
      {
        stepIndex: index,
        note: step.note as NoteValue,
        length: clampMelodicStepLength(step.length, index, track.steps.length),
        ...(pulseStep === null ? {} : { duty: pulseStep.duty }),
      },
    ];
  });
}

function getMelodicTrackEntriesWithVolume(track: MelodicTrack): MelodicTrackEntryWithVolume[] {
  return track.steps.flatMap((step, index) => {
    if (!step.enabled) {
      return [];
    }

    const pulseStep = track.kind === "pulse" ? track.steps[index] : null;

    return [
      {
        stepIndex: index,
        note: step.note as NoteValue,
        length: clampMelodicStepLength(step.length, index, track.steps.length),
        volume: step.volume,
        ...(pulseStep === null ? {} : { duty: pulseStep.duty }),
      },
    ];
  });
}

function getNoiseTrackEntries(track: NoiseTrack): NoiseTrackEntryWithVolume[] {
  return track.steps.flatMap((step, index) =>
    step.enabled
      ? [
          {
            stepIndex: index,
            mode: step.mode,
            periodIndex: step.periodIndex,
            volume: step.volume,
          },
        ]
      : [],
  );
}

function getSampleTrackEntries(track: SampleTrack): SampleTrackEntryWithVolume[] {
  return track.steps.flatMap((step, index) =>
    step.enabled && step.sampleId !== null
      ? [
          {
            stepIndex: index,
            sampleId: step.sampleId,
            note: step.note as NoteValue,
            playbackRate: step.playbackRate,
            volume: step.volume,
          },
        ]
      : [],
  );
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
            mode: updates.mode ?? preset?.mode ?? step.mode,
            periodIndex: updates.periodIndex ?? preset?.periodIndex ?? step.periodIndex,
            volume: updates.volume ?? step.volume,
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
            note: updates.note ?? step.note,
            playbackRate: updates.playbackRate ?? step.playbackRate,
            volume: updates.volume ?? step.volume,
          };
        }),
      },
    },
  };
}

export function moveMelodicTrackEntries(
  song: SongDocument,
  trackId: MelodicTrackId,
  selectedStepIndexes: number[],
  delta: number,
): SongDocument {
  if (delta === 0) {
    return song;
  }

  const track = song.tracks[trackId];
  const entries = getMelodicTrackEntriesWithVolume(track);
  const selectedEntries = selectEntriesByStepIndex(entries, selectedStepIndexes);

  if (selectedEntries === null) {
    return song;
  }

  const untouchedEntries = entries.filter((entry) => !selectedEntries.some((selectedEntry) => selectedEntry.stepIndex === entry.stepIndex));
  const movedEntries = selectedEntries.map((entry) => ({
    ...entry,
    stepIndex: entry.stepIndex + delta,
  }));

  if (!areMovedMelodicEntriesValid(movedEntries, untouchedEntries, track.steps.length)) {
    return song;
  }

  return replaceMelodicTrack(trackId, song, buildMelodicTrack(track, [...untouchedEntries, ...movedEntries]));
}

export function moveNoiseTrackEntries(song: SongDocument, selectedStepIndexes: number[], delta: number): SongDocument {
  if (delta === 0) {
    return song;
  }

  const entries = getNoiseTrackEntries(song.tracks.noise);
  const selectedEntries = selectEntriesByStepIndex(entries, selectedStepIndexes);

  if (selectedEntries === null) {
    return song;
  }

  const untouchedEntries = entries.filter((entry) => !selectedEntries.some((selectedEntry) => selectedEntry.stepIndex === entry.stepIndex));
  const movedEntries = selectedEntries.map((entry) => ({
    ...entry,
    stepIndex: entry.stepIndex + delta,
  }));

  if (!areMovedTriggerEntriesValid(movedEntries, untouchedEntries, song.tracks.noise.steps.length)) {
    return song;
  }

  return {
    ...song,
    tracks: {
      ...song.tracks,
      noise: buildNoiseTrack(song.tracks.noise, [...untouchedEntries, ...movedEntries]),
    },
  };
}

export function moveSampleTrackEntries(song: SongDocument, selectedStepIndexes: number[], delta: number): SongDocument {
  if (delta === 0) {
    return song;
  }

  const entries = getSampleTrackEntries(song.tracks.sample);
  const selectedEntries = selectEntriesByStepIndex(entries, selectedStepIndexes);

  if (selectedEntries === null) {
    return song;
  }

  const untouchedEntries = entries.filter((entry) => !selectedEntries.some((selectedEntry) => selectedEntry.stepIndex === entry.stepIndex));
  const movedEntries = selectedEntries.map((entry) => ({
    ...entry,
    stepIndex: entry.stepIndex + delta,
  }));

  if (!areMovedTriggerEntriesValid(movedEntries, untouchedEntries, song.tracks.sample.steps.length)) {
    return song;
  }

  return {
    ...song,
    tracks: {
      ...song.tracks,
      sample: buildSampleTrack(song.tracks.sample, [...untouchedEntries, ...movedEntries]),
    },
  };
}

export function replaceSampleTrackSampleReference(
  song: SongDocument,
  previousSampleId: string | null,
  nextSampleId: string,
): SongDocument {
  if (previousSampleId === nextSampleId) {
    return song;
  }

  let hasUpdates = false;
  const nextSteps = song.tracks.sample.steps.map((step) => {
    if (!step.enabled || step.sampleId !== previousSampleId) {
      return step;
    }

    hasUpdates = true;

    return {
      ...step,
      sampleId: nextSampleId,
    };
  });

  if (!hasUpdates) {
    return song;
  }

  return {
    ...song,
    tracks: {
      ...song.tracks,
      sample: {
        ...song.tracks.sample,
        steps: nextSteps,
      },
    },
  };
}

export function serializeMelodicTrackArrangement(track: MelodicTrack) {
  return getMelodicArrangementEntries(track)
    .map((entry) => {
      const normalizedDuty = entry.duty ?? DEFAULT_PULSE_DUTY;
      const dutySuffix =
        track.kind === "pulse" && normalizedDuty !== DEFAULT_PULSE_DUTY
          ? ` @${formatPulseDutyLabel(normalizedDuty)}`
          : "";

      if (entry.length === 1) {
        return `${entry.stepIndex + 1}: ${entry.note}${dutySuffix}`;
      }

      return `${entry.stepIndex + 1}-${entry.stepIndex + entry.length}: ${entry.note}${dutySuffix}`;
    })
    .join("\n");
}

export function serializeNoiseTrackArrangement(track: NoiseTrack) {
  return track.steps
    .flatMap((step, index) => {
      if (!step.enabled) {
        return [];
      }

      return `${index + 1}: ${formatNoiseConfigLabel(step.mode, step.periodIndex)}`;
    })
    .join("\n");
}

export function serializeSampleTrackArrangement(
  track: SampleTrack,
  engineMode: SongDocument["meta"]["engineMode"],
) {
  return track.steps
    .flatMap((step, index) => {
      if (!step.enabled || step.sampleId === null) {
        return [];
      }

      return engineMode === "inspired"
        ? `${index + 1}: ${step.sampleId}>${step.note}`
        : `${index + 1}: ${step.sampleId}@${formatSamplePlaybackRate(step.playbackRate)}`;
    })
    .join("\n");
}

export function parseMelodicTrackArrangement(
  input: string,
  loopLength: number,
  trackId: MelodicTrackId,
): ParseMelodicArrangementResult {
  const lines = splitArrangementLines(input);
  const entriesByStep = new Map<number, MelodicArrangementEntry>();
  const supportsPulseDuty = trackId === "pulse1" || trackId === "pulse2";

  for (const [lineIndex, line] of lines.entries()) {
    const parsedLine = parseMelodicArrangementLine(line, lineIndex);

    if (!parsedLine.ok) {
      return parsedLine;
    }

    const parsedValue = parseMelodicArrangementValue(parsedLine.value, supportsPulseDuty);

    if (!parsedValue.ok) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} ${parsedValue.error}`,
      };
    }

    if (parsedLine.stepNumber > loopLength) {
      continue;
    }

    const finalEndStep = Math.min(parsedLine.endStepNumber ?? parsedLine.stepNumber, loopLength);

    entriesByStep.set(parsedLine.stepNumber - 1, {
      stepIndex: parsedLine.stepNumber - 1,
      note: parsedValue.note,
      length: finalEndStep - parsedLine.stepNumber + 1,
      ...(parsedValue.duty === undefined ? {} : { duty: parsedValue.duty }),
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
  const entriesByStep = new Map<number, NoiseArrangementEntry>();

  for (const [lineIndex, line] of lines.entries()) {
    const parsedLine = parseArrangementLine(line, lineIndex);

    if (!parsedLine.ok) {
      return parsedLine;
    }

    const parsedTrigger = parseNoiseTriggerDescriptor(parsedLine.value);

    if (!parsedTrigger.ok) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} ${parsedTrigger.error}`,
      };
    }

    if (parsedLine.stepNumber > loopLength) {
      continue;
    }

    entriesByStep.set(parsedLine.stepNumber - 1, {
      stepIndex: parsedLine.stepNumber - 1,
      mode: parsedTrigger.mode,
      periodIndex: parsedTrigger.periodIndex,
    });
  }

  return {
    ok: true,
    entries: Array.from(entriesByStep.values()).sort(
      (left: NoiseArrangementEntry, right: NoiseArrangementEntry) => left.stepIndex - right.stepIndex,
    ),
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
      note: parsedTrigger.note ?? (sample.baseNote as NoteValue),
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
  const entriesByStep = new Map(entries.map((entry) => [entry.stepIndex, entry]));

  return {
    ...song,
    tracks: {
      ...song.tracks,
      noise: {
        ...song.tracks.noise,
        steps: song.tracks.noise.steps.map((step, index) => {
          const entry = entriesByStep.get(index);

          return {
            ...step,
            enabled: entry !== undefined,
            mode: entry?.mode ?? step.mode,
            periodIndex: entry?.periodIndex ?? step.periodIndex,
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
            note: entry?.note ?? step.note,
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
  engineMode: SongDocument["meta"]["engineMode"],
) {
  if (!step.enabled) {
    return "·";
  }

  const sample = step.sampleId === null ? null : samples.find((entry) => entry.id === step.sampleId) ?? null;

  if (sample === null) {
    return "none";
  }

  return engineMode === "inspired" ? `${sample.name} ${step.note}` : `${sample.name} ${formatPlaybackRateLabel(step.playbackRate)}`;
}

export function getDefaultSampleTrigger(
  samples: readonly SerializedSampleAsset[],
  preferredSampleId?: string | null,
): Pick<SampleTrack["steps"][number], "sampleId" | "note" | "playbackRate"> {
  const preferredSample =
    preferredSampleId === undefined || preferredSampleId === null
      ? null
      : samples.find((sample) => sample.id === preferredSampleId) ?? null;

  return {
    sampleId: preferredSample?.id ?? samples.at(-1)?.id ?? null,
    note: (preferredSample?.baseNote ?? "C4") as NoteValue,
    playbackRate: defaultSamplePlaybackRate,
  };
}

export function formatPlaybackRateLabel(playbackRate: number) {
  return `${formatSamplePlaybackRate(playbackRate)}x`;
}

export function formatNoiseConfigLabel(
  mode: NoiseTrack["steps"][number]["mode"],
  periodIndex: NoiseTrack["steps"][number]["periodIndex"],
) {
  return `${mode} P${periodIndex}`;
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
    return applyStepVolumeUpdate(
      stepIndex,
      updates.volume,
      applyPulseDutyUpdate(track, stepIndex, updates.duty, buildMelodicTrack(track, nextEntries)),
    );
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

    return applyStepVolumeUpdate(
      stepIndex,
      updates.volume,
      applyPulseDutyUpdate(track, stepIndex, updates.duty, buildMelodicTrack(track, nextEntries)),
    );
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

  return applyStepVolumeUpdate(
    stepIndex,
    updates.volume,
    applyPulseDutyUpdate(track, stepIndex, updates.duty, buildMelodicTrack(track, nextEntries)),
  );
}

function buildMelodicTrack<TTrack extends MelodicTrack>(
  track: TTrack,
  entries: readonly (MelodicArrangementEntry | MelodicTrackEntryWithVolume)[],
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
      ...("volume" in entry ? { volume: entry.volume } : {}),
      ...(track.kind === "pulse" ? { duty: entry.duty ?? DEFAULT_PULSE_DUTY } : {}),
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

function applyStepVolumeUpdate<TTrack extends MelodicTrack>(
  stepIndex: number,
  volume: number | undefined,
  track: TTrack,
): TTrack {
  if (volume === undefined) {
    return track;
  }

  return {
    ...track,
    steps: track.steps.map((entry, index) =>
      index === stepIndex ? { ...entry, volume } : entry,
    ),
  };
}

function buildNoiseTrack(track: NoiseTrack, entries: readonly NoiseTrackEntryWithVolume[]): NoiseTrack {
  const entriesByStepIndex = new Map(entries.map((entry) => [entry.stepIndex, entry]));

  return {
    ...track,
    steps: track.steps.map((step, index) => {
      const entry = entriesByStepIndex.get(index);

      if (entry === undefined) {
        return {
          ...step,
          enabled: false,
        };
      }

      return {
        ...step,
        enabled: true,
        mode: entry.mode,
        periodIndex: entry.periodIndex,
        volume: entry.volume,
      };
    }),
  };
}

function buildSampleTrack(track: SampleTrack, entries: readonly SampleTrackEntryWithVolume[]): SampleTrack {
  const entriesByStepIndex = new Map(entries.map((entry) => [entry.stepIndex, entry]));

  return {
    ...track,
    steps: track.steps.map((step, index) => {
      const entry = entriesByStepIndex.get(index);

      if (entry === undefined) {
        return {
          ...step,
          enabled: false,
          sampleId: null,
        };
      }

      return {
        ...step,
        enabled: true,
        sampleId: entry.sampleId,
        note: entry.note,
        playbackRate: entry.playbackRate,
        volume: entry.volume,
      };
    }),
  };
}

function replaceMelodicTrack<TTrack extends MelodicTrackId>(trackId: TTrack, song: SongDocument, nextTrack: SongDocument["tracks"][TTrack]) {
  return {
    ...song,
    tracks: {
      ...song.tracks,
      [trackId]: nextTrack,
    },
  };
}

function selectEntriesByStepIndex<TEntry extends { stepIndex: number }>(
  entries: readonly TEntry[],
  selectedStepIndexes: number[],
): TEntry[] | null {
  if (selectedStepIndexes.length === 0) {
    return null;
  }

  const normalizedIndexes = Array.from(new Set(selectedStepIndexes)).sort((left, right) => left - right);

  if (normalizedIndexes.length !== selectedStepIndexes.length) {
    return null;
  }

  const entriesByStepIndex = new Map(entries.map((entry) => [entry.stepIndex, entry]));
  const selectedEntries = normalizedIndexes.map((stepIndex) => entriesByStepIndex.get(stepIndex) ?? null);

  if (selectedEntries.some((entry) => entry === null)) {
    return null;
  }

  return selectedEntries as TEntry[];
}

function areMovedMelodicEntriesValid(
  movedEntries: readonly MelodicTrackEntryWithVolume[],
  untouchedEntries: readonly MelodicTrackEntryWithVolume[],
  loopLength: number,
) {
  const normalizedMovedEntries = [...movedEntries].sort((left, right) => left.stepIndex - right.stepIndex);

  if (
    normalizedMovedEntries.some(
      (entry) => entry.stepIndex < 0 || entry.stepIndex >= loopLength || entry.stepIndex + entry.length > loopLength,
    )
  ) {
    return false;
  }

  return !hasMelodicOverlap([...untouchedEntries, ...normalizedMovedEntries]);
}

function areMovedTriggerEntriesValid<TEntry extends { stepIndex: number }>(
  movedEntries: readonly TEntry[],
  untouchedEntries: readonly TEntry[],
  loopLength: number,
) {
  const allEntries = [...untouchedEntries, ...movedEntries];

  if (movedEntries.some((entry) => entry.stepIndex < 0 || entry.stepIndex >= loopLength)) {
    return false;
  }

  return new Set(allEntries.map((entry) => entry.stepIndex)).size === allEntries.length;
}

function hasMelodicOverlap(entries: readonly Pick<MelodicTrackEntryWithVolume, "stepIndex" | "length">[]) {
  const sortedEntries = [...entries].sort((left, right) => left.stepIndex - right.stepIndex);

  for (let index = 0; index < sortedEntries.length - 1; index += 1) {
    const currentEntry = sortedEntries[index];
    const nextEntry = sortedEntries[index + 1];

    if (currentEntry === undefined || nextEntry === undefined) {
      continue;
    }

    if (currentEntry.stepIndex + currentEntry.length > nextEntry.stepIndex) {
      return true;
    }
  }

  return false;
}

function normalizeArrangementNote(rawNote: string): NoteValue | null {
  const match = arrangementNotePattern.exec(rawNote.trim());

  if (match === null) {
    return null;
  }

  const normalizedNote = `${match[1].toUpperCase()}${match[2]}${match[3]}` as NoteValue;
  return supportedNoteSet.has(normalizedNote) ? normalizedNote : null;
}

function parseMelodicArrangementValue(
  rawValue: string,
  supportsPulseDuty: boolean,
):
  | {
      ok: true;
      note: NoteValue;
      duty?: PulseDutyValue;
    }
  | {
      ok: false;
      error: string;
    } {
  const segments = rawValue.split("@");

  if (segments.length > 2) {
    return {
      ok: false,
      error: 'must use at most one "@" duty suffix, for example "1: E4 @25%".',
    };
  }

  const note = normalizeArrangementNote(segments[0]?.trim() ?? "");

  if (note === null) {
    return {
      ok: false,
      error: "has an unsupported note. Use notes from C0 to B8 with optional sharps.",
    };
  }

  const rawDuty = segments[1]?.trim();

  if (rawDuty === undefined) {
    return {
      ok: true,
      note,
    };
  }

  if (!supportsPulseDuty) {
    return {
      ok: false,
      error: "includes a pulse duty suffix, but this track only accepts notes.",
    };
  }

  const duty = normalizePulseDutyValue(rawDuty);

  if (duty === null) {
    return {
      ok: false,
      error: "has an unsupported pulse duty. Use 12.5%, 25%, 50%, or 75%.",
    };
  }

  return {
    ok: true,
    note,
    duty,
  };
}

function normalizePulseDutyValue(rawValue: string): PulseDutyValue | null {
  const match = pulseDutyPattern.exec(rawValue.trim());

  if (match === null) {
    return null;
  }

  switch (match[1]) {
    case "12.5":
      return 0.125;
    case "25":
      return 0.25;
    case "50":
      return 0.5;
    case "75":
      return 0.75;
    default:
      return null;
  }
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
): { ok: true; sampleReference: string; note: NoteValue | null; playbackRate: number } | { ok: false; error: string } {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return {
      ok: false,
      error: 'must include a sample reference like "mic-001@1x" or "mic-001>C5".',
    };
  }

  let sampleReference = trimmedValue;
  let note: NoteValue | null = null;
  let playbackRate = defaultSamplePlaybackRate;
  const rateSeparatorIndex = trimmedValue.lastIndexOf("@");
  const noteSeparatorIndex = trimmedValue.lastIndexOf(">");

  if (rateSeparatorIndex > 0 && noteSeparatorIndex > 0) {
    return {
      ok: false,
      error: 'must use either a "@" playback-rate suffix or a ">" note suffix, not both.',
    };
  }

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
  } else if (noteSeparatorIndex > 0) {
    const nextSampleReference = trimmedValue.slice(0, noteSeparatorIndex).trim();
    const noteToken = trimmedValue.slice(noteSeparatorIndex + 1).trim();

    if (nextSampleReference.length === 0) {
      return {
        ok: false,
        error: 'must include a sample reference before the ">" symbol.',
      };
    }

    const parsedNote = normalizeArrangementNote(noteToken);

    if (parsedNote === null) {
      return {
        ok: false,
        error: 'has an invalid target note. Use notes from C0 to B8 with optional sharps, for example "C5" or "A#2".',
      };
    }

    sampleReference = nextSampleReference;
    note = parsedNote;
  }

  return {
    ok: true,
    sampleReference,
    note,
    playbackRate,
  };
}

function parseNoiseTriggerDescriptor(
  value: string,
):
  | {
      ok: true;
      mode: NoiseTrack["steps"][number]["mode"];
      periodIndex: NoiseTrack["steps"][number]["periodIndex"];
    }
  | {
      ok: false;
      error: string;
    } {
  const presetId = normalizeNoiseTriggerPresetId(value);

  if (presetId !== null) {
    const preset = getNoiseTriggerPresetById(presetId);

    if (preset !== null) {
      return {
        ok: true,
        mode: preset.mode,
        periodIndex: preset.periodIndex,
      };
    }
  }

  const match = /^(long|short)\s+p(\d{1,2})$/i.exec(value.trim());

  if (match === null) {
    return {
      ok: false,
      error: `has an invalid noise trigger. Use "short P3", "long P12", or a preset id: ${noiseTriggerPresets.map((preset) => preset.id).join(", ")}.`,
    };
  }

  const periodIndex = Number(match[2]);

  if (!Number.isInteger(periodIndex) || periodIndex < 0 || periodIndex > 15) {
    return {
      ok: false,
      error: 'has an unsupported noise period. Use "P0" through "P15".',
    };
  }

  return {
    ok: true,
    mode: match[1].toLowerCase() as NoiseTrack["steps"][number]["mode"],
    periodIndex,
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
