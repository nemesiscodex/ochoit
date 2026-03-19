import { describe, expect, it, vi } from "vitest";

import { getFrequencyForNote } from "@/features/audio/note-frequency";
import { createTriangleCycle, TriangleVoice } from "@/features/audio/triangle-voice";
import { createDefaultSongDocument } from "@/features/song/song-document";

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

describe("triangle-voice", () => {
  it("creates a triangle waveform cycle", () => {
    expect(Array.from(createTriangleCycle(8))).toEqual([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
  });

  it("schedules an enabled triangle step with a cached waveform buffer", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers, createdGains, createdSources } = createMockAudioContext();
    const voice = new TriangleVoice(context, output);
    const step = song.tracks.triangle.steps[8];
    const stepDuration = 60 / song.transport.bpm / song.transport.stepsPerBeat;
    const expectedStopTime = 2.5 + Math.max(stepDuration - 0.002, 0.002) + 0.01;

    voice.configure(song.tracks.triangle, song.transport);
    voice.scheduleStep(8, 2.5);
    voice.scheduleStep(12, 3);

    expect(createdBuffers).toHaveLength(1);
    expect(createdSources).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    const firstSource = createdSources[0];
    const firstGain = createdGains[0];
    const expectedPlaybackRate = (getFrequencyForNote(step.note) * 2048) / 48_000;

    expect(firstSource?.buffer).toBe(createdBuffers[0]);
    expect(firstSource?.loop).toBe(true);
    expect(firstSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(expectedPlaybackRate, 2.5);
    expect(firstGain?.gain.cancelScheduledValues).toHaveBeenCalledWith(2.5);
    expect(firstGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 2.5);
    expect(firstGain?.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, step.volume, 2.502);
    expect(firstSource?.start).toHaveBeenCalledWith(2.5);
    expect(firstSource?.stop).toHaveBeenCalledWith(expectedStopTime);

    firstSource?.onended?.();

    expect(firstSource?.disconnect).toHaveBeenCalledTimes(1);
    expect(firstGain?.disconnect).toHaveBeenCalledTimes(1);

    const secondSource = createdSources[1];
    expect(secondSource?.buffer).toBe(createdBuffers[0]);
    expect(context.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("ignores disabled or muted triangle steps", () => {
    const song = createDefaultSongDocument();
    const { context, output } = createMockAudioContext();
    const voice = new TriangleVoice(context, output);

    voice.configure(
      {
        ...song.tracks.triangle,
        muted: true,
      },
      song.transport,
    );
    voice.scheduleStep(0, 0.5);

    voice.configure(song.tracks.triangle, song.transport);
    voice.scheduleStep(1, 0.75);

    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(context.createGain).not.toHaveBeenCalled();
  });
});
