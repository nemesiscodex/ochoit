import { deflateRaw } from "pako";
import { describe, expect, it } from "vitest";

import { createDefaultSongDocument } from "@/features/song/song-document";
import {
  buildSongShareUrl,
  parseSongSharePayload,
  parseSongShareText,
  readSongShareFromHash,
  serializeSongSharePayload,
  serializeSongShareText,
} from "@/features/song/song-share";

describe("song-share", () => {
  it("serializes and parses a v4 payload with compact track data and embedded samples", () => {
    const song = createDenseSongFixture();

    const payload = serializeSongSharePayload(song);
    const parsedSong = parseSongSharePayload(payload);

    expect(payload.startsWith("v4.")).toBe(true);
    expect(parsedSong).toEqual(song);
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
    expect(result.song).toEqual(parseSongSharePayload(serializeSongSharePayload(song)));
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

  it("is shorter than the v3 compact text payload for the default song", () => {
    const song = createDefaultSongDocument();

    expect(serializeSongSharePayload(song).length).toBeLessThan(serializeSongSharePayloadV3(song).length);
  });

  it("is shorter than the v3 compact text payload for a dense fixture", () => {
    const song = createDenseSongFixture();

    expect(serializeSongSharePayload(song).length).toBeLessThan(serializeSongSharePayloadV3(song).length);
  });

  it("parses existing v3 payloads and reserializes them as v4", () => {
    const song = createDenseSongFixture();
    const legacyV3Payload = serializeSongSharePayloadV3(song);

    const parsedSong = parseSongSharePayload(legacyV3Payload);
    const reserializedPayload = serializeSongSharePayload(parsedSong);

    expect(parsedSong).toEqual(song);
    expect(reserializedPayload.startsWith("v4.")).toBe(true);
  });

  it("parses legacy raw base64 json payloads and reserializes them as v4", () => {
    const song = createDenseSongFixture();
    const legacyPayload = encodeLegacyBase64Url(JSON.stringify(song));

    const parsedSong = parseSongSharePayload(legacyPayload);
    const reserializedPayload = serializeSongSharePayload(parsedSong);

    expect(parsedSong).toEqual(song);
    expect(reserializedPayload.startsWith("v4.")).toBe(true);
  });

  it("preserves song equality across legacy json to v4 migration", () => {
    const song = createDenseSongFixture();
    const parsedSong = parseSongSharePayload(encodeLegacyBase64Url(JSON.stringify(song)));
    const migratedSong = parseSongSharePayload(serializeSongSharePayload(parsedSong));

    expect(migratedSong).toEqual(song);
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

  it("defaults missing master volume in share text to 75 percent", () => {
    const shareText = [
      "!v=3;bpm=136;loop=16;spb=4;mode=i;name=Shared%20Song;author=Julio;created=2026-03-18T00:00:00.000Z;updated=2026-03-18T00:00:00.000Z",
      "=1;vol=100;mute=0",
      "=2;vol=100;mute=0",
      "=3;vol=100;mute=0",
      "=4;vol=100;mute=0",
      "=5;vol=100;mute=0",
    ].join("\n");

    const parsedSong = parseSongShareText(shareText);

    expect(parsedSong.mixer.masterVolume).toBe(0.75);
  });
});

function createDenseSongFixture() {
  const song = createDefaultSongDocument();
  const quantizedMicPcm = [0, 28, 91, 23, -25, -71, -18, 13, 43, 15, -10, 0].map((value) => value / 127);
  const quantizedImportPcm = [13, 23, -14, -41, 56, 34, -19, 3, 25, -13].map((value) => value / 127);

  song.meta.name = "Share Tune Deluxe";
  song.meta.author = "Julio";
  song.meta.engineMode = "authentic";
  song.transport.bpm = 172;
  song.transport.stepsPerBeat = 6;
  song.transport.loopLength = 32;
  song.mixer.masterVolume = 0.91;
  song.mixer.oldSpeakerMode = true;

  song.tracks.pulse1.muted = true;
  song.tracks.pulse1.volume = 0.81;
  song.tracks.pulse1.steps = Array.from({ length: 32 }, (_, index) => ({
    enabled: index % 4 === 0,
    note: ((index % 4 === 0 ? (index % 8 === 0 ? "C5" : "G4") : "C4") as (typeof song.tracks.pulse1.steps)[number]["note"]),
    volume: index % 4 === 0 ? (index % 8 === 0 ? 0.83 : 0.81) : 0.81,
    duty: index % 4 === 0 ? (index % 8 === 0 ? 0.25 : 0.75) : 0.5,
    length: index % 4 === 0 ? 2 : 1,
  }));

  song.tracks.pulse2.volume = 0.63;
  song.tracks.pulse2.steps = Array.from({ length: 32 }, (_, index) => ({
    enabled: index % 4 === 2,
    note: ((index % 4 === 2 ? (index % 8 === 2 ? "E4" : "A4") : "C4") as (typeof song.tracks.pulse2.steps)[number]["note"]),
    volume: index % 4 === 2 ? (index % 8 === 2 ? 0.91 : 0.63) : 0.63,
    duty: index % 4 === 2 ? (index % 8 === 2 ? 0.125 : 0.5) : 0.5,
    length: index % 4 === 2 ? (index % 8 === 2 ? 2 : 1) : 1,
  }));

  song.tracks.triangle.volume = 0.7;
  song.tracks.triangle.steps = Array.from({ length: 32 }, (_, index) => ({
    enabled: index % 8 === 0,
    note: ((index % 8 === 0 ? (index % 16 === 0 ? "C3" : "G2") : "C3") as (typeof song.tracks.triangle.steps)[number]["note"]),
    volume: index % 8 === 0 ? (index % 16 === 0 ? 0.72 : 0.7) : 0.7,
    length: index % 8 === 0 ? 4 : 1,
  }));

  song.tracks.noise.volume = 0.55;
  song.tracks.noise.steps = Array.from({ length: 32 }, (_, index) => ({
    enabled: index % 2 === 0,
    volume: index % 4 === 0 ? 0.67 : 0.55,
    mode: index % 8 === 0 ? "short" : "long",
    periodIndex: index % 8 === 0 ? 3 : 8,
  }));
  song.tracks.noise.steps[10] = {
    enabled: true,
    volume: 0.61,
    mode: "short",
    periodIndex: 6,
  };

  song.samples = [
    {
      ...song.samples[0]!,
      id: "mic-001",
      name: "vox-hit",
      source: "mic",
      baseNote: "C4",
      detectedBaseNote: null,
      sampleRate: 11025,
      trim: { startFrame: 0, endFrame: 12 },
      pcm: quantizedMicPcm,
    },
    {
      ...song.samples[0]!,
      id: "imp-002",
      name: "snip",
      source: "import",
      baseNote: "G3",
      detectedBaseNote: "G3",
      sampleRate: 16000,
      trim: { startFrame: 2, endFrame: 10 },
      pcm: quantizedImportPcm,
    },
  ];
  song.samples.forEach((sample) => {
    sample.frameCount = sample.pcm.length;
  });

  song.tracks.sample.volume = 0.74;
  song.tracks.sample.steps = Array.from({ length: 32 }, (_, index) => ({
    enabled: index === 7 || index === 15 || index === 23 || index === 31,
    volume: index === 15 ? 0.67 : 0.74,
    sampleId:
      index === 7 || index === 23
        ? "mic-001"
        : index === 15 || index === 31
          ? "imp-002"
          : null,
    note: index === 15 || index === 31 ? "G3" : "C4",
    playbackRate: index === 15 ? 1.5 : index === 31 ? 1.25 : 1,
  }));

  return song;
}

function serializeSongSharePayloadV3(song: ReturnType<typeof createDefaultSongDocument>) {
  return `v3.${encodeBase64Url(deflateRaw(new TextEncoder().encode(serializeSongShareText(song))))}`;
}

function encodeLegacyBase64Url(value: string) {
  let binary = "";

  new TextEncoder().encode(value).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
