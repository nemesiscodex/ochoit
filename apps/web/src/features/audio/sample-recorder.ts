import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { createFlatWaveform } from "@/features/audio/waveform-data";
import type { SerializedSampleAsset } from "@/features/song/song-document";

export const SAMPLE_RECORDING_TARGET_RATE = 11_025;
export const SAMPLE_RECORDING_MAX_DURATION_MS = 2_000;
export const SAMPLE_RECORDING_WAVEFORM_SIZE = 192;

export type SampleRecorderPermissionState = "unknown" | "granted" | "denied" | "unsupported";
export type SampleRecorderStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "processing"
  | "ready"
  | "error";

type AudioBufferLike = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData: (channel: number) => ArrayLike<number>;
};

export type RecordedSampleDraft = {
  asset: SerializedSampleAsset;
  durationMs: number;
  waveform: Uint8Array;
};

type SampleRecorderResult = {
  errorMessage: string | null;
  permissionState: SampleRecorderPermissionState;
  recordingDurationMs: number;
  startRecording: () => Promise<void>;
  status: SampleRecorderStatus;
  stopRecording: () => void;
  waveform: Uint8Array;
};

function clampLevel(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function formatMicSampleIndex(value: number) {
  return value.toString().padStart(3, "0");
}

function getMicSampleIndex(sample: SerializedSampleAsset) {
  const match = /^mic-(\d+)$/i.exec(sample.id);

  if (match === null) {
    return null;
  }

  return Number.parseInt(match[1] ?? "", 10);
}

function collectMonoPcm(buffer: AudioBufferLike) {
  if (buffer.length === 0) {
    return new Float32Array(0);
  }

  const channelCount = Math.max(1, buffer.numberOfChannels);

  if (channelCount === 1) {
    return Float32Array.from(buffer.getChannelData(0), clampLevel);
  }

  const mono = new Float32Array(buffer.length);

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channelData = buffer.getChannelData(channelIndex);

    for (let frameIndex = 0; frameIndex < buffer.length; frameIndex += 1) {
      mono[frameIndex] += channelData[frameIndex] ?? 0;
    }
  }

  for (let frameIndex = 0; frameIndex < mono.length; frameIndex += 1) {
    mono[frameIndex] = clampLevel(mono[frameIndex] / channelCount);
  }

  return mono;
}

function downsamplePcm(source: Float32Array, sourceRate: number, targetRate: number) {
  if (source.length === 0) {
    return new Float32Array(0);
  }

  if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
    return Float32Array.from(source, clampLevel);
  }

  if (targetRate >= sourceRate) {
    return Float32Array.from(source, clampLevel);
  }

  const sampleRateRatio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.round(source.length / sampleRateRatio));
  const downsampled = new Float32Array(targetLength);
  let sourceFrameStart = 0;

  for (let targetFrameIndex = 0; targetFrameIndex < targetLength; targetFrameIndex += 1) {
    const nextSourceFrameStart = Math.min(
      source.length,
      Math.max(sourceFrameStart + 1, Math.round((targetFrameIndex + 1) * sampleRateRatio)),
    );
    let sum = 0;

    for (let sourceFrameIndex = sourceFrameStart; sourceFrameIndex < nextSourceFrameStart; sourceFrameIndex += 1) {
      sum += source[sourceFrameIndex] ?? 0;
    }

    downsampled[targetFrameIndex] = clampLevel(sum / (nextSourceFrameStart - sourceFrameStart));
    sourceFrameStart = nextSourceFrameStart;
  }

  return downsampled;
}

export function createWaveformFromPcm(pcm: ArrayLike<number>, sampleSize = SAMPLE_RECORDING_WAVEFORM_SIZE): Uint8Array {
  if (pcm.length === 0) {
    return createFlatWaveform(sampleSize);
  }

  const lastFrameIndex = pcm.length - 1;

  return Uint8Array.from({ length: sampleSize }, (_, sampleIndex) => {
    const progress = sampleSize === 1 ? 0 : sampleIndex / (sampleSize - 1);
    const sourceIndex = lastFrameIndex === 0 ? 0 : Math.round(progress * lastFrameIndex);
    const amplitude = clampLevel(pcm[sourceIndex] ?? 0);

    return clampByte(128 + amplitude * 112);
  });
}

export function getNextMicSampleId(samples: readonly SerializedSampleAsset[]) {
  const nextIndex =
    samples.reduce((highestIndex, sample) => {
      const sampleIndex = getMicSampleIndex(sample);

      return sampleIndex === null || Number.isNaN(sampleIndex) ? highestIndex : Math.max(highestIndex, sampleIndex);
    }, 0) + 1;

  return `mic-${formatMicSampleIndex(nextIndex)}`;
}

export function createRecordedSampleAsset(
  buffer: AudioBufferLike,
  existingSamples: readonly SerializedSampleAsset[],
): RecordedSampleDraft {
  const pcm = downsamplePcm(collectMonoPcm(buffer), buffer.sampleRate, SAMPLE_RECORDING_TARGET_RATE);
  const sampleRate = buffer.sampleRate > SAMPLE_RECORDING_TARGET_RATE ? SAMPLE_RECORDING_TARGET_RATE : buffer.sampleRate;
  const frameCount = pcm.length;
  const id = getNextMicSampleId(existingSamples);
  const waveform = createWaveformFromPcm(pcm);

  return {
    asset: {
      id,
      name: id,
      source: "mic",
      sampleRate,
      frameCount,
      channels: 1,
      trim: {
        startFrame: 0,
        endFrame: frameCount,
      },
      pcm: Array.from(pcm),
    },
    durationMs: frameCount === 0 || sampleRate <= 0 ? 0 : Math.round((frameCount / sampleRate) * 1000),
    waveform,
  };
}

