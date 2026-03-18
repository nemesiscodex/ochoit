import { z } from "zod";

export const SONG_DOCUMENT_KIND = "ochoit-song";
export const SONG_DOCUMENT_VERSION = 1 as const;
export const SONG_STORAGE_KEY = `ochoit.song.v${SONG_DOCUMENT_VERSION}`;

export const trackOrder = ["pulse1", "pulse2", "triangle", "noise", "sample"] as const;

const noteSchema = z.string().regex(/^[A-G](?:#|b)?[0-8]$/, "Expected a note like C4 or F#3.");
const levelSchema = z.number().min(0).max(1);
const pulseDutySchema = z.union([
  z.literal(0.125),
  z.literal(0.25),
  z.literal(0.5),
  z.literal(0.75),
]);
const loopLengthSchema = z.number().int().min(8).max(64).multipleOf(4);
const trackSettingsSchema = z.object({
  muted: z.boolean(),
  solo: z.boolean(),
  volume: levelSchema,
});

const pulseStepSchema = z.object({
  enabled: z.boolean(),
  note: noteSchema,
  volume: levelSchema,
  duty: pulseDutySchema,
});

const triangleStepSchema = z.object({
  enabled: z.boolean(),
  note: noteSchema,
  volume: levelSchema,
});

const noiseStepSchema = z.object({
  enabled: z.boolean(),
  volume: levelSchema,
  mode: z.enum(["long", "short"]),
  periodIndex: z.number().int().min(0).max(15),
});

const sampleStepSchema = z.object({
  enabled: z.boolean(),
  volume: levelSchema,
  sampleId: z.string().min(1).nullable(),
  playbackRate: z.number().min(0.25).max(4),
});

const pulseTrackSchema = z.object({
  id: z.enum(["pulse1", "pulse2"]),
  kind: z.literal("pulse"),
  label: z.string().min(1),
  ...trackSettingsSchema.shape,
  steps: z.array(pulseStepSchema).min(8).max(64),
});

const triangleTrackSchema = z.object({
  id: z.literal("triangle"),
  kind: z.literal("triangle"),
  label: z.string().min(1),
  ...trackSettingsSchema.shape,
  steps: z.array(triangleStepSchema).min(8).max(64),
});

const noiseTrackSchema = z.object({
  id: z.literal("noise"),
  kind: z.literal("noise"),
  label: z.string().min(1),
  ...trackSettingsSchema.shape,
  steps: z.array(noiseStepSchema).min(8).max(64),
});

const sampleTrackSchema = z.object({
  id: z.literal("sample"),
  kind: z.literal("sample"),
  label: z.string().min(1),
  ...trackSettingsSchema.shape,
  steps: z.array(sampleStepSchema).min(8).max(64),
});

const serializedSampleAssetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    source: z.enum(["mic", "import"]),
    sampleRate: z.number().int().positive(),
    frameCount: z.number().int().nonnegative(),
    channels: z.literal(1),
    trim: z.object({
      startFrame: z.number().int().nonnegative(),
      endFrame: z.number().int().nonnegative(),
    }),
    // Stored as plain JSON numbers so localStorage persistence does not need a binary format yet.
    pcm: z.array(z.number().min(-1).max(1)),
  })
  .superRefine((sample, ctx) => {
    if (sample.trim.endFrame < sample.trim.startFrame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sample trim end must be greater than or equal to the trim start.",
        path: ["trim", "endFrame"],
      });
    }

    if (sample.trim.endFrame > sample.frameCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sample trim end cannot exceed the sample frame count.",
        path: ["trim", "endFrame"],
      });
    }
  });

export const songDocumentSchema = z
  .object({
    kind: z.literal(SONG_DOCUMENT_KIND),
    version: z.literal(SONG_DOCUMENT_VERSION),
    meta: z.object({
      name: z.string().min(1).max(80),
      author: z.string().min(1).max(80),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      engineMode: z.enum(["inspired", "authentic"]),
    }),
    transport: z.object({
      bpm: z.number().int().min(40).max(240),
      stepsPerBeat: z.number().int().min(1).max(8),
      loopLength: loopLengthSchema,
    }),
    mixer: z.object({
      masterVolume: levelSchema,
    }),
    tracks: z.object({
      pulse1: pulseTrackSchema,
      pulse2: pulseTrackSchema,
      triangle: triangleTrackSchema,
      noise: noiseTrackSchema,
      sample: sampleTrackSchema,
    }),
    samples: z.array(serializedSampleAssetSchema),
  })
  .superRefine((song, ctx) => {
    const expectedLength = song.transport.loopLength;
    const tracks = getOrderedTracks(song);

    tracks.forEach((track) => {
      if (track.steps.length !== expectedLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Track "${track.id}" must contain exactly ${expectedLength} steps.`,
          path: ["tracks", track.id, "steps"],
        });
      }
    });

    if (song.tracks.pulse1.id !== "pulse1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The "pulse1" track key must contain the pulse1 track.',
        path: ["tracks", "pulse1", "id"],
      });
    }

    if (song.tracks.pulse2.id !== "pulse2") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The "pulse2" track key must contain the pulse2 track.',
        path: ["tracks", "pulse2", "id"],
      });
    }

    const sampleIds = new Set(song.samples.map((sample) => sample.id));
    song.tracks.sample.steps.forEach((step, index) => {
      if (!step.enabled || step.sampleId === null) {
        return;
      }

      if (!sampleIds.has(step.sampleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sample trigger at step ${index + 1} references an unknown sample asset.`,
          path: ["tracks", "sample", "steps", index, "sampleId"],
        });
      }
    });
  });

