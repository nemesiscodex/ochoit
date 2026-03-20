import { describe, expect, it } from "vitest";

import { suggestSamplePitchNote } from "@/features/audio/sample-pitch";

const sampleRate = 11_025;

describe("sample-pitch", () => {
  it("detects a stable sine wave and rounds it to the nearest note", () => {
    const pcm = createSineWavePcm(440, sampleRate, 0.45);

    expect(suggestSamplePitchNote(pcm, sampleRate)).toBe("A4");
  });

  it("handles a lower sharp pitch that matches the supported note labels", () => {
    const pcm = createSineWavePcm(116.540_94, sampleRate, 0.65);

    expect(suggestSamplePitchNote(pcm, sampleRate)).toBe("A#2");
  });

  it("returns null for near-silent input", () => {
    const pcm = new Float32Array(4096);

    expect(suggestSamplePitchNote(pcm, sampleRate)).toBeNull();
  });

  it("returns null for unpitched deterministic noise", () => {
    const pcm = createDeterministicNoisePcm(4096, 0.5);

    expect(suggestSamplePitchNote(pcm, sampleRate)).toBeNull();
  });
});

function createSineWavePcm(frequency: number, rate: number, amplitude: number, durationSeconds = 0.5) {
  const frameCount = Math.max(1, Math.round(rate * durationSeconds));

  return Float32Array.from({ length: frameCount }, (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / rate));
}

function createDeterministicNoisePcm(frameCount: number, amplitude: number) {
  let state = 0x1234_5678;

  return Float32Array.from({ length: frameCount }, () => {
    state = (1664525 * state + 1013904223) >>> 0;
    const normalized = state / 0xffff_ffff;
    return (normalized * 2 - 1) * amplitude;
  });
}
