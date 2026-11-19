import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createAgent } from "@ui-sdk/react/agent";
import { createDefaultSongDocument, SONG_MAX_SAMPLE_COUNT, type SongDocument } from "ochoit-lib";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SampleDeck } from "@/components/sample-deck";

type SampleAsset = SongDocument["samples"][number];
type SampleDeckProps = ComponentProps<typeof SampleDeck>;

function createSample(overrides: Partial<SampleAsset> = {}): SampleAsset {
  const base = createDefaultSongDocument().samples[0];

  if (base === undefined) {
    throw new Error("Expected the default song to include a sample.");
  }

  return {
    ...base,
    id: "mic-002",
    name: "mic-002",
    baseNote: "C4",
    detectedBaseNote: "A3",
    sampleRate: 10,
    frameCount: 20,
    pcm: Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5)),
    trim: { startFrame: 0, endFrame: 20 },
    ...overrides,
  };
}

function renderDeck(overrides: Partial<SampleDeckProps> = {}) {
  const props: SampleDeckProps = {
    engineMode: "inspired",
    samples: [],
    sample: null,
    selectedSampleId: null,
    recorderErrorMessage: null,
    recorderPermissionState: "granted",
    recorderStatus: "ready",
    recordingDurationMs: 0,
    onDeleteSample: vi.fn(),
    onApplyTrim: vi.fn(),
    onPreviewSample: vi.fn(async () => undefined),
    onMoveTrimWindow: vi.fn(),
    onResizeTrimWindow: vi.fn(),
    onSetSampleBaseNote: vi.fn(),
    onSelectSample: vi.fn(),
    onStartRecording: vi.fn(async () => undefined),
    onStopRecording: vi.fn(),
    ...overrides,
  };

  render(<SampleDeck {...props} />);

  return props;
}

function renderDeckWithClips(overrides: Partial<SampleDeckProps> = {}) {
  const first = createSample({ id: "mic-001", name: "mic-001" });
  const second = createSample();

  return renderDeck({ samples: [first, second], sample: second, selectedSampleId: second.id, ...overrides });
}

