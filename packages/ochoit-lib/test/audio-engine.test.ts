import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audioEngineMocks = vi.hoisted(() => {
  const transport = {
    configure: vi.fn<(config: unknown) => void>(),
    disconnect: vi.fn<() => void>(),
    start: vi.fn<(startTime?: number, step?: number) => void>(),
    stop: vi.fn<() => void>(),
    subscribe: vi.fn<
      (listener: (event: { type: string; steps?: Array<{ step: number; time: number; loopCount: number }> }) => void) => () => void
    >(),
  };
  const unsubscribeTransport = vi.fn<() => void>();
  const pulseVoiceConstructor = vi.fn<(context: AudioContext, output: AudioNode) => void>();
  const pulseConfigure = vi.fn<(track: unknown, transport: unknown) => void>();
  const pulseScheduleStep = vi.fn<(step: number, time: number) => void>();
  const pulsePreviewNote = vi.fn<(note: string, duty?: number, durationMs?: number, volume?: number) => void>();
  const triangleVoiceConstructor = vi.fn<(context: AudioContext, output: AudioNode) => void>();
  const triangleConfigure = vi.fn<(track: unknown, transport: unknown) => void>();
  const triangleScheduleStep = vi.fn<(step: number, time: number) => void>();
  const noiseVoiceConstructor = vi.fn<(context: AudioContext, output: AudioNode) => void>();
  const noiseConfigure = vi.fn<(track: unknown, transport: unknown) => void>();
  const noiseScheduleStep = vi.fn<(step: number, time: number) => void>();
  const noisePreviewStep = vi.fn<(step: unknown, durationMs?: number) => void>();
  const sampleVoiceConstructor = vi.fn<(context: AudioContext, output: AudioNode) => void>();
  const sampleConfigure = vi.fn<(track: unknown, samples: unknown, engineMode: unknown) => void>();
  const sampleScheduleStep = vi.fn<(step: number, time: number) => void>();
  const samplePreview = vi.fn<(sampleId: string, playbackRate?: number, durationMs?: number, volume?: number) => void>();
  const createTransport = vi.fn(async () => transport);

  class MockPulseVoice {
    constructor(context: AudioContext, output: AudioNode) {
      pulseVoiceConstructor(context, output);
    }

    configure(track: unknown, transport: unknown) {
      pulseConfigure(track, transport);
    }

    scheduleStep(step: number, time: number) {
      pulseScheduleStep(step, time);
    }

    previewNote(note: string, duty?: number, durationMs?: number, volume?: number) {
      pulsePreviewNote(note, duty, durationMs, volume);
    }
  }

  class MockTriangleVoice {
    constructor(context: AudioContext, output: AudioNode) {
      triangleVoiceConstructor(context, output);
    }

    configure(track: unknown, transport: unknown) {
      triangleConfigure(track, transport);
    }

    scheduleStep(step: number, time: number) {
      triangleScheduleStep(step, time);
    }
  }

  class MockNoiseVoice {
    constructor(context: AudioContext, output: AudioNode) {
      noiseVoiceConstructor(context, output);
    }

    configure(track: unknown, transport: unknown) {
      noiseConfigure(track, transport);
    }

    scheduleStep(step: number, time: number) {
      noiseScheduleStep(step, time);
    }

    previewStep(step: unknown, durationMs?: number) {
      noisePreviewStep(step, durationMs);
    }
  }

  class MockSampleVoice {
    constructor(context: AudioContext, output: AudioNode) {
      sampleVoiceConstructor(context, output);
    }

    configure(track: unknown, samples: unknown, engineMode: unknown) {
      sampleConfigure(track, samples, engineMode);
    }

    scheduleStep(step: number, time: number) {
      sampleScheduleStep(step, time);
    }

    previewSample(sampleId: string, playbackRate?: number, durationMs?: number, volume?: number) {
      samplePreview(sampleId, playbackRate, durationMs, volume);
    }
  }

  transport.subscribe.mockImplementation(() => unsubscribeTransport);

  return {
    createTransport,
    pulseVoiceConstructor,
    pulseConfigure,
    pulseScheduleStep,
    pulsePreviewNote,
    triangleVoiceConstructor,
    triangleConfigure,
    triangleScheduleStep,
    noiseVoiceConstructor,
    noiseConfigure,
    noiseScheduleStep,
    noisePreviewStep,
    sampleVoiceConstructor,
    sampleConfigure,
    sampleScheduleStep,
    samplePreview,
    PulseVoice: MockPulseVoice,
    TriangleVoice: MockTriangleVoice,
    NoiseVoice: MockNoiseVoice,
    SampleVoice: MockSampleVoice,
    transport,
    unsubscribeTransport,
  };
});

