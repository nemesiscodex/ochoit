import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptySongDocument, createDefaultSongDocument, type SongDocument, type TrackId } from "ochoit-lib";
import { AudioEngine } from "ochoit-lib/web";
import { createSongWavBlob, createSongWavFileName, renderSongToPcm } from "@/features/song/song-wav";

class MockAudioParam {
  value = 1;
  readonly scheduledValues: number[] = [];

  cancelScheduledValues() {}

  setValueAtTime(value: number) {
    this.scheduledValues.push(value);
  }

  linearRampToValueAtTime(value: number) {
    this.scheduledValues.push(value);
  }
}

class MockAudioNode {
  readonly destinations: unknown[] = [];

  connect(destination: unknown) {
    this.destinations.push(destination);
  }

  disconnect() {}
}

class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam();
}

class MockBiquadFilterNode extends MockAudioNode {
  type = "lowpass";
  readonly frequency = new MockAudioParam();
  readonly Q = new MockAudioParam();
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
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

  get duration() {
    return this.length / this.sampleRate;
  }

  getChannelData() {
    return this.data;
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  readonly playbackRate = new MockAudioParam();

  start() {}

  stop() {}
}

class MockAudioWorkletNode extends MockAudioNode {
  static latest: MockAudioWorkletNode | null = null;
  readonly port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage() {},
  };

  constructor() {
    super();
    MockAudioWorkletNode.latest = this;
  }
}

class MockAudioContext {
  readonly state = "running";
  readonly currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = new MockAudioNode();
  readonly audioWorklet = { addModule: async () => {} };
  readonly gains: MockGainNode[] = [];
  readonly sources: MockAudioBufferSourceNode[] = [];

