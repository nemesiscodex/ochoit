import { startTransition, useEffect, useRef, useState } from "react";

import { type SongDocument } from "ochoit-lib";
import { AudioEngine, ochoit, type AudioTransportEvent, type AudioTransportSnapshot } from "ochoit-lib/web";

import { createPlayheadStore } from "@/features/audio/playhead-store";

export type AudioBootstrapState =
  | "idle"
  | "initializing"
  | "running"
  | "suspended"
  | "closed"
  | "error";

function toBootstrapState(engine: AudioEngine | null): AudioBootstrapState {
  if (engine === null) {
    return "idle";
  }

  switch (engine.state) {
    case "running":
      return "running";
    case "suspended":
      return "suspended";
    case "closed":
      return "closed";
    default:
      return "idle";
  }
}

export function useAudioEngine(song: SongDocument) {
  const engineRef = useRef<AudioEngine | null>(null);
  const unsubscribeTransportRef = useRef<(() => void) | null>(null);
  const scheduledTransportTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transportTimerGenerationRef = useRef(0);
  const [engineState, setEngineState] = useState<AudioBootstrapState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<AudioTransportSnapshot["playbackState"]>("stopped");
  const [playhead] = useState(createPlayheadStore);

  const syncState = (engine: AudioEngine | null) => {
    startTransition(() => {
      setEngineState(toBootstrapState(engine));
    });
  };

  const syncTransportState = (event: AudioTransportEvent) => {
    if (event.type === "scheduled-steps") {
      const engine = engineRef.current;

      if (engine === null) {
        return;
      }

      const generation = transportTimerGenerationRef.current;

      event.steps.forEach((step) => {
        const delayMs = Math.max(0, (step.time - engine.context.currentTime) * 1000);
        const timerId = setTimeout(() => {
          scheduledTransportTimersRef.current = scheduledTransportTimersRef.current.filter((timer) => timer !== timerId);

          if (transportTimerGenerationRef.current !== generation) {
            return;
          }

          playhead.set({ nextStep: step.step, loopCount: step.loopCount });
        }, delayMs);

        scheduledTransportTimersRef.current.push(timerId);
      });
      return;
    }

    // Not a transition: React 19 batches this default-lane update with the playhead store's sync
    // re-render, so no frame shows the reset step while playback still reads as playing.
    setPlaybackState(event.snapshot.playbackState);

    if (event.snapshot.playbackState === "stopped") {
      transportTimerGenerationRef.current += 1;
      clearScheduledTransportTimers(scheduledTransportTimersRef.current);
      playhead.set({ nextStep: event.snapshot.nextStep, loopCount: event.snapshot.loopCount });
    }
  };

  const initializeAudio = async () => {
    startTransition(() => {
      setEngineState("initializing");
      setErrorMessage(null);
    });

    try {
      if (engineRef.current !== null) {
        await ochoit.start();
        engineRef.current.configureSong(song);
        syncState(engineRef.current);
        return engineRef.current;
      }

      const context = await ochoit.start();
      const engine = await AudioEngine.create({ context });
      engineRef.current = engine;
      unsubscribeTransportRef.current?.();
      unsubscribeTransportRef.current = engine.transport.subscribe(syncTransportState);
      engine.configureSong(song);
      syncState(engine);
      return engine;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize audio.";
      startTransition(() => {
        setEngineState("error");
        setErrorMessage(message);
      });
      return null;
    }
  };

  const suspendAudio = async () => {
    if (engineRef.current === null) {
      return;
    }

    await engineRef.current.suspend();
    syncState(engineRef.current);
  };

  const startTransport = async () => {
    const engine = await initializeAudio();

    if (engine === null) {
      return;
    }

    engine.startTransport();
  };

  const startTransportAtStep = async (step: number) => {
    const engine = await initializeAudio();

    if (engine === null) {
      return;
    }

    engine.startTransport(undefined, step);
  };

  const stopTransport = () => {
    const engine = engineRef.current;

    if (engine === null) {
      return;
    }

    engine.stopTransport();
  };

  useEffect(() => {
    const engine = engineRef.current;

    if (engine === null) {
      return;
    }

    engine.configureSong(song);
  }, [song]);

  useEffect(() => {
    return () => {
      const engine = engineRef.current;

      unsubscribeTransportRef.current?.();
      unsubscribeTransportRef.current = null;
      transportTimerGenerationRef.current += 1;
      clearScheduledTransportTimers(scheduledTransportTimersRef.current);

      if (engine === null) {
        return;
      }

      startTransition(() => {
        setEngineState("closed");
      });
      void engine.close();
      engineRef.current = null;
    };
  }, []);

  return {
    engine: engineRef.current,
    engineState,
    errorMessage,
    playbackState,
    playhead,
    initializeAudio,
    suspendAudio,
    startTransport,
    startTransportAtStep,
    stopTransport,
  };
}

function clearScheduledTransportTimers(timers: ReturnType<typeof setTimeout>[]) {
  timers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  timers.length = 0;
}
