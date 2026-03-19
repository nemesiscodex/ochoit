import { describe, expect, it, vi } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import { createNoiseCycle, getNoisePlaybackRate, NoiseVoice } from "@/features/audio/noise-voice";

class MockAudioParam {
  value = 1;
  readonly cancelScheduledValues = vi.fn<(time: number) => void>();
  readonly setValueAtTime = vi.fn<(value: number, time: number) => void>();
  readonly linearRampToValueAtTime = vi.fn<(value: number, time: number) => void>();
}

class MockAudioBuffer {
  readonly data: Float32Array;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
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
  loop = false;
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
    sampleRate: 48_000,
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

describe("noise-voice", () => {
  it("builds deterministic long and short noise cycles", () => {
    const longCycle = createNoiseCycle("long", 32);
    const shortCycle = createNoiseCycle("short", 32);

    expect(longCycle).toHaveLength(32);
    expect(shortCycle).toHaveLength(32);
    expect(new Set(Array.from(longCycle))).toEqual(new Set([-1, 1]));
    expect(new Set(Array.from(shortCycle))).toEqual(new Set([-1, 1]));
    expect(Array.from(longCycle)).not.toEqual(Array.from(shortCycle));
  });

  it("maps noise period indices to playback rates", () => {
    expect(getNoisePlaybackRate(3)).toBe(1);
    expect(getNoisePlaybackRate(0)).toBe(8);
    expect(getNoisePlaybackRate(15)).toBeCloseTo(32 / 4068, 6);
  });

  it("schedules an enabled noise step with cached buffers per mode", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers, createdGains, createdSources } = createMockAudioContext();
    const voice = new NoiseVoice(context, output);
    const step = song.tracks.noise.steps[0];
    const stepDuration = 60 / song.transport.bpm / song.transport.stepsPerBeat;
    const expectedStopTime = 1.75 + Math.max(stepDuration - 0.001, 0.001) + 0.01;

    voice.configure(song.tracks.noise, song.transport);
    voice.scheduleStep(0, 1.75);
    voice.scheduleStep(4, 2);

    expect(createdBuffers).toHaveLength(1);
    expect(createdSources).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    const firstSource = createdSources[0];
    const firstGain = createdGains[0];

    expect(firstSource?.buffer).toBe(createdBuffers[0]);
    expect(firstSource?.loop).toBe(true);
    expect(firstSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(getNoisePlaybackRate(step.periodIndex), 1.75);
    expect(firstGain?.gain.cancelScheduledValues).toHaveBeenCalledWith(1.75);
    expect(firstGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 1.75);
    expect(firstGain?.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, step.volume, 1.751);
    expect(firstSource?.start).toHaveBeenCalledWith(1.75);
    expect(firstSource?.stop).toHaveBeenCalledWith(expectedStopTime);

    firstSource?.onended?.();

    expect(firstSource?.disconnect).toHaveBeenCalledTimes(1);
    expect(firstGain?.disconnect).toHaveBeenCalledTimes(1);
    expect(context.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("creates one buffer per noise mode and ignores disabled or muted steps", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers } = createMockAudioContext();
    const voice = new NoiseVoice(context, output);

    voice.configure(song.tracks.noise, song.transport);
    voice.scheduleStep(0, 0.5);
    voice.scheduleStep(2, 0.75);

    voice.configure(
      {
        ...song.tracks.noise,
        muted: true,
      },
      song.transport,
    );
    voice.scheduleStep(4, 1);

    expect(createdBuffers).toHaveLength(2);
    expect(context.createBufferSource).toHaveBeenCalledTimes(2);
    expect(context.createGain).toHaveBeenCalledTimes(2);
  });
});
