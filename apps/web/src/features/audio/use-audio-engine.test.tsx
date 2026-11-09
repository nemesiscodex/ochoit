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
import { usePlayheadSelector } from "@/features/audio/use-playhead-selector";

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

  async function initializeWithTransportListener() {
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

    return transportListener;
  }

  function playbackStateEvent(playbackState: "playing" | "stopped", nextStep: number, loopCount: number): AudioTransportEvent {
    return {
      type: "playback-state",
      snapshot: { playbackState, nextStep, nextStepTime: playbackState === "playing" ? 1.1 : null, loopCount },
    };
  }

  it("publishes scheduled transport steps when their audio time arrives", async () => {
    vi.useFakeTimers();
    const song = createDefaultSongDocument();
    render(<HookHarness song={song} onValue={(value) => void (latestValue = value)} />);
    const transportListener = await initializeWithTransportListener();

    act(() => {
      transportListener(playbackStateEvent("playing", 8, 2));
    });

    expect(latestValue?.playbackState).toBe("playing");
    expect(latestValue?.playhead.get()).toEqual({ nextStep: 0, loopCount: 0 });

    act(() => {
      transportListener({
        type: "scheduled-steps",
        steps: [{ step: 4, time: 1.05, loopCount: 2 }],
      });
    });

    expect(latestValue?.playhead.get().nextStep).toBe(0);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(latestValue?.playbackState).toBe("playing");
    expect(latestValue?.playhead.get()).toEqual({ nextStep: 4, loopCount: 2 });
  });

  it("advances the playhead without re-rendering the component that owns the hook", async () => {
    vi.useFakeTimers();
    let renders = 0;

    function CountingHarness(props: { song: SongDocument }) {
      const value = useAudioEngine(props.song);
      renders += 1;
      latestValue = value;
      return null;
    }

    render(<CountingHarness song={createDefaultSongDocument()} />);
    const transportListener = await initializeWithTransportListener();
    const playhead = latestValue?.playhead;

    act(() => {
      transportListener(playbackStateEvent("playing", 0, 0));
    });
    const rendersWhilePlaying = renders;

    act(() => {
      transportListener({
        type: "scheduled-steps",
        steps: [1, 2, 3, 4].map((step) => ({ step, time: 1 + step * 0.01, loopCount: 0 })),
      });
      vi.advanceTimersByTime(100);
    });

    expect(latestValue?.playhead.get()).toEqual({ nextStep: 4, loopCount: 0 });
    expect(latestValue?.playhead).toBe(playhead);
    expect(renders).toBe(rendersWhilePlaying);
  });

  it("resets the playhead and drops pending steps when transport stops", async () => {
    vi.useFakeTimers();
    render(<HookHarness song={createDefaultSongDocument()} onValue={(value) => void (latestValue = value)} />);
    const transportListener = await initializeWithTransportListener();

    act(() => {
      transportListener(playbackStateEvent("playing", 0, 0));
      transportListener({
        type: "scheduled-steps",
        steps: [
          { step: 6, time: 1.01, loopCount: 1 },
          { step: 7, time: 1.2, loopCount: 1 },
        ],
      });
      vi.advanceTimersByTime(50);
    });

    expect(latestValue?.playhead.get()).toEqual({ nextStep: 6, loopCount: 1 });

    act(() => {
      transportListener(playbackStateEvent("stopped", 0, 0));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(latestValue?.playbackState).toBe("stopped");
    expect(latestValue?.playhead.get()).toEqual({ nextStep: 0, loopCount: 0 });
  });

  it("never renders the reset step as playing when transport stops", async () => {
    vi.useFakeTimers();
    const rendered: string[] = [];

    function PlayheadProbe(props: { song: SongDocument }) {
      const value = useAudioEngine(props.song);
      const nextStep = usePlayheadSelector(value.playhead, (playhead) => playhead.nextStep);
      latestValue = value;
      rendered.push(`${value.playbackState}:${nextStep}`);
      return null;
    }

    render(<PlayheadProbe song={createDefaultSongDocument()} />);
    const transportListener = await initializeWithTransportListener();

    act(() => {
      transportListener(playbackStateEvent("playing", 0, 0));
      transportListener({ type: "scheduled-steps", steps: [{ step: 7, time: 1.01, loopCount: 0 }] });
      vi.advanceTimersByTime(50);
    });

    expect(rendered.at(-1)).toBe("playing:7");
    const rendersBeforeStop = rendered.length;

    act(() => {
      transportListener(playbackStateEvent("stopped", 0, 0));
    });

    expect(rendered.slice(rendersBeforeStop)).toEqual(["stopped:0"]);
  });
});
