import { describe, expect, it, vi, beforeEach } from "vitest";

import { createDefaultSongDocument } from "../src/core/song-document";
import { serializeSongShareText } from "../src/core/song-share";

const playerMocks = vi.hoisted(() => {
  const transportSubscribe = vi.fn<(listener: (event: unknown) => void) => () => void>();
  const transport = {
    configure: vi.fn<(config: unknown) => void>(),
    subscribe: transportSubscribe,
  };

  const engine = {
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    configureSong: vi.fn<(song: unknown) => void>(),
    resume: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setMasterVolume: vi.fn<(volume: number) => void>(),
    startTransport: vi.fn<(when?: number, step?: number) => void>(),
    stopTransport: vi.fn<() => void>(),
    transport,
  };

  const create = vi.fn(async () => engine);

  transportSubscribe.mockImplementation(() => () => {});

  return {
    create,
    engine,
    transportSubscribe,
  };
});

vi.mock("../src/web/audio-engine", () => ({
  AudioEngine: {
    create: playerMocks.create,
  },
}));

import { ochoit } from "../src/web/ochoit-player";

describe("ochoit-player", () => {
  beforeEach(() => {
    playerMocks.create.mockClear();
    playerMocks.engine.close.mockClear();
    playerMocks.engine.configureSong.mockClear();
    playerMocks.engine.resume.mockClear();
    playerMocks.engine.setMasterVolume.mockClear();
    playerMocks.engine.startTransport.mockClear();
    playerMocks.engine.stopTransport.mockClear();
    playerMocks.engine.transport.configure.mockClear();
    playerMocks.transportSubscribe.mockClear();
  });

  it("accepts a DSL string and lazily initializes on play", async () => {
    const song = createDefaultSongDocument();
    const player = ochoit(serializeSongShareText(song), {
      masterVolume: 0.42,
    });

    expect(playerMocks.create).not.toHaveBeenCalled();
    expect(player.getSong().meta.name).toBe(song.meta.name);

    await player.play({ when: 2.5, startStep: 4 });

    expect(playerMocks.create).toHaveBeenCalledTimes(1);
    expect(playerMocks.engine.configureSong).toHaveBeenCalledTimes(1);
    expect(playerMocks.engine.resume).toHaveBeenCalledTimes(1);
    expect(playerMocks.engine.setMasterVolume).toHaveBeenCalledWith(0.42);
    expect(playerMocks.engine.startTransport).toHaveBeenCalledWith(2.5, 4);
  });

  it("builds a single-voice song from shorthand arrangement input", async () => {
    const player = ochoit.voice("pulse", "3: C6, 4: E6", {
      bpm: 512,
      loop: false,
      steps: 8,
      volume: 100,
    });

    await player.play();

    const configuredSong = playerMocks.engine.configureSong.mock.calls[0]?.[0] as ReturnType<
      typeof createDefaultSongDocument
    >;

    expect(configuredSong.transport).toMatchObject({
      bpm: 512,
      loopLength: 8,
      stepsPerBeat: 4,
    });
    expect(configuredSong.mixer.masterVolume).toBe(1);
    expect(configuredSong.tracks.pulse1.volume).toBe(1);
    expect(configuredSong.tracks.pulse1.steps[2]).toMatchObject({
      enabled: true,
      note: "C6",
    });
    expect(configuredSong.tracks.pulse1.steps[3]).toMatchObject({
      enabled: true,
      note: "E6",
    });
    expect(configuredSong.tracks.triangle.steps.every((step) => step.enabled === false)).toBe(true);
    expect(playerMocks.engine.configureSong).toHaveBeenLastCalledWith(configuredSong, {
      loop: false,
    });
  });

  it("supports the overloaded ochoit(track, arrangement, options) shorthand", async () => {
    const player = ochoit("triangle", "1: C3, 5-8: G3", {
      bpm: 150,
      steps: 8,
      volume: 60,
    });

    await player.play();

    const configuredSong = playerMocks.engine.configureSong.mock.calls[0]?.[0] as ReturnType<
      typeof createDefaultSongDocument
    >;

    expect(configuredSong.tracks.triangle.volume).toBe(0.6);
    expect(configuredSong.tracks.triangle.steps[0]).toMatchObject({
      enabled: true,
      note: "C3",
      length: 1,
    });
    expect(configuredSong.tracks.triangle.steps[4]).toMatchObject({
      enabled: true,
      note: "G3",
      length: 4,
    });
  });

  it("accepts a SongDocument and can update, stop, and destroy", async () => {
    const initialSong = createDefaultSongDocument();
    const nextSong = createDefaultSongDocument();
    nextSong.meta.name = "Updated";

    const player = ochoit(initialSong, { autoResume: false });

    await player.play();
    player.update(nextSong);
    player.stop();
    await player.destroy();

    expect(playerMocks.engine.resume).not.toHaveBeenCalled();
    expect(playerMocks.engine.configureSong).toHaveBeenNthCalledWith(1, initialSong, {
      loop: true,
    });
    expect(playerMocks.engine.configureSong).toHaveBeenNthCalledWith(2, nextSong, {
      loop: true,
    });
    expect(playerMocks.engine.stopTransport).toHaveBeenCalledTimes(1);
    expect(playerMocks.engine.close).toHaveBeenCalledTimes(1);
  });

  it("forwards transport events to subscribers and exposes the latest state", async () => {
    const song = createDefaultSongDocument();
    let transportListener: ((event: unknown) => void) | null = null;
    playerMocks.transportSubscribe.mockImplementation((listener) => {
      transportListener = listener;
      return () => {
        transportListener = null;
      };
    });

    const player = ochoit(song);
    const listener = vi.fn<(event: unknown) => void>();
    const unsubscribe = player.subscribe(listener);

    await player.play();

    const playbackEvent = {
      type: "playback-state" as const,
      snapshot: {
        playbackState: "playing" as const,
        nextStep: 3,
        nextStepTime: 1.75,
        loopCount: 2,
      },
    };

    transportListener?.(playbackEvent);

    expect(listener).toHaveBeenCalledWith(playbackEvent);
    expect(player.getState()).toEqual(playbackEvent.snapshot);

    unsubscribe();
    transportListener?.({
      type: "scheduled-steps" as const,
      steps: [{ step: 4, time: 2, loopCount: 2 }],
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
