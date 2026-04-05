import { describe, expect, it, vi } from "vitest";

import { getFrequencyForNote } from "../src/core/note-frequency.js";
import { createDefaultSongDocument } from "../src/core/song-document.js";
import { createPulseCycle, PulseVoice } from "../src/web/pulse-voice.js";

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

describe("pulse-voice", () => {
  it("creates a duty-cycle pulse waveform", () => {
    expect(Array.from(createPulseCycle(0.25, 8))).toEqual([1, 1, -1, -1, -1, -1, -1, -1]);
    expect(Array.from(createPulseCycle(0.75, 8))).toEqual([1, 1, 1, 1, 1, 1, -1, -1]);
  });

  it("creates an authentic stepped pulse waveform", () => {
    expect(Array.from(createPulseCycle(0.25, 8, "authentic"))).toEqual([
      -0.25,
      0.75,
      0.75,
      -0.25,
      -0.25,
      -0.25,
      -0.25,
      -0.25,
    ]);
    expect(Array.from(createPulseCycle(0.75, 8, "authentic"))).toEqual([
      0.25,
      -0.75,
      -0.75,
      0.25,
      0.25,
      0.25,
      0.25,
      0.25,
    ]);
  });

  it("schedules an enabled pulse step with a cached waveform buffer", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers, createdGains, createdSources } = createMockAudioContext();
    const voice = new PulseVoice(context, output);
    const sustainedSong = {
      ...song,
      tracks: {
        ...song.tracks,
        pulse1: {
          ...song.tracks.pulse1,
          steps: song.tracks.pulse1.steps.map((step, index) =>
            index === 4
              ? {
                  ...step,
                  enabled: true,
                  length: 3,
                }
              : step,
          ),
        },
      },
    };
    const step = sustainedSong.tracks.pulse1.steps[4];
    const stepDuration = 60 / song.transport.bpm / song.transport.stepsPerBeat;
    const expectedStopTime = 1.5 + Math.max(stepDuration * 3 - 0.002, 0.002) + 0.01;

    voice.configure(sustainedSong.tracks.pulse1, sustainedSong.transport);
    voice.scheduleStep(4, 1.5);
    voice.scheduleStep(12, 2);

    expect(createdBuffers).toHaveLength(1);
    expect(createdSources).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    const firstSource = createdSources[0];
    const firstGain = createdGains[0];
    const expectedPlaybackRate = (getFrequencyForNote(step.note) * 2048) / 48_000;

    expect(firstSource?.buffer).toBe(createdBuffers[0]);
    expect(firstSource?.loop).toBe(true);
    expect(firstSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(expectedPlaybackRate, 1.5);
    expect(firstGain?.gain.cancelScheduledValues).toHaveBeenCalledWith(1.5);
    expect(firstGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 1.5);
    expect(firstGain?.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, step.volume, 1.502);
    expect(firstSource?.start).toHaveBeenCalledWith(1.5);
    expect(firstSource?.stop).toHaveBeenCalledWith(expectedStopTime);

    firstSource?.onended?.();

    expect(firstSource?.disconnect).toHaveBeenCalledTimes(1);
    expect(firstGain?.disconnect).toHaveBeenCalledTimes(1);

    const secondSource = createdSources[1];
    expect(secondSource?.buffer).toBe(createdBuffers[0]);
    expect(context.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("ignores disabled or muted steps", () => {
    const song = createDefaultSongDocument();
    const { context, output } = createMockAudioContext();
    const voice = new PulseVoice(context, output);

    voice.configure(
      {
        ...song.tracks.pulse1,
        muted: true,
      },
      song.transport,
    );
    voice.scheduleStep(0, 0.5);

    voice.configure(song.tracks.pulse1, song.transport);
    voice.scheduleStep(1, 0.75);

    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(context.createGain).not.toHaveBeenCalled();
  });

  it("uses the authentic stepped cycle when configured in authentic mode", () => {
    const song = createDefaultSongDocument();
    const { context, output, createdBuffers } = createMockAudioContext();
    const voice = new PulseVoice(context, output);
    const authenticSong = {
      ...song,
      meta: {
        ...song.meta,
        engineMode: "authentic" as const,
      },
      tracks: {
        ...song.tracks,
        pulse1: {
          ...song.tracks.pulse1,
          steps: song.tracks.pulse1.steps.map((step, index) =>
            index === 0
              ? {
                  ...step,
                  enabled: true,
                  duty: 0.25 as const,
                }
              : step,
          ),
        },
      },
    };

    voice.configure(authenticSong.tracks.pulse1, authenticSong.transport, authenticSong.meta.engineMode);
    voice.scheduleStep(0, 0.5);

    expect(createdBuffers).toHaveLength(1);
    expect(createdBuffers[0]?.data[0]).toBe(-0.25);
    expect(createdBuffers[0]?.data[256]).toBe(0.75);
    expect(createdBuffers[0]?.data[768]).toBe(-0.25);
  });
});
