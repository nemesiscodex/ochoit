import {
  applySongEdit,
  createDefaultSongDocument,
  createEmptySongDocument,
  getMelodicArrangementEntries,
  trackOrder,
  type SongDocument,
} from "ochoit-lib";
import { describe, expect, it } from "vitest";

import {
  advanceRecording,
  isRecordTarget,
  pressRecordingKey,
  releaseRecordingKey,
  startRecording,
  type QuantizedRecording,
} from "@/features/sequencer/quantized-recorder";

type Playhead = { nextStep: number; loopCount: number };

function recordSession(song: SongDocument, recording: QuantizedRecording) {
  let currentSong = song;
  let currentRecording = recording;

  return {
    press(key: string, note: Parameters<typeof pressRecordingKey>[3], playhead: Playhead) {
      const pressed = pressRecordingKey(currentRecording, currentSong, key, note, playhead);

      if (pressed !== null) {
        currentRecording = pressed.recording;
        currentSong = applySongEdit(currentSong, pressed.edit).song;
      }

      return pressed;
    },
    advance(playhead: Playhead) {
      const advanced = advanceRecording(currentRecording, currentSong, playhead);

      currentRecording = advanced.recording;
      currentSong = advanced.edits.reduce((nextSong, edit) => applySongEdit(nextSong, edit).song, currentSong);
      return advanced.edits;
    },
    release(key: string, playhead: Playhead) {
      const released = releaseRecordingKey(currentRecording, currentSong, key, playhead);

      if (released !== null) {
        currentRecording = released.recording;

        if (released.edit !== null) {
          currentSong = applySongEdit(currentSong, released.edit).song;
        }
      }

      return released;
    },
    song: () => currentSong,
  };
}

describe("quantized-recorder", () => {
  it("records a note at the playhead and grows it to the release step", () => {
    const session = recordSession(createEmptySongDocument(), startRecording("pulse1"));

    expect(session.press("z", "C3", { nextStep: 3, loopCount: 0 })?.stepIndex).toBe(3);
    expect(session.song().tracks.pulse1.steps[3]).toMatchObject({ enabled: true, note: "C3", length: 1, duty: 0.5 });

    session.advance({ nextStep: 5, loopCount: 0 });

    expect(session.song().tracks.pulse1.steps[3]).toMatchObject({ length: 2 });

    session.release("z", { nextStep: 7, loopCount: 0 });

    expect(getMelodicArrangementEntries(session.song().tracks.pulse1)).toEqual([
      { stepIndex: 3, note: "C3", length: 4, duty: 0.5 },
    ]);
  });

  it("keeps a held note to the loop end when the playhead wraps", () => {
    const session = recordSession(createEmptySongDocument(), startRecording("triangle"));

    session.press("z", "C3", { nextStep: 14, loopCount: 2 });

    expect(session.advance({ nextStep: 1, loopCount: 3 })).toEqual([
      { type: "place-steps", trackId: "triangle", steps: [{ stepIndex: 14, length: 2 }] },
    ]);

    session.release("z", { nextStep: 5, loopCount: 3 });

    expect(session.song().tracks.triangle.steps[14]).toMatchObject({ enabled: true, note: "C3", length: 2 });
  });

  it("records a quick tap as one step", () => {
    const session = recordSession(createEmptySongDocument(), startRecording("pulse2"));

    session.press("x", "D3", { nextStep: 6, loopCount: 0 });
    session.release("x", { nextStep: 6, loopCount: 0 });

    expect(session.song().tracks.pulse2.steps[6]).toMatchObject({ enabled: true, note: "D3", length: 1 });
  });

  it("ignores key repeat while a key is held and edits nothing when the playhead has not moved", () => {
    const session = recordSession(createEmptySongDocument(), startRecording("pulse1"));

    session.press("z", "C3", { nextStep: 3, loopCount: 0 });

    expect(session.press("z", "C3", { nextStep: 4, loopCount: 0 })).toBeNull();
    expect(session.advance({ nextStep: 3, loopCount: 0 })).toEqual([]);
    expect(session.song().tracks.pulse1.steps[4]?.enabled).toBe(false);
  });

  it("clears the notes a growing recorded note runs over", () => {
    const song = applySongEdit(createEmptySongDocument(), {
      type: "place-steps",
      trackId: "pulse1",
      steps: [{ stepIndex: 4, note: "E4", length: 2 }],
    }).song;
    const session = recordSession(song, startRecording("pulse1"));

    session.press("z", "C3", { nextStep: 3, loopCount: 0 });
    session.release("z", { nextStep: 6, loopCount: 0 });

    expect(getMelodicArrangementEntries(session.song().tracks.pulse1)).toEqual([
      { stepIndex: 3, note: "C3", length: 3, duty: 0.5 },
    ]);
  });

  it("records PCM notes as triggers with no length", () => {
    const song: SongDocument = { ...createEmptySongDocument(), samples: createDefaultSongDocument().samples };
    const session = recordSession(song, startRecording("sample"));

    session.press("x", "D3", { nextStep: 3, loopCount: 0 });

    expect(session.advance({ nextStep: 8, loopCount: 0 })).toEqual([]);

    const songBeforeRelease = session.song();

    expect(session.release("x", { nextStep: 8, loopCount: 0 })?.edit).toBeNull();
    expect(session.song()).toBe(songBeforeRelease);
    expect(session.song().tracks.sample.steps[3]).toMatchObject({ enabled: true, note: "D3", sampleId: "mic-001" });
  });

  it("records a PCM key again after it is released", () => {
    const song: SongDocument = { ...createEmptySongDocument(), samples: createDefaultSongDocument().samples };
    const session = recordSession(song, startRecording("sample"));

    session.press("x", "D3", { nextStep: 3, loopCount: 0 });
    session.release("x", { nextStep: 3, loopCount: 0 });

    expect(session.press("x", "D3", { nextStep: 7, loopCount: 0 })?.stepIndex).toBe(7);

    const triggers = session
      .song()
      .tracks.sample.steps.flatMap((step, stepIndex) => (step.enabled ? [{ stepIndex, note: step.note }] : []));

    expect(triggers).toEqual([
      { stepIndex: 3, note: "D3" },
      { stepIndex: 7, note: "D3" },
    ]);
  });

  it("records melodic voices always and PCM only in inspired mode", () => {
    const song = createEmptySongDocument();
    const authentic: SongDocument = { ...song, meta: { ...song.meta, engineMode: "authentic" } };

    expect(trackOrder.filter((trackId) => isRecordTarget(song, trackId))).toEqual([
      "pulse1",
      "pulse2",
      "triangle",
      "sample",
    ]);
    expect(isRecordTarget(authentic, "sample")).toBe(false);
  });
});
