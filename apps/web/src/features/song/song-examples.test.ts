import { describe, expect, it } from "vitest";

import { songExamples } from "@/features/song/song-examples";
import { parseSongShareText } from "@/features/song/song-share";

describe("song-examples", () => {
  it("ships a parseable built-in Mario Theme example", () => {
    const marioTheme = songExamples.find((example) => example.id === "mario-theme");

    if (marioTheme === undefined) {
      throw new Error("Expected the Mario Theme example to be registered.");
    }

    const song = parseSongShareText(marioTheme.dsl);

    expect(song.meta.name).toBe("Mario Theme");
    expect(song.meta.author).toBe("nemesiscodex");
    expect(song.transport.loopLength).toBe(64);
    expect(song.samples).toHaveLength(1);
  });

  it("ships a parseable built-in Mario Underwater example", () => {
    const marioUnderwater = songExamples.find((example) => example.id === "mario-underwater");

    if (marioUnderwater === undefined) {
      throw new Error("Expected the Mario Underwater example to be registered.");
    }

    const song = parseSongShareText(marioUnderwater.dsl);

    expect(song.meta.name).toBe("Mario Underwater");
    expect(song.meta.author).toBe("nemesiscodex");
    expect(song.transport.loopLength).toBe(64);
    expect(song.mixer.masterVolume).toBe(0.43);
    expect(song.samples).toHaveLength(0);
  });

  it("ships a parseable built-in Zelda Medley example", () => {
    const zeldaMedley = songExamples.find((example) => example.id === "zelda-medley");

    if (zeldaMedley === undefined) {
      throw new Error("Expected the Zelda Medley example to be registered.");
    }

    const song = parseSongShareText(zeldaMedley.dsl);

    expect(song.meta.name).toBe("Zelda Medley");
    expect(song.meta.author).toBe("nemesiscodex");
    expect(song.transport.loopLength).toBe(128);
    expect(song.transport.bpm).toBe(140);
    expect(song.mixer.masterVolume).toBe(0.88);
    expect(song.mixer.oldSpeakerMode).toBe(true);
    expect(song.samples).toHaveLength(0);
  });
});
