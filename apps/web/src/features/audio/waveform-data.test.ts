import { trackOrder } from "ochoit-lib";
import { describe, expect, it, vi } from "vitest";

import {
  WAVEFORM_SAMPLE_SIZE,
  createFlatWaveform,
  previewWaveformByTrackId,
} from "@/features/audio/waveform-data";

const midpoint = 128;

function distinctLevels(trace: Uint8Array) {
  return new Set(trace).size;
}

function runLengths(trace: Uint8Array) {
  const runs: number[] = [];
  let length = 1;

  for (let index = 1; index < trace.length; index += 1) {
    if (trace[index] === trace[index - 1]) {
      length += 1;
    } else {
      runs.push(length);
      length = 1;
    }
  }

  runs.push(length);
  return runs;
}

function directionChanges(trace: Uint8Array) {
  let changes = 0;
  let direction = 0;

  for (let index = 1; index < trace.length; index += 1) {
    const step = Math.sign(trace[index] - trace[index - 1]);

    if (step !== 0 && direction !== 0 && step !== direction) {
      changes += 1;
    }

    if (step !== 0) {
      direction = step;
    }
  }

  return changes;
}

function peakDeviation(samples: Uint8Array) {
  return Math.max(...Array.from(samples, (sample) => Math.abs(sample - midpoint)));
}

function quarters(trace: Uint8Array) {
  const quarterLength = Math.floor(trace.length / 4);
  return { first: trace.subarray(0, quarterLength), last: trace.subarray(trace.length - quarterLength) };
}

function highShare(trace: Uint8Array) {
  const high = Math.max(...trace);
  return trace.filter((sample) => sample === high).length / trace.length;
}

describe("idle voice traces", () => {
  it.each(trackOrder)("gives %s a full-width trace that leaves headroom for the stroke", (trackId) => {
    const trace = previewWaveformByTrackId[trackId];

    expect(trace).toHaveLength(WAVEFORM_SAMPLE_SIZE);
    expect(Math.min(...trace)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...trace)).toBeLessThanOrEqual(235);
    expect(peakDeviation(trace)).toBeGreaterThanOrEqual(60);
  });

  it("draws each pulse voice as a two-level wave at its own duty cycle", () => {
    const { pulse1, pulse2 } = previewWaveformByTrackId;

    expect(distinctLevels(pulse1)).toBe(2);
    expect(distinctLevels(pulse2)).toBe(2);
    expect(highShare(pulse1)).toBeCloseTo(0.25, 1);
    expect(highShare(pulse2)).toBeCloseTo(0.5, 1);
    expect(Array.from(pulse1)).not.toEqual(Array.from(pulse2));
  });

  it("repeats each pulse a few times across the window", () => {
    for (const trace of [previewWaveformByTrackId.pulse1, previewWaveformByTrackId.pulse2]) {
      const periods = runLengths(trace).length / 2;

      expect(periods).toBeGreaterThanOrEqual(3);
      expect(periods).toBeLessThanOrEqual(5);
    }
  });

  it("draws the triangle as a 4-bit staircase that rises and falls without jumps", () => {
    const { triangle } = previewWaveformByTrackId;
    const levelStep = Math.ceil((Math.max(...triangle) - Math.min(...triangle)) / 15);

    expect(distinctLevels(triangle)).toBeLessThanOrEqual(16);
    expect(distinctLevels(triangle)).toBeGreaterThanOrEqual(12);
    expect(directionChanges(triangle)).toBeGreaterThanOrEqual(4);
    expect(directionChanges(triangle)).toBeLessThanOrEqual(8);

    for (let index = 1; index < triangle.length; index += 1) {
      expect(Math.abs(triangle[index] - triangle[index - 1])).toBeLessThanOrEqual(levelStep);
    }
  });

  it("draws noise as held random steps across many levels", () => {
    const { noise } = previewWaveformByTrackId;
    const runs = runLengths(noise);

    expect(Math.min(...runs)).toBeGreaterThanOrEqual(4);
    expect(runs.length).toBeGreaterThanOrEqual(16);
    expect(distinctLevels(noise)).toBeGreaterThanOrEqual(6);
    expect(directionChanges(noise)).toBeGreaterThanOrEqual(8);
  });

  it("draws the same noise on every load", async () => {
    const firstNoise = Array.from(previewWaveformByTrackId.noise);

    vi.resetModules();
    const reloaded = await import("@/features/audio/waveform-data");

    expect(reloaded.previewWaveformByTrackId.noise).not.toBe(previewWaveformByTrackId.noise);
    expect(Array.from(reloaded.previewWaveformByTrackId.noise)).toEqual(firstNoise);
  });

  it("draws the sample voice as an oscillating burst that dies away", () => {
    const { sample } = previewWaveformByTrackId;
    const { first, last } = quarters(sample);

    expect(directionChanges(first)).toBeGreaterThanOrEqual(4);
    expect(peakDeviation(first)).toBeGreaterThan(peakDeviation(last) * 3);
  });
});

describe("flat waveform", () => {
  it("holds every sample at the midpoint", () => {
    const flat = createFlatWaveform(64);

    expect(flat).toHaveLength(64);
    expect(new Set(flat)).toEqual(new Set([midpoint]));
  });
});
