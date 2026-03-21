import { describe, expect, it } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import {
  clampTrackVolume,
  toTrackVolumePercent,
  updateMasterVolume,
  updateOldSpeakerMode,
  updateTrackMute,
  updateTrackVolume,
} from "@/features/song/song-mixer";

describe("song-mixer", () => {
  it("clamps track volumes to the supported range and precision", () => {
    expect(clampTrackVolume(-0.3)).toBe(0);
    expect(clampTrackVolume(0.456)).toBe(0.46);
    expect(clampTrackVolume(1.8)).toBe(1);
    expect(toTrackVolumePercent(0.456)).toBe(46);
  });

  it("toggles mute for the requested track without affecting the others", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateTrackMute(song, "pulse1");

    expect(updatedSong.tracks.pulse1.muted).toBe(true);
    expect(updatedSong.tracks.pulse2.muted).toBe(song.tracks.pulse2.muted);
  });

  it("updates a single track volume and ignores invalid values", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateTrackVolume(song, "noise", 1.4);
    const ignoredSong = updateTrackVolume(song, "sample", Number.NaN);

    expect(updatedSong.tracks.noise.volume).toBe(1);
    expect(updatedSong.tracks.pulse1.volume).toBe(song.tracks.pulse1.volume);
    expect(ignoredSong).toBe(song);
  });

  it("updates master volume and ignores invalid values", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateMasterVolume(song, 0.61);
    const ignoredSong = updateMasterVolume(song, Number.NaN);

    expect(updatedSong.mixer.masterVolume).toBe(0.61);
    expect(updatedSong.tracks.pulse1.volume).toBe(song.tracks.pulse1.volume);
    expect(ignoredSong).toBe(song);
  });

  it("updates old speaker mode without affecting track levels", () => {
    const song = createDefaultSongDocument();
    const updatedSong = updateOldSpeakerMode(song, true);

    expect(updatedSong.mixer.oldSpeakerMode).toBe(true);
    expect(updatedSong.mixer.masterVolume).toBe(song.mixer.masterVolume);
    expect(updatedSong.tracks.noise.volume).toBe(song.tracks.noise.volume);
  });
});