  createGain() {
    const gain = new MockGainNode();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource() {
    const source = new MockAudioBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createAnalyser() {
    return new MockAnalyserNode();
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
}

type LevelCase = { trackId: TrackId; stepVolume: number; trackVolume: number; masterVolume: number; muted: boolean };

const unitSampleId = "unit-peak";

function peakOf(values: ArrayLike<number>) {
  return Array.from(values).reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
}

function createSingleStepSong({ trackId, stepVolume, trackVolume, masterVolume, muted }: LevelCase): SongDocument {
  const song = createEmptySongDocument();

  song.mixer.masterVolume = masterVolume;
  song.tracks[trackId].volume = trackVolume;
  song.tracks[trackId].muted = muted;

  if (trackId === "pulse1" || trackId === "pulse2") {
    const step = { enabled: true, note: "C4", duty: 0.5, length: 4, volume: stepVolume } as const;
    Object.assign(song.tracks[trackId].steps[0]!, step);
  }

  if (trackId === "triangle") {
    song.meta.engineMode = "authentic";
    Object.assign(song.tracks.triangle.steps[0]!, { enabled: true, note: "C4", length: 4, volume: stepVolume });
  }

  if (trackId === "noise") {
    Object.assign(song.tracks.noise.steps[0]!, { enabled: true, mode: "long", periodIndex: 3, volume: stepVolume });
  }

  if (trackId === "sample") {
    song.samples = [
      {
        id: unitSampleId,
        name: "unit",
        source: "import",
        baseNote: "C4",
        detectedBaseNote: null,
        sampleRate: 8_000,
        frameCount: 4_000,
        channels: 1,
        trim: { startFrame: 0, endFrame: 4_000 },
        pcm: Array.from({ length: 4_000 }, () => 1),
      },
    ];
    Object.assign(song.tracks.sample.steps[0]!, { enabled: true, sampleId: unitSampleId, note: "C4", volume: stepVolume });
  }

  return song;
}

async function measureLivePeak(song: SongDocument, trackId: TrackId) {
  const context = new MockAudioContext();
  const engine = await AudioEngine.create({ context: context as unknown as AudioContext });

  engine.configureSong(song);
  MockAudioWorkletNode.latest?.port.onmessage?.({
    data: { type: "scheduled-steps", steps: [{ step: 0, time: 1, loopCount: 0 }] },
  });

  const bus = engine.voices[trackId];
  const noteGain = context.gains.find((gain) => gain.destinations.includes(bus.input));
  const source = context.sources.find((candidate) => noteGain !== undefined && candidate.destinations.includes(noteGain));

  if (noteGain === undefined || source?.buffer == null) {
    return 0;
  }

  const busGains = [bus.input, bus.gain, engine.masterGain] as unknown as MockGainNode[];

  return busGains.reduce(
    (level, gain) => level * gain.gain.value,
    peakOf(source.buffer.data) * Math.max(...noteGain.gain.scheduledValues),
  );
}

function describeLevel(levelCase: LevelCase, peak: number) {
  const { stepVolume, trackVolume, masterVolume, muted } = levelCase;

  return `step ${stepVolume} track ${trackVolume}${muted ? " muted" : ""} master ${masterVolume}: ${peak.toFixed(5)}`;
}

describe("song-wav", () => {
  it("renders the current arrangement into audible PCM and a RIFF/WAVE blob", async () => {
    const song = createDefaultSongDocument();
    const renderedSong = renderSongToPcm(song, { sampleRate: 8_000 });
    const wavBlob = createSongWavBlob(song, { sampleRate: 8_000 });

    expect(renderedSong.pcm.some((sample) => Math.abs(sample) > 0.0001)).toBe(true);
    expect(wavBlob.type).toBe("audio/wav");
    expect(wavBlob.size).toBeGreaterThan(44);
  });

  it("extends the render length to include sample playback past the loop boundary", () => {
    const song = createEmptySongDocument();
    const stepDurationSeconds = 60 / song.transport.bpm / song.transport.stepsPerBeat;
    const loopDurationSeconds = stepDurationSeconds * song.transport.loopLength;

    song.samples = [
      {
        id: "tail-sample",
        name: "tail",
        source: "import",
        baseNote: "C4",
        detectedBaseNote: null,
        sampleRate: 11_025,
        frameCount: 11_025,
        channels: 1,
        trim: {
          startFrame: 0,
          endFrame: 11_025,
        },
        pcm: Array.from({ length: 11_025 }, () => 0.5),
      },
    ];
    song.tracks.sample.steps.at(-1)!.enabled = true;
    song.tracks.sample.steps.at(-1)!.sampleId = "tail-sample";
    song.tracks.sample.steps.at(-1)!.note = "C4";

    const renderedSong = renderSongToPcm(song, { sampleRate: 11_025 });

    expect(renderedSong.durationSeconds).toBeGreaterThan(loopDurationSeconds);
  });

  it("applies the old speaker effect during wav rendering when enabled", () => {
    const cleanSong = createDefaultSongDocument();
    const filteredSong = createDefaultSongDocument();
    filteredSong.mixer.oldSpeakerMode = true;

    const cleanRender = renderSongToPcm(cleanSong, { sampleRate: 8_000 });
    const filteredRender = renderSongToPcm(filteredSong, { sampleRate: 8_000 });

    expect(filteredRender.pcm).toHaveLength(cleanRender.pcm.length);
    expect(filteredRender.pcm.some((sample, index) => sample !== cleanRender.pcm[index])).toBe(true);
  });

  it("renders a stepped triangle in authentic mode", () => {
    const inspiredSong = createEmptySongDocument();
    const authenticSong = createEmptySongDocument();

    inspiredSong.tracks.triangle.steps[0] = {
      ...inspiredSong.tracks.triangle.steps[0],
      enabled: true,
      note: "C3",
      length: 4,
    };
    authenticSong.tracks.triangle.steps[0] = {
      ...authenticSong.tracks.triangle.steps[0],
      enabled: true,
      note: "C3",
      length: 4,
    };
    authenticSong.meta.engineMode = "authentic";

    const inspiredRender = renderSongToPcm(inspiredSong, { sampleRate: 8_000 });
    const authenticRender = renderSongToPcm(authenticSong, { sampleRate: 8_000 });

    expect(authenticRender.pcm).toHaveLength(inspiredRender.pcm.length);
    expect(authenticRender.pcm.some((sample, index) => sample !== inspiredRender.pcm[index])).toBe(true);
  });

  it("renders a stepped pulse in authentic mode", () => {
    const inspiredSong = createEmptySongDocument();
    const authenticSong = createEmptySongDocument();

    inspiredSong.tracks.pulse1.steps[0] = {
      ...inspiredSong.tracks.pulse1.steps[0],
      enabled: true,
      note: "C4",
      duty: 0.25,
      length: 4,
    };
    authenticSong.tracks.pulse1.steps[0] = {
      ...authenticSong.tracks.pulse1.steps[0],
      enabled: true,
      note: "C4",
      duty: 0.25,
      length: 4,
    };
    authenticSong.meta.engineMode = "authentic";

    const inspiredRender = renderSongToPcm(inspiredSong, { sampleRate: 8_000 });
    const authenticRender = renderSongToPcm(authenticSong, { sampleRate: 8_000 });

    expect(authenticRender.pcm).toHaveLength(inspiredRender.pcm.length);
    expect(authenticRender.pcm.some((sample, index) => sample !== inspiredRender.pcm[index])).toBe(true);
  });

  it("creates stable wav filenames from song metadata", () => {
    const song = createEmptySongDocument();

    expect(createSongWavFileName(song)).toBe("ochoit-arrangement.wav");

    song.meta.name = "Boss / Theme: 01";

    expect(createSongWavFileName(song)).toBe("boss-theme-01.wav");
  });
});

describe("song-wav level parity with live playback", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<TrackId>(["pulse1", "pulse2", "triangle", "noise", "sample"])(
    "renders %s steps at the peak level the live engine plays them",
    async (trackId) => {
      const levelCases = [0.2, 0.5, 0.8, 1].flatMap((stepVolume) =>
        [0.4, 1].flatMap((trackVolume) =>
          [0.6, 1].flatMap((masterVolume) =>
            [false, true].map((muted) => ({ trackId, stepVolume, trackVolume, masterVolume, muted })),
          ),
        ),
      );
      const liveLevels: string[] = [];
      const wavLevels: string[] = [];

      for (const levelCase of levelCases) {
        const song = createSingleStepSong(levelCase);

        liveLevels.push(describeLevel(levelCase, await measureLivePeak(song, trackId)));
        wavLevels.push(describeLevel(levelCase, peakOf(renderSongToPcm(song, { sampleRate: 8_000 }).pcm)));
      }

      expect(wavLevels).toEqual(liveLevels);
    },
  );
});
