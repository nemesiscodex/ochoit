import { startTransition, useEffect, useRef, useState } from "react";

import { type SongDocument } from "ochoit-lib";
import { AudioEngine, type AudioTransportEvent, type AudioTransportSnapshot } from "ochoit-lib/web";

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
  const [engineState, setEngineState] = useState<AudioBootstrapState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transportState, setTransportState] = useState<AudioTransportSnapshot>({
    playbackState: "stopped",
    nextStep: 0,
    nextStepTime: null,
    loopCount: 0,
  });

  const syncState = (engine: AudioEngine | null) => {
    startTransition(() => {
      setEngineState(toBootstrapState(engine));
    });
  };

  const syncTransportState = (event: AudioTransportEvent) => {
    if (event.type !== "playback-state") {
      return;
    }

    startTransition(() => {
      setTransportState(event.snapshot);
    });
  };

  const initializeAudio = async () => {
    if (engineRef.current !== null) {
      engineRef.current.configureSong(song);
      await engineRef.current.resume();
      syncState(engineRef.current);
      return engineRef.current;
    }

    startTransition(() => {
      setEngineState("initializing");
      setErrorMessage(null);
    });

    try {
      const engine = await AudioEngine.create();
      engineRef.current = engine;
      unsubscribeTransportRef.current?.();
      unsubscribeTransportRef.current = engine.transport.subscribe(syncTransportState);
      engine.configureSong(song);
      await engine.resume();
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
    transportState,
    initializeAudio,
    suspendAudio,
    startTransport,
    stopTransport,
  };
}
