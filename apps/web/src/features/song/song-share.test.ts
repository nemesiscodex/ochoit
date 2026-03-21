import { describe, expect, it } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import {
  buildSongShareUrl,
  parseSongSharePayload,
  parseSongShareText,
  readSongShareFromHash,
  serializeSongSharePayload,
} from "@/features/song/song-share";

describe("song-share", () => {
  it("serializes and parses a song payload with compact track data and embedded samples", () => {
    const song = createDefaultSongDocument();
    song.meta.name = "Share Tune";
    song.meta.engineMode = "authentic";
    song.transport.bpm = 172;
    song.mixer.oldSpeakerMode = true;
    song.tracks.pulse1.muted = true;
    song.tracks.pulse2.volume = 0.63;
    song.tracks.pulse2.steps[2] = {
      ...song.tracks.pulse2.steps[2],
      volume: 0.91,
      length: 2,
    };
    song.tracks.sample.steps[7] = {
      ...song.tracks.sample.steps[7],
      playbackRate: 1.5,
      volume: 0.67,
    };
    song.samples[0] = {
      ...song.samples[0],
      pcm: [0, 0.22, 0.72, 0.18, -0.2, -0.56, -0.14, 0.1, 0.34, 0.12, -0.08, 0],
    };

    const payload = serializeSongSharePayload(song);
    const parsedSong = parseSongSharePayload(payload);

    expect(payload.startsWith("v3.")).toBe(true);
    expect(parsedSong.meta.name).toBe(song.meta.name);
    expect(parsedSong.transport.bpm).toBe(song.transport.bpm);
    expect(parsedSong.mixer.oldSpeakerMode).toBe(true);
    expect(parsedSong.tracks.pulse1.muted).toBe(true);
    expect(parsedSong.tracks.pulse2.volume).toBeCloseTo(0.63, 5);
    expect(parsedSong.tracks.pulse2.steps[2]?.volume).toBeCloseTo(0.91, 5);
    expect(parsedSong.tracks.pulse2.steps[2]?.length).toBe(2);
    expect(parsedSong.tracks.sample.steps[7]?.playbackRate).toBeCloseTo(1.5, 5);
    expect(parsedSong.tracks.sample.steps[7]?.volume).toBeCloseTo(0.67, 5);
    expect(parsedSong.samples[0]?.pcm).toHaveLength(song.samples[0]?.pcm.length ?? 0);
    expect(parsedSong.samples[0]?.pcm[2] ?? 0).toBeCloseTo(song.samples[0]?.pcm[2] ?? 0, 1);
  });

  it("reads a song from the URL hash", () => {
    const song = createDefaultSongDocument();
    song.meta.name = "Shared Loop";

    const shareUrl = buildSongShareUrl("https://ochoit.test/", song);
    const result = readSongShareFromHash(new URL(shareUrl).hash);

    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") {
      throw new Error("Expected a loaded song.");
    }
    expect(result.song.meta.name).toBe(song.meta.name);
  });

  it("reports invalid share payloads", () => {
    expect(readSongShareFromHash("#song=broken")).toEqual({
      status: "invalid",
      error: "The shared song link is invalid or no longer matches the current song format.",
    });
  });

  it("produces a much shorter payload than the original json base64 format", () => {
    const song = createDefaultSongDocument();
    const compactPayload = serializeSongSharePayload(song);
    const legacyPayload = encodeLegacyBase64Url(JSON.stringify(song));

    expect(compactPayload.length).toBeLessThan(legacyPayload.length / 3);
  });

  it("defaults old speaker mode to off when reading older share text", () => {
    const legacyShareText = [
      "!v=3;bpm=136;loop=16;spb=4;mode=i;mv=88;name=Shared%20Song;author=Julio;created=2026-03-18T00:00:00.000Z;updated=2026-03-18T00:00:00.000Z",
      "=1;vol=84;mute=0",
      "=2;vol=76;mute=0",
      "=3;vol=78;mute=0",
      "=4;vol=68;mute=0",
      "=5;vol=74;mute=0",
    ].join("\n");

    const parsedSong = parseSongShareText(legacyShareText);

    expect(parsedSong.mixer.oldSpeakerMode).toBe(false);
  });
});

function encodeLegacyBase64Url(value: string) {
  let binary = "";

  new TextEncoder().encode(value).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