export type SongDocument = z.infer<typeof songDocumentSchema>;
export type TrackId = (typeof trackOrder)[number];
export type Track = SongDocument["tracks"][TrackId];
export type Step = Track["steps"][number];
export type PulseTrack = Extract<Track, { kind: "pulse" }>;
export type SerializedSampleAsset = z.infer<typeof serializedSampleAssetSchema>;

const baseTimestamp = "2026-03-18T00:00:00.000Z";
const defaultLoopLength = 16;

function createPulseSteps(pattern: Array<{ index: number; note: string; duty?: z.infer<typeof pulseDutySchema> }>) {
  const seededSteps = new Map(pattern.map((entry) => [entry.index, entry]));

  return Array.from({ length: defaultLoopLength }, (_, index) => {
    const step = seededSteps.get(index);

    return {
      enabled: step !== undefined,
      note: step?.note ?? "C4",
      volume: 0.84,
      duty: step?.duty ?? 0.5,
    };
  });
}

function createTriangleSteps(pattern: Array<{ index: number; note: string }>) {
  const seededSteps = new Map(pattern.map((entry) => [entry.index, entry]));

  return Array.from({ length: defaultLoopLength }, (_, index) => {
    const step = seededSteps.get(index);

    return {
      enabled: step !== undefined,
      note: step?.note ?? "C3",
      volume: 0.72,
    };
  });
}

function createNoiseSteps(pattern: number[]) {
  const seededSteps = new Set(pattern);

  return Array.from({ length: defaultLoopLength }, (_, index) => ({
    enabled: seededSteps.has(index),
    volume: index % 4 === 0 ? 0.82 : 0.58,
    mode: index % 4 === 0 ? "short" : "long",
    periodIndex: index % 4 === 0 ? 3 : 8,
  }));
}

function createSampleSteps(pattern: number[]) {
  const seededSteps = new Set(pattern);

  return Array.from({ length: defaultLoopLength }, (_, index) => ({
    enabled: seededSteps.has(index),
    volume: 0.8,
    sampleId: seededSteps.has(index) ? "mic-001" : null,
    playbackRate: 1,
  }));
}

export function createDefaultSongDocument(): SongDocument {
  return songDocumentSchema.parse({
    kind: SONG_DOCUMENT_KIND,
    version: SONG_DOCUMENT_VERSION,
    meta: {
      name: "Castle Loop",
      author: "Julio",
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
      engineMode: "inspired",
    },
    transport: {
      bpm: 136,
      stepsPerBeat: 4,
      loopLength: defaultLoopLength,
    },
    mixer: {
      masterVolume: 0.88,
    },
    tracks: {
      pulse1: {
        id: "pulse1",
        kind: "pulse",
        label: "Voice 1",
        muted: false,
        solo: false,
        volume: 0.84,
        steps: createPulseSteps([
          { index: 0, note: "C5", duty: 0.125 },
          { index: 4, note: "E5", duty: 0.25 },
          { index: 8, note: "G5", duty: 0.5 },
          { index: 12, note: "E5", duty: 0.25 },
        ]),
      },
      pulse2: {
        id: "pulse2",
        kind: "pulse",
        label: "Voice 2",
        muted: false,
        solo: false,
        volume: 0.76,
        steps: createPulseSteps([
          { index: 2, note: "C4", duty: 0.5 },
          { index: 6, note: "G4", duty: 0.75 },
          { index: 10, note: "A4", duty: 0.5 },
          { index: 14, note: "G4", duty: 0.75 },
        ]),
      },
      triangle: {
        id: "triangle",
        kind: "triangle",
        label: "Voice 3",
        muted: false,
        solo: false,
        volume: 0.78,
        steps: createTriangleSteps([
          { index: 0, note: "C3" },
          { index: 4, note: "C3" },
          { index: 8, note: "G2" },
          { index: 12, note: "G2" },
        ]),
      },
      noise: {
        id: "noise",
        kind: "noise",
        label: "Voice 4",
        muted: false,
        solo: false,
        volume: 0.68,
        steps: createNoiseSteps([0, 2, 4, 6, 8, 10, 12, 14]),
      },
      sample: {
        id: "sample",
        kind: "sample",
        label: "Voice 5",
        muted: false,
        solo: false,
        volume: 0.74,
        steps: createSampleSteps([7, 15]),
      },
    },
    samples: [
      {
        id: "mic-001",
        name: "vox-hit",
        source: "mic",
        sampleRate: 11025,
        frameCount: 12,
        channels: 1,
        trim: {
          startFrame: 0,
          endFrame: 12,
        },
        pcm: [0, 0.22, 0.72, 0.18, -0.2, -0.56, -0.14, 0.1, 0.34, 0.12, -0.08, 0],
      },
    ],
  });
}

export function getOrderedTracks(song: SongDocument): Track[] {
  return trackOrder.map((trackId) => song.tracks[trackId]);
}

export function parseSongDocument(input: unknown): SongDocument {
  return songDocumentSchema.parse(input);
}