function getButton(name: string) {
  const button = screen.getByRole("button", { name });

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected ${name} to be a button.`);
  }

  return button;
}

describe("SampleDeck", () => {
  afterEach(() => {
    cleanup();
  });

  it("invites a first recording when the deck is empty", () => {
    const props = renderDeck();

    expect(screen.getByText(/Record a sound to add your first clip/)).toBeTruthy();
    expect(screen.getByText("0 of 4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preview clip" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();

    fireEvent.click(getButton("Record"));

    expect(props.onStartRecording).toHaveBeenCalledTimes(1);
  });

  it("turns Record into Stop recording while a take runs and locks the editor", () => {
    const props = renderDeckWithClips({ recorderStatus: "recording", recordingDurationMs: 840 });

    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
    expect(screen.getByText("Recording 0.84s of 2.00s. It stops by itself at the limit.")).toBeTruthy();
    expect(getButton("Preview clip").disabled).toBe(true);
    expect(getButton("Apply trim").disabled).toBe(true);
    expect((screen.getByLabelText("Length in frames") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(getButton("Stop recording"));

    expect(props.onStopRecording).toHaveBeenCalledTimes(1);
    expect(props.onStartRecording).not.toHaveBeenCalled();
  });

  it.each([
    { state: "unsupported" as const, status: "idle" as const, alert: /can't record from a microphone/ },
    { state: "denied" as const, status: "idle" as const, alert: /Microphone access is blocked/ },
  ])("explains a $state microphone as an alert", ({ state, status, alert }) => {
    renderDeck({ recorderPermissionState: state, recorderStatus: status });

    expect(screen.getByRole("alert").textContent).toMatch(alert);
  });

  it("shows the recorder's own error message as an alert", () => {
    renderDeck({ recorderStatus: "error", recorderErrorMessage: "No microphone was found for recording." });

    expect(screen.getByRole("alert").textContent).toBe("No microphone was found for recording.");
    expect(getButton("Record").disabled).toBe(false);
  });

  it("disables Record while the browser asks for the microphone or saves a take", () => {
    renderDeck({ recorderPermissionState: "unknown", recorderStatus: "requesting-permission" });

    expect(getButton("Record").disabled).toBe(true);
    expect(screen.getByText("Allow microphone access in the browser prompt to start recording.")).toBeTruthy();

    cleanup();
    renderDeck({ recorderStatus: "processing" });

    expect(getButton("Record").disabled).toBe(true);
    expect(screen.getByText("Saving the clip…")).toBeTruthy();
  });

  it("blocks Record at the clip limit and says how to free a slot", () => {
    const samples = Array.from({ length: SONG_MAX_SAMPLE_COUNT }, (_, index) =>
      createSample({ id: `mic-00${index + 1}`, name: `mic-00${index + 1}` }),
    );

    renderDeck({ samples, sample: samples[0] ?? null, selectedSampleId: samples[0]?.id ?? null });

    expect(getButton("Record").disabled).toBe(true);
    expect(screen.getByText(`Clip limit reached (${SONG_MAX_SAMPLE_COUNT}/${SONG_MAX_SAMPLE_COUNT})`)).toBeTruthy();
    expect(screen.getByText(/Delete a clip before recording another one/)).toBeTruthy();
  });

  it("lists clips newest first, marks the loaded one, and loads or deletes a clip", () => {
    const props = renderDeckWithClips();

    const loadButtons = within(screen.getByRole("list")).getAllByRole("button", { name: /^Load sample/ });

    expect(loadButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Load sample mic-002",
      "Load sample mic-001",
    ]);
    expect(getButton("Load sample mic-002").getAttribute("aria-pressed")).toBe("true");
    expect(getButton("Load sample mic-001").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(getButton("Load sample mic-001"));
    fireEvent.click(getButton("Delete sample mic-002"));

    expect(props.onSelectSample).toHaveBeenCalledWith("mic-001");
    expect(props.onDeleteSample).toHaveBeenCalledWith("mic-002");
  });

  it("keeps a long clip name readable in full where the list shortens it", () => {
    const longName = "Q3 Board Deck — FINAL (revised) v12 [approved by legal]";
    const clip = createSample({ id: "mic-001", name: longName });

    renderDeck({ samples: [clip], sample: clip, selectedSampleId: clip.id });

    const listName = within(screen.getByRole("list")).getByText(longName);

    expect(listName.getAttribute("title")).toBe(longName);
    expect(screen.getByRole("heading", { name: longName }).getAttribute("title")).toBe(longName);
  });

  it("tags each clip with the number its PCM steps show", () => {
    renderDeckWithClips();

    expect(within(getButton("Load sample mic-001")).getByText("#1")).toBeTruthy();
    expect(within(getButton("Load sample mic-002")).getByText("#2")).toBeTruthy();
  });

  it("moves and resizes the trim window from the sliders and the frame fields", () => {
    const sample = createSample({ trim: { startFrame: 4, endFrame: 10 } });
    const props = renderDeck({ samples: [sample], sample, selectedSampleId: sample.id });

    expect(screen.getByText("Frames 4 to 10 of 20")).toBeTruthy();

    const startSlider = screen.getByRole("slider", { name: "Trim start" }) as HTMLInputElement;
    const lengthSlider = screen.getByRole("slider", { name: "Trim length" }) as HTMLInputElement;

    expect(startSlider.value).toBe("4");
    expect(startSlider.max).toBe("14");
    expect(lengthSlider.value).toBe("6");
    expect(lengthSlider.max).toBe("20");

    fireEvent.keyDown(startSlider, { key: "ArrowRight" });
    fireEvent.keyDown(lengthSlider, { key: "ArrowLeft" });
    fireEvent.change(screen.getByLabelText("Start in frames"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Length in frames"), { target: { value: "12" } });

    expect(props.onMoveTrimWindow).toHaveBeenNthCalledWith(1, 5);
    expect(props.onMoveTrimWindow).toHaveBeenNthCalledWith(2, 7);
    expect(props.onResizeTrimWindow).toHaveBeenNthCalledWith(1, 5);
    expect(props.onResizeTrimWindow).toHaveBeenNthCalledWith(2, 12);
  });

  it("applies a trim only when part of the clip is cut", () => {
    const fullSample = createSample();

    renderDeck({ samples: [fullSample], sample: fullSample, selectedSampleId: fullSample.id });

    expect(getButton("Apply trim").disabled).toBe(true);
    expect(screen.getByText("The whole clip plays.")).toBeTruthy();
    expect((screen.getByLabelText("Start in frames") as HTMLInputElement).disabled).toBe(true);

    cleanup();
    const trimmedSample = createSample({ trim: { startFrame: 2, endFrame: 8 } });
    const props = renderDeck({ samples: [trimmedSample], sample: trimmedSample, selectedSampleId: trimmedSample.id });

    fireEvent.click(getButton("Apply trim"));

    expect(props.onApplyTrim).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Keeps only the highlighted part. This can't be undone.")).toBeTruthy();
  });

  it("previews the loaded clip", () => {
    const props = renderDeckWithClips();

    fireEvent.click(getButton("Preview clip"));

    expect(props.onPreviewSample).toHaveBeenCalledTimes(1);
  });

  it("sets the base note from the suggestion and explains it per engine mode", () => {
    const props = renderDeckWithClips();

    expect(screen.getByRole("button", { name: "Sample base note" })).toBeTruthy();
    expect(screen.getByText("PCM steps transpose the clip from this note.")).toBeTruthy();

    fireEvent.click(getButton("Use suggested A3"));

    expect(props.onSetSampleBaseNote).toHaveBeenCalledWith("A3");

    cleanup();
    const matchedSample = createSample({ baseNote: "A3" });
    renderDeck({ samples: [matchedSample], sample: matchedSample, selectedSampleId: matchedSample.id });

    expect(screen.queryByRole("button", { name: "Use suggested A3" })).toBeNull();
    expect(screen.getByText("Matches the suggested note")).toBeTruthy();

    cleanup();
    const quietSample = createSample({ detectedBaseNote: null });
    renderDeck({ engineMode: "authentic", samples: [quietSample], sample: quietSample, selectedSampleId: quietSample.id });

    expect(screen.getByText("No stable note detected")).toBeTruthy();
    expect(screen.getByText(/Authentic mode plays the clip as a one-shot trigger/)).toBeTruthy();
  });
});

describe("SampleDeck for agents", () => {
  let approve = false;
  const agent = createAgent({ allow: (step) => !step.confirm || approve });

  afterEach(() => {
    cleanup();
  });

  it("names every deck control and gates destructive clip actions behind a person", async () => {
    const sample = createSample({ trim: { startFrame: 2, endFrame: 8 } });
    const props = renderDeck({ samples: [sample], sample, selectedSampleId: sample.id });

    const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");

    for (const entry of components) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }

    const labels = components.map((entry) => entry.label);

    for (const label of [
      "Record",
      "Load sample mic-002",
      "Delete sample mic-002",
      "Preview clip",
      "Trim start",
      "Start in frames",
      "Trim length",
      "Length in frames",
      "Apply trim",
      "Use suggested A3",
    ]) {
      expect(labels, `${label} is missing from the snapshot`).toContain(label);
    }

    const resize = await agent.act({ steps: [{ ref: "Length in frames", action: "setValue", args: [4] }] });

    expect(resize.ok, resize.error?.message).toBe(true);
    expect(props.onResizeTrimWindow).toHaveBeenLastCalledWith(4);

    const remove = { steps: [{ ref: "Delete sample mic-002", action: "press" }] };

    expect((await agent.act(remove)).ok).toBe(false);
    expect(props.onDeleteSample).not.toHaveBeenCalled();

    approve = true;

    expect((await agent.act(remove)).ok).toBe(true);
    expect(props.onDeleteSample).toHaveBeenCalledWith("mic-002");
  });
});
