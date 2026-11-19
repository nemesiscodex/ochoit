import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createAgent } from "@ui-sdk/react/agent";
import type { SongEdit } from "ochoit-lib";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SongMeta } from "@/components/song-meta";

type SongMetaProps = ComponentProps<typeof SongMeta>;

function renderSongMeta(overrides: Partial<SongMetaProps> = {}) {
  const onEdit = vi.fn<(edit: SongEdit) => void>();

  render(
    <SongMeta
      author="Julio"
      bpm={136}
      engineMode="inspired"
      engineState="running"
      loopLength={16}
      name="Boss Theme"
      onEdit={onEdit}
      trackCount={5}
      {...overrides}
    />,
  );

  return onEdit;
}

function getInput(label: string) {
  const input = screen.getByLabelText(label);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected ${label} to be an input.`);
  }

  return input;
}

describe("SongMeta", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits the song name and author through labelled fields capped at 80 characters", () => {
    const onEdit = renderSongMeta();
    const nameInput = getInput("Song name");
    const authorInput = getInput("Author");

    expect(nameInput.value).toBe("Boss Theme");
    expect(nameInput.maxLength).toBe(80);
    expect(authorInput.value).toBe("Julio");
    expect(authorInput.maxLength).toBe(80);

    fireEvent.change(nameInput, { target: { value: "Night Drive" } });
    fireEvent.change(authorInput, { target: { value: "Ana" } });

    expect(onEdit).toHaveBeenNthCalledWith(1, { type: "set-song-name", name: "Night Drive" });
    expect(onEdit).toHaveBeenNthCalledWith(2, { type: "set-song-author", author: "Ana" });
  });

  it("switches the engine mode by click and by arrow key", () => {
    const onEdit = renderSongMeta();
    const inspired = screen.getByRole("radio", { name: "Inspired" });
    const authentic = screen.getByRole("radio", { name: "Authentic" });

    expect(screen.getByRole("radiogroup", { name: "Engine mode" })).toBeTruthy();
    expect(inspired.getAttribute("aria-checked")).toBe("true");
    expect(authentic.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(authentic);
    fireEvent.keyDown(inspired, { key: "ArrowRight" });

    expect(onEdit).toHaveBeenNthCalledWith(1, { type: "set-engine-mode", engineMode: "authentic" });
    expect(onEdit).toHaveBeenNthCalledWith(2, { type: "set-engine-mode", engineMode: "authentic" });
  });

  it("describes the PCM behavior of the current engine mode", () => {
    renderSongMeta();

    expect(screen.getByText("Inspired Sampler")).toBeTruthy();
    expect(screen.getByText(/every clip gets a base note/i)).toBeTruthy();

    cleanup();
    renderSongMeta({ engineMode: "authentic" });

    expect(screen.getByRole("radio", { name: "Authentic" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Authentic DPCM")).toBeTruthy();
    expect(screen.getByText(/one-bit delta-encoded audio/i)).toBeTruthy();
  });

  it("leaves tempo, loop length, voice count and audio state to the band", () => {
    renderSongMeta();

    expect(screen.queryByText(/bpm/i)).toBeNull();
    expect(screen.queryByText(/16 steps/i)).toBeNull();
    expect(screen.queryByText("running")).toBeNull();
  });
});

describe("SongMeta for agents", () => {
  const agent = createAgent();

  afterEach(() => {
    cleanup();
  });

  it("lets an agent find and change every song setting", async () => {
    const onEdit = renderSongMeta();
    const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");

    for (const entry of components) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }

    const labels = components.map((entry) => entry.label);

    for (const label of ["Song name", "Author", "Engine mode"]) {
      expect(labels, `${label} is missing from the snapshot`).toContain(label);
    }

    const result = await agent.act({
      steps: [
        { ref: "Song name", action: "setValue", args: ["Agent Tune"] },
        { ref: "Engine mode", action: "setValue", args: ["authentic"] },
      ],
    });

    expect(result.ok, result.error?.message).toBe(true);
    expect(onEdit).toHaveBeenCalledWith({ type: "set-song-name", name: "Agent Tune" });
    expect(onEdit).toHaveBeenCalledWith({ type: "set-engine-mode", engineMode: "authentic" });
  });
});