async function decodeRecordedBlob(blob: Blob) {
  if (typeof AudioContext === "undefined") {
    throw new Error("Web Audio is not available in this browser.");
  }

  const decodingContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();

  try {
    return await decodingContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await decodingContext.close();
  }
}

function getRecorderSupportState(): SampleRecorderPermissionState {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    navigator.mediaDevices === undefined ||
    typeof navigator.mediaDevices.getUserMedia !== "function" ||
    typeof MediaRecorder === "undefined"
  ) {
    return "unsupported";
  }

  return "unknown";
}

function getRecordingErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found for recording.";
    }
  }

  return error instanceof Error ? error.message : "Unable to record from the microphone.";
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function useSampleRecorder({
  existingSamples,
  onRecordingComplete,
}: {
  existingSamples: readonly SerializedSampleAsset[];
  onRecordingComplete: (recording: RecordedSampleDraft) => void;
}): SampleRecorderResult {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const autoStopTimeoutRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const samplesRef = useRef(existingSamples);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const [permissionState, setPermissionState] = useState<SampleRecorderPermissionState>(() => getRecorderSupportState());
  const [status, setStatus] = useState<SampleRecorderStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [waveform, setWaveform] = useState<Uint8Array>(() => createFlatWaveform(SAMPLE_RECORDING_WAVEFORM_SIZE));

  samplesRef.current = existingSamples;
  onRecordingCompleteRef.current = onRecordingComplete;

  const clearRecordingTimers = useCallback(() => {
    if (autoStopTimeoutRef.current !== null) {
      window.clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }

    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  const resetRecorderResources = useCallback(() => {
    clearRecordingTimers();
    recorderRef.current = null;
    recordingStartedAtRef.current = null;
    chunksRef.current = [];
    stopStream(streamRef.current);
    streamRef.current = null;
  }, [clearRecordingTimers]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (permissionState === "unsupported") {
      startTransition(() => {
        if (!isMountedRef.current) {
          return;
        }

        setStatus("error");
        setErrorMessage("This browser does not support microphone recording.");
      });
      return;
    }

    if (recorderRef.current?.state === "recording") {
      return;
    }

    startTransition(() => {
      if (!isMountedRef.current) {
        return;
      }

      setStatus("requesting-permission");
      setErrorMessage(null);
      setRecordingDurationMs(0);
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("error", (event) => {
        const recorderError = event.error ?? new Error("Unable to record from the microphone.");

        resetRecorderResources();
        startTransition(() => {
          if (!isMountedRef.current) {
            return;
          }

          setPermissionState("granted");
          setStatus("error");
          setErrorMessage(getRecordingErrorMessage(recorderError));
        });
      });

      recorder.addEventListener("stop", () => {
        clearRecordingTimers();
        startTransition(() => {
          if (!isMountedRef.current) {
            return;
          }

          setStatus("processing");
        });

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });

        void decodeRecordedBlob(blob)
          .then((buffer) => {
            const recording = createRecordedSampleAsset(buffer, samplesRef.current);

            startTransition(() => {
              if (!isMountedRef.current) {
                return;
              }

              setWaveform(recording.waveform);
              setRecordingDurationMs(recording.durationMs);
              setStatus("ready");
              setErrorMessage(null);
            });

            if (isMountedRef.current) {
              onRecordingCompleteRef.current(recording);
            }
          })
          .catch((error: unknown) => {
            startTransition(() => {
              if (!isMountedRef.current) {
                return;
              }

              setStatus("error");
              setErrorMessage(getRecordingErrorMessage(error));
            });
          })
          .finally(() => {
            resetRecorderResources();
          });
      });

      recorder.start();
      recordingStartedAtRef.current = window.performance.now();

      autoStopTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, SAMPLE_RECORDING_MAX_DURATION_MS);

      recordingIntervalRef.current = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current;

        if (startedAt === null) {
          return;
        }

        setRecordingDurationMs(Math.min(SAMPLE_RECORDING_MAX_DURATION_MS, Math.round(window.performance.now() - startedAt)));
      }, 50);

      startTransition(() => {
        if (!isMountedRef.current) {
          return;
        }

        setPermissionState("granted");
        setStatus("recording");
      });
    } catch (error) {
      resetRecorderResources();

      startTransition(() => {
        if (!isMountedRef.current) {
          return;
        }

        setPermissionState(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : permissionState);
        setStatus("error");
        setErrorMessage(getRecordingErrorMessage(error));
      });
    }
  }, [clearRecordingTimers, permissionState, resetRecorderResources, stopRecording]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      resetRecorderResources();
    };
  }, [resetRecorderResources]);

  useEffect(() => {
    isMountedRef.current = true;
  }, []);

  return {
    errorMessage,
    permissionState,
    recordingDurationMs,
    startRecording,
    status,
    stopRecording,
    waveform,
  };
}
