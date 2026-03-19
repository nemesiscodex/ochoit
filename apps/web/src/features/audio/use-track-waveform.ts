import { useEffect, useRef, useState } from "react";

import type { AudioEngine } from "@/features/audio/audio-engine";
import { WAVEFORM_SAMPLE_SIZE, createFlatWaveform } from "@/features/audio/waveform-data";
import type { TrackId } from "@/features/song/song-document";

const waveformRefreshIntervalMs = 1000 / 30;

export function useTrackWaveform({
  engine,
  trackId,
  sampleSize = WAVEFORM_SAMPLE_SIZE,
  fallbackWaveform,
}: {
  engine: AudioEngine | null;
  trackId: TrackId;
  sampleSize?: number;
  fallbackWaveform?: Uint8Array;
}) {
  const animationFrameIdRef = useRef<number | null>(null);
  const [waveform, setWaveform] = useState(() => fallbackWaveform ?? createFlatWaveform(sampleSize));

  useEffect(() => {
    if (engine !== null) {
      return;
    }

    setWaveform(fallbackWaveform ?? createFlatWaveform(sampleSize));
  }, [engine, fallbackWaveform, sampleSize]);

  useEffect(() => {
    if (engine === null) {
      return;
    }

    let isActive = true;
    let lastCaptureAt = -Infinity;

    const captureWaveform = (time: number) => {
      if (!isActive) {
        return;
      }

      if (time - lastCaptureAt >= waveformRefreshIntervalMs) {
        lastCaptureAt = time;
        setWaveform(engine.getWaveform(trackId, sampleSize));
      }

      animationFrameIdRef.current = window.requestAnimationFrame(captureWaveform);
    };

    setWaveform(engine.getWaveform(trackId, sampleSize));
    animationFrameIdRef.current = window.requestAnimationFrame(captureWaveform);

    return () => {
      isActive = false;

      if (animationFrameIdRef.current !== null) {
        window.cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [engine, sampleSize, trackId]);

  return waveform;
}
