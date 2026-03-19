import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import { createDefaultSongDocument } from "@/features/song/song-document";

describe("sequencer-matrix", () => {
  it("renders one sequencer row per voice", () => {
    render(
      <SequencerMatrix
        engine={null}
        onToggleTrackMute={() => {}}
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
        song={createDefaultSongDocument()}
        playbackState="stopped"
        nextStep={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mute Pulse I" }));

    expect(onToggleTrackMute).toHaveBeenCalledWith("pulse1");
  });
});
