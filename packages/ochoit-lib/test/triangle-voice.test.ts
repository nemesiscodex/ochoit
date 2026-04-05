import { describe, expect, it, vi } from "vitest";

import { getFrequencyForNote } from "../src/core/note-frequency.js";
import { createDefaultSongDocument } from "../src/core/song-document.js";
import { createTriangleCycle, getTriangleOutputGain, TriangleVoice } from "../src/web/triangle-voice.js";

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

  it("creates a stepped authentic triangle waveform cycle", () => {
    const authenticCycle = createTriangleCycle(32, "authentic");
    const quantizedLevels = Array.from(authenticCycle, (sample) => Math.round(((sample + 1) * 15) / 2));

    expect(quantizedLevels).toEqual([
      15, 14, 13, 12, 11, 10, 9, 8,
      7, 6, 5, 4, 3, 2, 1, 0,
      0, 1, 2, 3, 4, 5, 6, 7,
      8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it("boosts and clamps triangle output gain", () => {
    expect(getTriangleOutputGain(0.5)).toBe(0.85);
    expect(getTriangleOutputGain(0.8)).toBe(1);
  });

  it("schedules an enabled triangle step with a cached waveform buffer", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers, createdGains, createdSources } = createMockAudioContext();
    const voice = new TriangleVoice(context, output);
    const sustainedSong = {
      ...song,
      tracks: {
        ...song.tracks,
        triangle: {
          ...song.tracks.triangle,
          steps: song.tracks.triangle.steps.map((step, index) =>
            index === 8
              ? {
                  ...step,
                  enabled: true,
                  length: 4,
                }
              : step,
          ),
        },
      },
    };
    const step = sustainedSong.tracks.triangle.steps[8];
    const stepDuration = 60 / song.transport.bpm / song.transport.stepsPerBeat;
    const expectedStopTime = 2.5 + Math.max(stepDuration * 4 - 0.002, 0.002) + 0.01;

    voice.configure(sustainedSong.tracks.triangle, sustainedSong.transport);
    voice.scheduleStep(8, 2.5);
    voice.scheduleStep(12, 3);

    expect(createdBuffers).toHaveLength(1);
    expect(createdSources).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    const firstSource = createdSources[0];
    const firstGain = createdGains[0];
    const expectedPlaybackRate = (getFrequencyForNote(step.note) * 2048) / 48_000;
    const expectedOutputGain = getTriangleOutputGain(step.volume);
    const noteDuration = Math.max(stepDuration * 4 - 0.002, 0.002);
    const expectedReleaseStartTime = Math.max(2.5 + 0.002, 2.5 + noteDuration - 0.02);

    expect(firstSource?.buffer).toBe(createdBuffers[0]);
    expect(firstSource?.loop).toBe(true);
    expect(firstSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(expectedPlaybackRate, 2.5);
    expect(firstGain?.gain.cancelScheduledValues).toHaveBeenCalledWith(2.5);
    expect(firstGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 2.5);
    expect(firstGain?.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, expectedOutputGain, 2.502);
    expect(firstGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(2, expectedOutputGain, expectedReleaseStartTime);
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

  it("uses the authentic stepped cycle when configured in authentic mode", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers } = createMockAudioContext();
    const voice = new TriangleVoice(context, output);
    const authenticSong = {
      ...song,
      meta: {
        ...song.meta,
        engineMode: "authentic" as const,
      },
      tracks: {
        ...song.tracks,
        triangle: {
          ...song.tracks.triangle,
          steps: song.tracks.triangle.steps.map((step, index) =>
            index === 0
              ? {
                  ...step,
                  enabled: true,
                }
              : step,
          ),
        },
      },
    };

    voice.configure(authenticSong.tracks.triangle, authenticSong.transport, authenticSong.meta.engineMode);
    voice.scheduleStep(0, 0.5);

    expect(createdBuffers).toHaveLength(1);
    expect(createdBuffers[0]?.data[0]).toBe(1);
    expect(createdBuffers[0]?.data[64]).toBe(0.8666666746139526);
  });
});
