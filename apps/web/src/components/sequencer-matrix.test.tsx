import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import type { AudioEngine } from "@/features/audio/audio-engine";
import { createDefaultSongDocument } from "@/features/song/song-document";

describe("sequencer-matrix", () => {
  it("renders one sequencer row per voice", () => {
    render(
      <SequencerMatrix
        engine={null}
        onToggleTrackMute={() => {}}
        onUpdateMelodicStep={() => {}}
        song={createDefaultSongDocument()}
        playbackState="stopped"
        nextStep={0}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pulse I" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pulse II" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triangle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Noise" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PCM" })).toBeTruthy();
  });

  it("highlights the current playback step across the ruler and all rows", () => {
    const { container } = render(
      <SequencerMatrix
        engine={null}
        onToggleTrackMute={() => {}}
        onUpdateMelodicStep={() => {}}
        song={createDefaultSongDocument()}
        playbackState="playing"
        nextStep={4}
      />,
    );

    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(6);
    expect(screen.getByLabelText("Pulse I step 5").getAttribute("aria-current")).toBe("step");
    expect(screen.getByLabelText("PCM step 5").getAttribute("aria-current")).toBe("step");
  });

  it("calls the mute toggle callback for a specific voice", () => {
    const onToggleTrackMute = vi.fn();

    render(
      <SequencerMatrix
        engine={null}
        onToggleTrackMute={onToggleTrackMute}
        onUpdateMelodicStep={() => {}}
        song={createDefaultSongDocument()}
        playbackState="stopped"
        nextStep={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mute Pulse I" }));

    expect(onToggleTrackMute).toHaveBeenCalledWith("pulse1");
  });

  it("calls the melodic step update callback for pulse and triangle note editing", () => {
    const onUpdateMelodicStep = vi.fn();

    render(
      <SequencerMatrix
        engine={null}
        onToggleTrackMute={() => {}}
        onUpdateMelodicStep={onUpdateMelodicStep}
        song={createDefaultSongDocument()}
        playbackState="stopped"
        nextStep={0}
      />,
    );

    // Disable Pulse I step 1 (it starts enabled)
    fireEvent.click(screen.getByRole("button", { name: "Disable Pulse I step 1" }));

    // Open note picker for Triangle step 1 and select D3
    fireEvent.click(screen.getByLabelText("Triangle step 1 note"));
    fireEvent.click(screen.getByRole("button", { name: "Select note D3" }));

    expect(onUpdateMelodicStep).toHaveBeenNthCalledWith(1, "pulse1", 0, { enabled: false });
    expect(onUpdateMelodicStep).toHaveBeenNthCalledWith(2, "triangle", 0, { note: "D3" });
  });

  it("passes the hovered melodic track to the audio preview", () => {
    const previewNote = vi.fn();
    const engine = {
      getWaveform: vi.fn(() => new Uint8Array([128])),
      previewNote,
    } as unknown as AudioEngine;

    render(
      <SequencerMatrix
        engine={engine}
        onToggleTrackMute={() => {}}
        onUpdateMelodicStep={() => {}}
        song={createDefaultSongDocument()}
        playbackState="stopped"
        nextStep={0}
      />,
    );

    fireEvent.click(screen.getByLabelText("Triangle step 1 note"));
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Select note D3" }));

    expect(previewNote).toHaveBeenCalledWith("triangle", "D3");
  });
});