vi.mock("../src/web/audio-transport", () => ({
  AudioTransport: {
    create: audioEngineMocks.createTransport,
  },
}));

vi.mock("../src/web/pulse-voice", () => ({
  PulseVoice: audioEngineMocks.PulseVoice,
}));

vi.mock("../src/web/triangle-voice", () => ({
  TriangleVoice: audioEngineMocks.TriangleVoice,
  getTriangleOutputGain: (volume: number) => Math.min(1, volume * 1.7),
}));

vi.mock("../src/web/noise-voice", () => ({
  NoiseVoice: audioEngineMocks.NoiseVoice,
}));

vi.mock("../src/web/sample-voice", () => ({
  SampleVoice: audioEngineMocks.SampleVoice,
}));

import { AudioEngine } from "../src/web/audio-engine";
import { createDefaultSongDocument, trackOrder } from "../src/core/song-document";

class MockAudioParam {
  value: number;
  readonly setValueAtTime: ReturnType<typeof vi.fn<(value: number, time: number) => void>>;
  readonly linearRampToValueAtTime: ReturnType<typeof vi.fn<(value: number, time: number) => void>>;

  constructor(initialValue: number) {
    this.value = initialValue;
    this.setValueAtTime = vi.fn((value: number) => {
      this.value = value;
    });
    this.linearRampToValueAtTime = vi.fn((value: number) => {
      this.value = value;
    });
  }
}

class MockGainNode {
  readonly gain = new MockAudioParam(1);
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();
}

class MockBiquadFilterNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new MockAudioParam(350);
  readonly Q = new MockAudioParam(1);
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();
}

class MockOscillatorNode {
  type: OscillatorType = "sine";
  readonly frequency = new MockAudioParam(0);
  onended: (() => void) | null = null;
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();
  readonly start = vi.fn<(when?: number) => void>();
  readonly stop = vi.fn<(when?: number) => void>();
}

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(private readonly fillValue: number) {}

  getByteTimeDomainData(array: Uint8Array) {
    array.fill(this.fillValue);
  }
}

class MockAudioContext {
  state: AudioContextState = "suspended";
  currentTime = 0;
  readonly destination = {} as AudioDestinationNode;
  readonly sampleRate = 48_000;
  readonly createdAnalysers: MockAnalyserNode[] = [];
  readonly createdBiquadFilters: MockBiquadFilterNode[] = [];
  readonly createdGains: MockGainNode[] = [];
  readonly createdOscillators: MockOscillatorNode[] = [];
  readonly createGain = vi.fn(() => {
    const gain = new MockGainNode();
    this.createdGains.push(gain);
    return gain as unknown as GainNode;
  });
  readonly createOscillator = vi.fn(() => {
    const oscillator = new MockOscillatorNode();
    this.createdOscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  });
  readonly createAnalyser = vi.fn(() => {
    const analyser = new MockAnalyserNode(120 + this.createdAnalysers.length);
    this.createdAnalysers.push(analyser);
    return analyser as unknown as AnalyserNode;
  });
  readonly createBiquadFilter = vi.fn(() => {
    const filter = new MockBiquadFilterNode();
    this.createdBiquadFilters.push(filter);
    return filter as unknown as BiquadFilterNode;
  });
  readonly resume = vi.fn(async () => {
    this.state = "running";
  });
  readonly suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  readonly close = vi.fn(async () => {
    this.state = "closed";
  });
}

