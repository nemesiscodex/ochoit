import type { SerializedSampleAsset, SongDocument } from "@/features/song/song-document";

export type SampleTrimUpdate = {
  endFrame?: number;
  startFrame?: number;
};

function clampFrame(frame: number, frameCount: number) {
  if (!Number.isFinite(frame)) {
    return 0;
  }

  return Math.max(0, Math.min(frameCount, Math.round(frame)));
}

export function getTrimmedFrameCount(sample: SerializedSampleAsset) {
  return Math.max(0, sample.trim.endFrame - sample.trim.startFrame);
}

export function getTrimmedSamplePcm(sample: SerializedSampleAsset) {
  return sample.pcm.slice(sample.trim.startFrame, sample.trim.endFrame);
}

export function moveSampleTrimWindow(song: SongDocument, sampleId: string, startFrame: number) {
  const sample = song.samples.find((entry) => entry.id === sampleId);

  if (sample === undefined) {
    return song;
  }

  const trimmedFrameCount = getTrimmedFrameCount(sample);
  const maxStartFrame = Math.max(0, sample.frameCount - trimmedFrameCount);
  const nextStartFrame = clampFrame(startFrame, maxStartFrame);

  return updateSampleTrim(song, sampleId, {
    startFrame: nextStartFrame,
    endFrame: nextStartFrame + trimmedFrameCount,
  });
}

export function resizeSampleTrimWindow(song: SongDocument, sampleId: string, frameCount: number) {
  const sample = song.samples.find((entry) => entry.id === sampleId);

  if (sample === undefined) {
    return song;
  }

  const nextFrameCount = clampFrame(frameCount, sample.frameCount);
  const maxStartFrame = Math.max(0, sample.frameCount - nextFrameCount);
  const nextStartFrame = Math.min(sample.trim.startFrame, maxStartFrame);

  return updateSampleTrim(song, sampleId, {
    startFrame: nextStartFrame,
    endFrame: nextStartFrame + nextFrameCount,
  });
}

export function updateSampleTrim(song: SongDocument, sampleId: string, updates: SampleTrimUpdate) {
  const sample = song.samples.find((entry) => entry.id === sampleId);

  if (sample === undefined) {
    return song;
  }

  const requestedStartFrame =
    updates.startFrame === undefined ? sample.trim.startFrame : clampFrame(updates.startFrame, sample.frameCount);
  const requestedEndFrame =
    updates.endFrame === undefined ? sample.trim.endFrame : clampFrame(updates.endFrame, sample.frameCount);
  const startFrame =
    updates.startFrame === undefined
      ? sample.trim.startFrame
      : Math.min(requestedStartFrame, updates.endFrame === undefined ? sample.trim.endFrame : requestedEndFrame);
  const endFrame =
    updates.endFrame === undefined
      ? sample.trim.endFrame
      : Math.max(requestedEndFrame, updates.startFrame === undefined ? sample.trim.startFrame : startFrame);

  if (startFrame === sample.trim.startFrame && endFrame === sample.trim.endFrame) {
    return song;
  }

  return {
    ...song,
    meta: {
      ...song.meta,
      updatedAt: new Date().toISOString(),
    },
    samples: song.samples.map((entry) =>
      entry.id !== sampleId
        ? entry
        : {
            ...entry,
            trim: {
              startFrame,
              endFrame,
            },
          },
    ),
  };
}

export function removeSampleAsset(song: SongDocument, sampleId: string) {
  if (!song.samples.some((sample) => sample.id === sampleId)) {
    return song;
  }

  return {
    ...song,
    meta: {
      ...song.meta,
      updatedAt: new Date().toISOString(),
    },
    tracks: {
      ...song.tracks,
      sample: {
        ...song.tracks.sample,
        steps: song.tracks.sample.steps.map((step) =>
          step.sampleId !== sampleId
            ? step
            : {
                ...step,
                enabled: false,
                sampleId: null,
              },
        ),
      },
    },
    samples: song.samples.filter((sample) => sample.id !== sampleId),
  };
}
