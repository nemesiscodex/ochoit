import { describe, expect, it } from "vitest";

import { createEmptySongDocument, createDefaultSongDocument } from "@/features/song/song-document";
import { createSongWavBlob, createSongWavFileName, renderSongToPcm } from "@/features/song/song-wav";

describe("song-wav", () => {
  it("renders the current arrangement into audible PCM and a RIFF/WAVE blob", async () => {
    const song = createDefaultSongDocument();
    const renderedSong = renderSongToPcm(song, { sampleRate: 8_000 });
    const wavBlob = createSongWavBlob(song, { sampleRate: 8_000 });

    expect(renderedSong.pcm.some((sample) => Math.abs(sample) > 0.0001)).toBe(true);
    expect(wavBlob.type).toBe("audio/wav");
    expect(wavBlob.size).toBeGreaterThan(44);
  });

  it("extends the render length to include sample playback past the loop boundary", () => {
    const song = createEmptySongDocument();
    const stepDurationSeconds = 60 / song.transport.bpm / song.transport.stepsPerBeat;
    const loopDurationSeconds = stepDurationSeconds * song.transport.loopLength;

    song.samples = [
      {
        id: "tail-sample",
        name: "tail",
        source: "import",
        baseNote: "C4",
        detectedBaseNote: null,
        sampleRate: 11_025,
        frameCount: 11_025,
        channels: 1,
        trim: {
          startFrame: 0,
          endFrame: 11_025,
        },
        pcm: Array.from({ length: 11_025 }, () => 0.5),
      },
    ];
    song.tracks.sample.steps.at(-1)!.enabled = true;
    song.tracks.sample.steps.at(-1)!.sampleId = "tail-sample";
    song.tracks.sample.steps.at(-1)!.note = "C4";

    const renderedSong = renderSongToPcm(song, { sampleRate: 11_025 });

    expect(renderedSong.durationSeconds).toBeGreaterThan(loopDurationSeconds);
  });

  it("applies the old speaker effect during wav rendering when enabled", () => {
    const cleanSong = createDefaultSongDocument();
    const filteredSong = createDefaultSongDocument();
    filteredSong.mixer.oldSpeakerMode = true;

    const cleanRender = renderSongToPcm(cleanSong, { sampleRate: 8_000 });
    const filteredRender = renderSongToPcm(filteredSong, { sampleRate: 8_000 });

    expect(filteredRender.pcm).toHaveLength(cleanRender.pcm.length);
    expect(filteredRender.pcm.some((sample, index) => sample !== cleanRender.pcm[index])).toBe(true);
  });

  it("renders a stepped triangle in authentic mode", () => {
    const inspiredSong = createEmptySongDocument();
    const authenticSong = createEmptySongDocument();

    inspiredSong.tracks.triangle.steps[0] = {
      ...inspiredSong.tracks.triangle.steps[0],
      enabled: true,
      note: "C3",
      length: 4,
    };
    authenticSong.tracks.triangle.steps[0] = {
      ...authenticSong.tracks.triangle.steps[0],
      enabled: true,
      note: "C3",
      length: 4,
    };
    authenticSong.meta.engineMode = "authentic";

    const inspiredRender = renderSongToPcm(inspiredSong, { sampleRate: 8_000 });
    const authenticRender = renderSongToPcm(authenticSong, { sampleRate: 8_000 });

    expect(authenticRender.pcm).toHaveLength(inspiredRender.pcm.length);
    expect(authenticRender.pcm.some((sample, index) => sample !== inspiredRender.pcm[index])).toBe(true);
  });

  it("renders a stepped pulse in authentic mode", () => {
    const inspiredSong = createEmptySongDocument();
    const authenticSong = createEmptySongDocument();

    inspiredSong.tracks.pulse1.steps[0] = {
      ...inspiredSong.tracks.pulse1.steps[0],
      enabled: true,
      note: "C4",
      duty: 0.25,
      length: 4,
    };
    authenticSong.tracks.pulse1.steps[0] = {
      ...authenticSong.tracks.pulse1.steps[0],
      enabled: true,
      note: "C4",
      duty: 0.25,
      length: 4,
    };
    authenticSong.meta.engineMode = "authentic";

    const inspiredRender = renderSongToPcm(inspiredSong, { sampleRate: 8_000 });
    const authenticRender = renderSongToPcm(authenticSong, { sampleRate: 8_000 });

    expect(authenticRender.pcm).toHaveLength(inspiredRender.pcm.length);
    expect(authenticRender.pcm.some((sample, index) => sample !== inspiredRender.pcm[index])).toBe(true);
  });

  it("creates stable wav filenames from song metadata", () => {
    const song = createEmptySongDocument();

    expect(createSongWavFileName(song)).toBe("ochoit-arrangement.wav");

    song.meta.name = "Boss / Theme: 01";

    expect(createSongWavFileName(song)).toBe("boss-theme-01.wav");
  });
});
