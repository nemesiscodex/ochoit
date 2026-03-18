import { startTransition, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/features/audio/audio-engine";

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

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const [engineState, setEngineState] = useState<AudioBootstrapState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncState = (engine: AudioEngine | null) => {
    startTransition(() => {
      setEngineState(toBootstrapState(engine));
    });
  };

  const initializeAudio = async () => {
    if (engineRef.current !== null) {
      await engineRef.current.resume();
      syncState(engineRef.current);
      return engineRef.current;
    }

    startTransition(() => {
      setEngineState("initializing");
      setErrorMessage(null);
    });

    try {
      const engine = AudioEngine.create();
      engineRef.current = engine;
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

  useEffect(() => {
    return () => {
      const engine = engineRef.current;

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
    initializeAudio,
    suspendAudio,
  };
}
