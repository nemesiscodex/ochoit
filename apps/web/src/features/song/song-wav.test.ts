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

  it("creates stable wav filenames from song metadata", () => {
    const song = createEmptySongDocument();

    expect(createSongWavFileName(song)).toBe("ochoit-arrangement.wav");

    song.meta.name = "Boss / Theme: 01";

    expect(createSongWavFileName(song)).toBe("boss-theme-01.wav");
  });
});
