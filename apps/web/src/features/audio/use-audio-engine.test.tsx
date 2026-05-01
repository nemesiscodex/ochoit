import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultSongDocument, type SongDocument } from "ochoit-lib";
import type { AudioTransportEvent } from "ochoit-lib/web";

const webAudioMocks = vi.hoisted(() => {
  const context = {
    currentTime: 1,
  } as AudioContext;

  const unsubscribeTransport = vi.fn<() => void>();
  const transportSubscribe = vi.fn<(listener: (event: AudioTransportEvent) => void) => () => void>().mockReturnValue(
    unsubscribeTransport,
  );
  const engine = {
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    configureSong: vi.fn<(song: SongDocument) => void>(),
    context,
    resume: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startTransport: vi.fn<(startTime?: number, step?: number) => void>(),
    state: "running" as const,
    stopTransport: vi.fn<() => void>(),
    suspend: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    transport: {
      subscribe: transportSubscribe,
    },
  };
  const create = vi.fn(async ({ context: _context }: { context?: AudioContext } = {}) => {
    return engine;
  });
  const start = vi.fn(async () => context);

  return {
    context,
    create,
    engine,
    start,
    transportSubscribe,
    unsubscribeTransport,
  };
});

vi.mock("ochoit-lib/web", () => ({
  AudioEngine: {
    create: webAudioMocks.create,
  },
  ochoit: {
    start: webAudioMocks.start,
  },
}));

import { useAudioEngine } from "@/features/audio/use-audio-engine";

type HookResult = ReturnType<typeof useAudioEngine>;

function HookHarness(props: { onValue: (value: HookResult) => void; song: SongDocument }) {
  const value = useAudioEngine(props.song);

  useEffect(() => {
    props.onValue(value);
  }, [props, value]);

  return null;
}

describe("use-audio-engine", () => {
  let latestValue: HookResult | null = null;

  beforeEach(() => {
    latestValue = null;
    webAudioMocks.create.mockClear();
    webAudioMocks.engine.close.mockClear();
    webAudioMocks.engine.configureSong.mockClear();
    webAudioMocks.engine.resume.mockClear();
    webAudioMocks.engine.startTransport.mockClear();
    webAudioMocks.engine.stopTransport.mockClear();
    webAudioMocks.engine.suspend.mockClear();
    webAudioMocks.start.mockClear();
    webAudioMocks.transportSubscribe.mockClear();
    webAudioMocks.unsubscribeTransport.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes the engine through ochoit.start and the shared context", async () => {
    const song = createDefaultSongDocument();
    render(<HookHarness song={song} onValue={(value) => void (latestValue = value)} />);

    if (latestValue === null) {
      throw new Error("Expected the hook harness to expose the audio hook value.");
    }

    await act(async () => {
      await latestValue?.initializeAudio();
    });

    expect(webAudioMocks.start).toHaveBeenCalledTimes(1);
    expect(webAudioMocks.create).toHaveBeenCalledWith({
      context: webAudioMocks.context,
    });
    expect(webAudioMocks.engine.configureSong).toHaveBeenCalledWith(song);
    await waitFor(() => {
      expect(latestValue?.engineState).toBe("running");
    });
  });

  it("starts transport through the library-backed engine bootstrap path", async () => {
    const song = createDefaultSongDocument();
    render(<HookHarness song={song} onValue={(value) => void (latestValue = value)} />);

    if (latestValue === null) {
      throw new Error("Expected the hook harness to expose the audio hook value.");
    }

    await act(async () => {
      await latestValue?.startTransport();
    });

    expect(webAudioMocks.start).toHaveBeenCalledTimes(1);
    expect(webAudioMocks.create).toHaveBeenCalledTimes(1);
    expect(webAudioMocks.engine.startTransport).toHaveBeenCalledTimes(1);
  });

  it("starts transport at a specific sequencer step", async () => {
    const song = createDefaultSongDocument();
    render(<HookHarness song={song} onValue={(value) => void (latestValue = value)} />);

    if (latestValue === null) {
      throw new Error("Expected the hook harness to expose the audio hook value.");
    }

    await act(async () => {
      await latestValue?.startTransportAtStep(5);
    });

    expect(webAudioMocks.start).toHaveBeenCalledTimes(1);
    expect(webAudioMocks.create).toHaveBeenCalledTimes(1);
    expect(webAudioMocks.engine.startTransport).toHaveBeenCalledWith(undefined, 5);
  });

  it("publishes scheduled transport steps when their audio time arrives", async () => {
    vi.useFakeTimers();
    const song = createDefaultSongDocument();
    render(<HookHarness song={song} onValue={(value) => void (latestValue = value)} />);

    if (latestValue === null) {
      throw new Error("Expected the hook harness to expose the audio hook value.");
    }

    await act(async () => {
      await latestValue?.initializeAudio();
    });

    const transportListener = webAudioMocks.transportSubscribe.mock.calls[0]?.[0];

    if (transportListener === undefined) {
      throw new Error("Expected useAudioEngine to subscribe to transport events.");
    }

    act(() => {
      transportListener({
        type: "playback-state",
        snapshot: {
          playbackState: "playing",
          nextStep: 8,
          nextStepTime: 1.1,
          loopCount: 2,
        },
      });
    });

    expect(latestValue?.transportState).toEqual({
      playbackState: "playing",
      nextStep: 0,
      nextStepTime: null,
      loopCount: 0,
    });

    act(() => {
      transportListener({
        type: "scheduled-steps",
        steps: [{ step: 4, time: 1.05, loopCount: 2 }],
      });
    });

    expect(latestValue?.transportState.nextStep).toBe(0);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(latestValue?.transportState).toEqual({
      playbackState: "playing",
      nextStep: 4,
      nextStepTime: 1.05,
      loopCount: 2,
    });
  });
});