describe("audio-engine", () => {
  let mockContext: MockAudioContext;

  beforeEach(() => {
    mockContext = new MockAudioContext();
    audioEngineMocks.createTransport.mockClear();
    audioEngineMocks.pulseVoiceConstructor.mockClear();
    audioEngineMocks.pulseConfigure.mockClear();
    audioEngineMocks.pulseScheduleStep.mockClear();
    audioEngineMocks.pulsePreviewNote.mockClear();
    audioEngineMocks.triangleVoiceConstructor.mockClear();
    audioEngineMocks.triangleConfigure.mockClear();
    audioEngineMocks.triangleScheduleStep.mockClear();
    audioEngineMocks.noiseVoiceConstructor.mockClear();
    audioEngineMocks.noiseConfigure.mockClear();
    audioEngineMocks.noiseScheduleStep.mockClear();
    audioEngineMocks.noisePreviewStep.mockClear();
    audioEngineMocks.sampleVoiceConstructor.mockClear();
    audioEngineMocks.sampleConfigure.mockClear();
    audioEngineMocks.sampleScheduleStep.mockClear();
    audioEngineMocks.samplePreview.mockClear();
    audioEngineMocks.transport.configure.mockClear();
    audioEngineMocks.transport.disconnect.mockClear();
    audioEngineMocks.transport.start.mockClear();
    audioEngineMocks.transport.stop.mockClear();
    audioEngineMocks.unsubscribeTransport.mockClear();
    audioEngineMocks.transport.subscribe.mockImplementation(() => audioEngineMocks.unsubscribeTransport);

    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          return mockContext as unknown as AudioContext;
        }
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates analyser-backed voice buses and reads per-track waveform data", async () => {
    const engine = await AudioEngine.create();

    expect(audioEngineMocks.createTransport).toHaveBeenCalledWith(mockContext);
    expect(audioEngineMocks.pulseVoiceConstructor).toHaveBeenNthCalledWith(1, mockContext, engine.voices.pulse1.input);
    expect(audioEngineMocks.pulseVoiceConstructor).toHaveBeenNthCalledWith(2, mockContext, engine.voices.pulse2.input);
    expect(audioEngineMocks.triangleVoiceConstructor).toHaveBeenCalledWith(mockContext, engine.voices.triangle.input);
    expect(audioEngineMocks.noiseVoiceConstructor).toHaveBeenCalledWith(mockContext, engine.voices.noise.input);
    expect(audioEngineMocks.sampleVoiceConstructor).toHaveBeenCalledWith(mockContext, engine.voices.sample.input);
    expect(mockContext.createAnalyser).toHaveBeenCalledTimes(trackOrder.length);
    expect(mockContext.createBiquadFilter).toHaveBeenCalledTimes(2);
    expect(mockContext.createdBiquadFilters[0]?.type).toBe("highpass");
    expect(mockContext.createdBiquadFilters[1]?.type).toBe("lowpass");

    trackOrder.forEach((trackId, index) => {
      const voice = engine.voices[trackId];
      const analyser = voice.analyser as unknown as MockAnalyserNode;
      const input = voice.input as unknown as MockGainNode;
      const gain = voice.gain as unknown as MockGainNode;

      expect(voice.id).toBe(trackId);
      expect(analyser.fftSize).toBe(1024);
      expect(analyser.smoothingTimeConstant).toBe(0.85);
      expect(input.connect).toHaveBeenCalledWith(voice.gain);
      expect(gain.connect).toHaveBeenCalledWith(voice.analyser);
      expect(Array.from(engine.getWaveform(trackId, 6))).toEqual(Array(6).fill(120 + index));
    });
  });

  it("configures volumes, forwards transport scheduling, and tears down cleanly", async () => {
    const engine = await AudioEngine.create();
    const song = createDefaultSongDocument();
    const mutedTriangleSong = {
      ...song,
      mixer: {
        masterVolume: 0.61,
        oldSpeakerMode: true,
      },
      tracks: {
        ...song.tracks,
        pulse1: {
          ...song.tracks.pulse1,
          volume: 0.43,
        },
        triangle: {
          ...song.tracks.triangle,
          muted: true,
          volume: 0.3,
        },
        noise: {
          ...song.tracks.noise,
          volume: 0.57,
        },
        sample: {
          ...song.tracks.sample,
          volume: 0.66,
        },
      },
    };

    engine.configureSong(mutedTriangleSong);

    expect(engine.masterGain.gain.value).toBe(0.61);
    expect(mockContext.createdGains[1]?.gain.value).toBe(0);
    expect(mockContext.createdGains[2]?.gain.value).toBe(1);
    expect((engine.voices.pulse1.gain as unknown as MockGainNode).gain.value).toBe(0.43);
    expect((engine.voices.triangle.gain as unknown as MockGainNode).gain.value).toBe(0);
    expect((engine.voices.noise.gain as unknown as MockGainNode).gain.value).toBe(0.57);
    expect((engine.voices.sample.gain as unknown as MockGainNode).gain.value).toBe(0.66);
    expect(audioEngineMocks.pulseConfigure).toHaveBeenNthCalledWith(
      1,
      mutedTriangleSong.tracks.pulse1,
      mutedTriangleSong.transport,
    );
    expect(audioEngineMocks.pulseConfigure).toHaveBeenNthCalledWith(
      2,
      mutedTriangleSong.tracks.pulse2,
      mutedTriangleSong.transport,
    );
    expect(audioEngineMocks.transport.configure).toHaveBeenCalledWith(mutedTriangleSong.transport);
    expect(audioEngineMocks.triangleConfigure).toHaveBeenCalledWith(
      mutedTriangleSong.tracks.triangle,
      mutedTriangleSong.transport,
    );
    expect(audioEngineMocks.noiseConfigure).toHaveBeenCalledWith(
      mutedTriangleSong.tracks.noise,
      mutedTriangleSong.transport,
    );
    expect(audioEngineMocks.sampleConfigure).toHaveBeenCalledWith(
      mutedTriangleSong.tracks.sample,
      mutedTriangleSong.samples,
      mutedTriangleSong.meta.engineMode,
    );

    const subscribeListener = audioEngineMocks.transport.subscribe.mock.calls[0]?.[0];
    subscribeListener?.({
      type: "scheduled-steps",
      steps: [{ step: 4, time: 1.5, loopCount: 0 }],
    });

    expect(audioEngineMocks.pulseScheduleStep).toHaveBeenNthCalledWith(1, 4, 1.5);
    expect(audioEngineMocks.pulseScheduleStep).toHaveBeenNthCalledWith(2, 4, 1.5);
    expect(audioEngineMocks.triangleScheduleStep).toHaveBeenCalledWith(4, 1.5);
    expect(audioEngineMocks.noiseScheduleStep).toHaveBeenCalledWith(4, 1.5);
    expect(audioEngineMocks.sampleScheduleStep).toHaveBeenCalledWith(4, 1.5);

    await engine.close();

    expect(audioEngineMocks.unsubscribeTransport).toHaveBeenCalledTimes(1);
    expect(audioEngineMocks.transport.disconnect).toHaveBeenCalledTimes(1);
    expect(mockContext.createdGains[1]?.disconnect).toHaveBeenCalledTimes(1);
    expect(mockContext.createdGains[2]?.disconnect).toHaveBeenCalledTimes(1);
    expect(mockContext.createdBiquadFilters[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(mockContext.createdBiquadFilters[1]?.disconnect).toHaveBeenCalledTimes(1);
    trackOrder.forEach((trackId) => {
      const voice = engine.voices[trackId];

      expect((voice.input as unknown as MockGainNode).disconnect).toHaveBeenCalledTimes(1);
      expect((voice.gain as unknown as MockGainNode).disconnect).toHaveBeenCalledTimes(1);
      expect((voice.analyser as unknown as MockAnalyserNode).disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it("uses the preview voice waveform for hovered melodic notes", async () => {
    const engine = await AudioEngine.create();

    mockContext.state = "running";

    engine.previewNote("triangle", "C4", 180, 0.5, 0.33);
    engine.previewNote("pulse1", "E4", 120, 0.25, 0.61);

    const trianglePreviewGain = mockContext.createdGains.at(-1);

    expect(mockContext.createdOscillators).toHaveLength(1);
    expect(mockContext.createdOscillators[0]?.type).toBe("triangle");
    expect(mockContext.createdOscillators[0]?.frequency.setValueAtTime).toHaveBeenCalled();
    expect(mockContext.createdOscillators[0]?.connect).toHaveBeenCalledWith(trianglePreviewGain);
    expect(mockContext.createdOscillators[0]?.start).toHaveBeenCalledWith(mockContext.currentTime);
    expect(mockContext.createdOscillators[0]?.stop).toHaveBeenCalledWith(mockContext.currentTime + 0.19);
    expect(trianglePreviewGain?.connect).toHaveBeenCalledWith(engine.voices.triangle.input);
    expect(trianglePreviewGain?.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.561, mockContext.currentTime + 0.003);
    expect(trianglePreviewGain?.gain.setValueAtTime).toHaveBeenNthCalledWith(2, 0.561, mockContext.currentTime + 0.155);
    expect(audioEngineMocks.pulsePreviewNote).toHaveBeenCalledWith("E4", 0.25, 120, 0.61);
  });

  it("delegates noise and PCM hover previews to their voice implementations", async () => {
    const engine = await AudioEngine.create();

    mockContext.state = "running";

    engine.previewNoiseTrigger("crash", 140);
    engine.previewNoiseConfig("short", 2, 90);
    engine.previewSampleTrigger("mic-001", 1.5, 220);

    expect(audioEngineMocks.noisePreviewStep).toHaveBeenCalledWith(
      {
        volume: 0.78,
        mode: "long",
        periodIndex: 12,
      },
      140,
    );
    expect(audioEngineMocks.noisePreviewStep).toHaveBeenCalledWith(
      {
        volume: 0.78,
        mode: "short",
        periodIndex: 2,
      },
      90,
    );
    expect(audioEngineMocks.samplePreview).toHaveBeenCalledWith("mic-001", 1.5, 220, 0.82);
  });
});
