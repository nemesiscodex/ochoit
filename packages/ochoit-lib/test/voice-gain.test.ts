import { describe, expect, it } from "vitest";

import { createEmptySongDocument } from "../src/core/song-document.js";
import { getStepOutputGain, getTrackGain, getVoiceStepGain } from "../src/core/voice-gain.js";

describe("voice-gain", () => {
  it("passes pulse, noise and sample step volumes through unchanged", () => {
    for (const kind of ["pulse", "noise", "sample"] as const) {
      expect(getVoiceStepGain(kind, 0)).toBe(0);
      expect(getVoiceStepGain(kind, 0.5)).toBe(0.5);
      expect(getVoiceStepGain(kind, 1)).toBe(1);
    }
  });

  it("boosts triangle steps by 1.7 and clamps them at full scale", () => {
    expect(getVoiceStepGain("triangle", 0)).toBe(0);
    expect(getVoiceStepGain("triangle", 0.5)).toBe(0.85);
    expect(getVoiceStepGain("triangle", 0.8)).toBe(1);
    expect(getVoiceStepGain("triangle", 1)).toBe(1);
  });

  it("uses the track volume unless the track is muted", () => {
    const pulse = { ...createEmptySongDocument().tracks.pulse1, volume: 0.4 };

    expect(getTrackGain(pulse)).toBe(0.4);
    expect(getTrackGain({ ...pulse, muted: true })).toBe(0);
  });

  it("multiplies master, track and step gains, clamping the triangle boost before the mix", () => {
    const song = createEmptySongDocument();
    const mixer = { ...song.mixer, masterVolume: 0.5 };
    const triangle = { ...song.tracks.triangle, volume: 0.5 };

    expect(getStepOutputGain(mixer, triangle, 0.8)).toBe(0.25);
    expect(getStepOutputGain(mixer, triangle, 0.4)).toBeCloseTo(0.17, 12);
    expect(getStepOutputGain(mixer, { ...song.tracks.pulse1, volume: 0.5 }, 0.8)).toBeCloseTo(0.2, 12);
    expect(getStepOutputGain(mixer, { ...song.tracks.noise, volume: 1 }, 0.6)).toBeCloseTo(0.3, 12);
    expect(getStepOutputGain(mixer, { ...song.tracks.sample, volume: 0.8 }, 1)).toBeCloseTo(0.4, 12);
    expect(getStepOutputGain(mixer, { ...triangle, muted: true }, 0.8)).toBe(0);
    expect(getStepOutputGain({ masterVolume: 0 }, triangle, 0.8)).toBe(0);
  });
});
