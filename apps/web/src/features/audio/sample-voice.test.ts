import { describe, expect, it, vi } from "vitest";

import { SampleVoice } from "@/features/audio/sample-voice";
import { createDefaultSongDocument } from "@/features/song/song-document";

class MockAudioParam {
  value = 1;
  readonly cancelScheduledValues = vi.fn<(time: number) => void>();
  readonly setValueAtTime = vi.fn<(value: number, time: number) => void>();
  readonly linearRampToValueAtTime = vi.fn<(value: number, time: number) => void>();
}

class MockAudioBuffer {
  readonly data: Float32Array;
  readonly duration: number;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
    this.duration = length / sampleRate;
  }

  getChannelData(channel: number) {
    if (channel !== 0) {
      throw new Error("Only mono buffers are supported in the test mock.");
    }

    return this.data;
  }
}

class MockGainNode {
  readonly gain = new MockAudioParam();
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();
}

class MockAudioBufferSourceNode {
  buffer: MockAudioBuffer | null = null;
  onended: (() => void) | null = null;
  readonly playbackRate = new MockAudioParam();
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();
  readonly start = vi.fn<(when?: number) => void>();
  readonly stop = vi.fn<(when?: number) => void>();
}

function createMockAudioContext() {
  const output = new MockGainNode();
  const createdBuffers: MockAudioBuffer[] = [];
  const createdGains: MockGainNode[] = [];
  const createdSources: MockAudioBufferSourceNode[] = [];

  const context = {
    createBuffer: vi.fn((numberOfChannels: number, length: number, sampleRate: number) => {
      const buffer = new MockAudioBuffer(numberOfChannels, length, sampleRate);
      createdBuffers.push(buffer);
      return buffer;
    }),
    createBufferSource: vi.fn(() => {
      const source = new MockAudioBufferSourceNode();
      createdSources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gain = new MockGainNode();
      createdGains.push(gain);
      return gain;
    }),
  };

  return {
    context: context as unknown as AudioContext,
    output: output as unknown as AudioNode,
    createdBuffers,
    createdGains,
    createdSources,
  };
}

describe("sample-voice", () => {
  it("schedules a trimmed sample step with cached buffers", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers, createdGains, createdSources } = createMockAudioContext();
    const voice = new SampleVoice(context, output);
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected seeded sample asset.");
    }

    const trimmedSong = {
      ...song,
      samples: [
        {
          ...sample,
          trim: {
            startFrame: 2,
            endFrame: 8,
          },
        },
      ],
      tracks: {
        ...song.tracks,
        sample: {
          ...song.tracks.sample,
          steps: song.tracks.sample.steps.map((step, index) =>
            index === 7
              ? {
                  ...step,
                  enabled: true,
                  sampleId: sample.id,
                  playbackRate: 2,
                  volume: 0.65,
                }
              : step,
          ),
        },
      },
    };

    voice.configure(trimmedSong.tracks.sample, trimmedSong.samples);
    voice.scheduleStep(7, 3);
    voice.scheduleStep(15, 4);

    expect(createdBuffers).toHaveLength(1);
    expect(createdSources).toHaveLength(2);
    expect(createdGains).toHaveLength(2);
    const trimmedData = Array.from(createdBuffers[0]?.data ?? []);
    const expectedTrimmedData = sample.pcm.slice(2, 8);

    expect(trimmedData).toHaveLength(expectedTrimmedData.length);
    trimmedData.forEach((value, index) => {
      expect(value).toBeCloseTo(expectedTrimmedData[index] ?? 0, 6);
    });

    const firstSource = createdSources[0];
    const firstGain = createdGains[0];
    const expectedStopTime = 3 + 6 / sample.sampleRate / 2 + 0.01;

    expect(firstSource?.buffer).toBe(createdBuffers[0]);
    expect(firstSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(2, 3);
    expect(firstGain?.gain.cancelScheduledValues).toHaveBeenCalledWith(3);
    expect(firstGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 3);
    expect(firstGain?.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.65, 3.001);
    expect(firstSource?.start).toHaveBeenCalledWith(3);
    expect(firstSource?.stop).toHaveBeenCalledWith(expectedStopTime);

    firstSource?.onended?.();

    expect(firstSource?.disconnect).toHaveBeenCalledTimes(1);
    expect(firstGain?.disconnect).toHaveBeenCalledTimes(1);
    expect(context.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("ignores muted, disabled, null, or missing sample references", () => {
    const song = createDefaultSongDocument();
    const { context, output } = createMockAudioContext();
    const voice = new SampleVoice(context, output);

    voice.configure(
      {
        ...song.tracks.sample,
        muted: true,
      },
      song.samples,
    );
    voice.scheduleStep(7, 0.5);

    voice.configure(
      {
        ...song.tracks.sample,
        muted: false,
        steps: song.tracks.sample.steps.map((step, index) =>
          index === 7
            ? {
                ...step,
                enabled: true,
                sampleId: null,
              }
            : index === 15
              ? {
                  ...step,
                  enabled: true,
                  sampleId: "missing-id",
                }
              : step,
        ),
      },
      song.samples,
    );
    voice.scheduleStep(7, 1);
    voice.scheduleStep(15, 1.5);
    voice.scheduleStep(0, 2);

    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(context.createGain).not.toHaveBeenCalled();
    expect(context.createBuffer).not.toHaveBeenCalled();
  });

  it("falls back to a silent one-frame buffer for empty trims", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers } = createMockAudioContext();
    const voice = new SampleVoice(context, output);
    const sample = song.samples[0];

    if (sample === undefined) {
      throw new Error("Expected seeded sample asset.");
    }

    voice.configure(song.tracks.sample, [
      {
        ...sample,
        trim: {
          startFrame: sample.frameCount,
          endFrame: sample.frameCount,
        },
      },
    ]);
    voice.scheduleStep(7, 2.5);

    expect(createdBuffers).toHaveLength(1);
    expect(createdBuffers[0]?.length).toBe(1);
    expect(Array.from(createdBuffers[0]?.data ?? [])).toEqual([0]);
  });
});
