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
  }

  transport.subscribe.mockImplementation(() => unsubscribeTransport);

  return {
    createTransport,
    pulseVoiceConstructor,
    pulseConfigure,
    pulseScheduleStep,
    PulseVoice: MockPulseVoice,
    transport,
    unsubscribeTransport,
  };
});

vi.mock("@/features/audio/audio-transport", () => ({
  AudioTransport: {
    create: audioEngineMocks.createTransport,
  },
}));

vi.mock("@/features/audio/pulse-voice", () => ({
  PulseVoice: audioEngineMocks.PulseVoice,
}));

import { AudioEngine } from "@/features/audio/audio-engine";
import { createDefaultSongDocument, trackOrder } from "@/features/song/song-document";

class MockGainNode {
  readonly gain = { value: 1 };
  readonly connect = vi.fn<(destination: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();
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
  readonly destination = {} as AudioDestinationNode;
  readonly sampleRate = 48_000;
  readonly createdAnalysers: MockAnalyserNode[] = [];
  readonly createdGains: MockGainNode[] = [];
  readonly createGain = vi.fn(() => {
    const gain = new MockGainNode();
    this.createdGains.push(gain);
    return gain as unknown as GainNode;
  });
  readonly createAnalyser = vi.fn(() => {
    const analyser = new MockAnalyserNode(120 + this.createdAnalysers.length);
    this.createdAnalysers.push(analyser);
    return analyser as unknown as AnalyserNode;
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
    expect(audioEngineMocks.pulseVoiceConstructor).toHaveBeenCalledWith(mockContext, engine.voices.pulse1.input);
    expect(mockContext.createAnalyser).toHaveBeenCalledTimes(trackOrder.length);

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
      },
    };

    engine.configureSong(mutedTriangleSong);

    expect(engine.masterGain.gain.value).toBe(0.61);
    expect((engine.voices.pulse1.gain as unknown as MockGainNode).gain.value).toBe(0.43);
    expect((engine.voices.triangle.gain as unknown as MockGainNode).gain.value).toBe(0);
    expect(audioEngineMocks.pulseConfigure).toHaveBeenCalledWith(
      mutedTriangleSong.tracks.pulse1,
      mutedTriangleSong.transport,
    );
    expect(audioEngineMocks.transport.configure).toHaveBeenCalledWith(mutedTriangleSong.transport);

    const subscribeListener = audioEngineMocks.transport.subscribe.mock.calls[0]?.[0];
    subscribeListener?.({
      type: "scheduled-steps",
      steps: [{ step: 4, time: 1.5, loopCount: 0 }],
    });

    expect(audioEngineMocks.pulseScheduleStep).toHaveBeenCalledWith(4, 1.5);

    await engine.close();

    expect(audioEngineMocks.unsubscribeTransport).toHaveBeenCalledTimes(1);
    expect(audioEngineMocks.transport.disconnect).toHaveBeenCalledTimes(1);
    trackOrder.forEach((trackId) => {
      const voice = engine.voices[trackId];

      expect((voice.input as unknown as MockGainNode).disconnect).toHaveBeenCalledTimes(1);
      expect((voice.gain as unknown as MockGainNode).disconnect).toHaveBeenCalledTimes(1);
      expect((voice.analyser as unknown as MockAnalyserNode).disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
