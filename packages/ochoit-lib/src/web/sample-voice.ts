import { encodeSampleToDpcm, normalizeDpcmRate } from "../core/dpcm";
import { getFrequencyForNote } from "../core/note-frequency";
import type { SampleTrack, SerializedSampleAsset, SongDocument } from "../core/song-document";

const noteAttackSeconds = 0.001;
const noteReleaseSeconds = 0.012;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;

function getFrameRange(sample: SerializedSampleAsset) {
  const startFrame = Math.min(sample.trim.startFrame, sample.pcm.length);
  const endFrame = Math.min(Math.max(sample.trim.endFrame, startFrame), sample.pcm.length);

  return {
    startFrame,
    endFrame,
    frameCount: Math.max(1, endFrame - startFrame),
  };
}

function getSampleCacheKey(sample: SerializedSampleAsset, dpcmRate: number | null) {
  return `${sample.id}:${sample.sampleRate}:${sample.trim.startFrame}:${sample.trim.endFrame}:${sample.frameCount}:${sample.pcm.length}:${dpcmRate ?? "pcm"}`;
}

export class SampleVoice {
  private track: SampleTrack | null = null;
  private sampleById = new Map<string, SerializedSampleAsset>();
  private engineMode: SongDocument["meta"]["engineMode"] = "inspired";
  private readonly bufferByCacheKey = new Map<string, AudioBuffer>();

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  configure(
    track: SampleTrack,
    samples: SerializedSampleAsset[],
    engineMode: SongDocument["meta"]["engineMode"],
  ) {
    this.track = track;
    this.sampleById = new Map(samples.map((sample) => [sample.id, sample]));
    this.engineMode = engineMode;
    this.bufferByCacheKey.clear();
  }

  scheduleStep(stepIndex: number, time: number) {
    if (this.track === null || this.track.muted) {
      return;
    }

    const step = this.track.steps[stepIndex];

    if (step === undefined || !step.enabled || step.sampleId === null) {
      return;
    }

    const sample = this.sampleById.get(step.sampleId);

    if (sample === undefined) {
      return;
    }

    this.playSample(sample, {
      playbackRate: this.getPlaybackRate(step, sample),
      time,
      volume: step.volume,
    });
  }

  previewSample(sampleId: string, playbackRate = 1, durationMs = 250, volume = 0.8) {
    const sample = this.sampleById.get(sampleId);

    if (sample === undefined) {
      return;
    }

    this.playSample(sample, {
      playbackRate,
      maxDurationSeconds: durationMs / 1000,
      time: this.context.currentTime,
      volume,
    });
  }

  private getSampleBuffer(sample: SerializedSampleAsset, playbackRate: number) {
    const dpcmRate = this.engineMode === "authentic" ? normalizeDpcmRate(playbackRate) : null;
    const cacheKey = getSampleCacheKey(sample, dpcmRate);
    const cachedBuffer = this.bufferByCacheKey.get(cacheKey);

    if (cachedBuffer !== undefined) {
      return cachedBuffer;
    }

    const { startFrame, endFrame, frameCount } = getFrameRange(sample);
    const pcmSlice = sample.pcm.slice(startFrame, endFrame);

    if (this.engineMode === "authentic") {
      const dpcmSample = encodeSampleToDpcm(pcmSlice, sample.sampleRate, playbackRate);
      const dpcmBuffer = this.context.createBuffer(1, dpcmSample.decodedPcm.length, dpcmSample.sampleRate);
      dpcmBuffer.getChannelData(0).set(dpcmSample.decodedPcm);
      this.bufferByCacheKey.set(cacheKey, dpcmBuffer);
      return dpcmBuffer;
    }

    const buffer = this.context.createBuffer(1, frameCount, sample.sampleRate);
    const channel = buffer.getChannelData(0);

    if (pcmSlice.length === 0) {
      channel[0] = 0;
    } else {
      channel.set(pcmSlice);
    }

    this.bufferByCacheKey.set(cacheKey, buffer);
    return buffer;
  }

  private playSample(
    sample: SerializedSampleAsset,
    options: {
      playbackRate: number;
      time: number;
      volume: number;
      maxDurationSeconds?: number;
    },
  ) {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const buffer = this.getSampleBuffer(sample, options.playbackRate);
    const resolvedPlaybackRate = this.engineMode === "authentic" ? 1 : options.playbackRate;
    const naturalDuration = buffer.duration / resolvedPlaybackRate;
    const sampleDuration =
      options.maxDurationSeconds === undefined
        ? naturalDuration
        : Math.min(naturalDuration, Math.max(options.maxDurationSeconds, noteAttackSeconds));
    const sampleEndTime = options.time + sampleDuration;
    const releaseStartTime = Math.max(options.time + noteAttackSeconds, sampleEndTime - noteReleaseSeconds);

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(resolvedPlaybackRate, options.time);

    gain.gain.cancelScheduledValues(options.time);
    gain.gain.setValueAtTime(0, options.time);
    gain.gain.linearRampToValueAtTime(options.volume, options.time + noteAttackSeconds);
    gain.gain.setValueAtTime(options.volume, releaseStartTime);
    gain.gain.linearRampToValueAtTime(silentGainFloor, sampleEndTime);

    source.connect(gain);
    gain.connect(this.output);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };

    source.start(options.time);
    source.stop(sampleEndTime + sourceStopPaddingSeconds);
  }

  private getPlaybackRate(step: SampleTrack["steps"][number], sample: SerializedSampleAsset) {
    if (this.engineMode === "authentic") {
      return step.playbackRate;
    }

    return getFrequencyForNote(step.note) / getFrequencyForNote(sample.baseNote);
  }
}
