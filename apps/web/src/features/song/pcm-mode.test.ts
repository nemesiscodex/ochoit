import { describe, expect, it } from "vitest";

import { formatEngineModeLabel, getPcmModeLabel, getPcmModeSummary, getSampleArrangementHelperCopy } from "@/features/song/pcm-mode";

describe("pcm-mode", () => {
  it("describes inspired mode as a note-mapped sampler", () => {
    expect(formatEngineModeLabel("inspired")).toBe("Inspired");
    expect(getPcmModeLabel("inspired")).toBe("Inspired Sampler");
    expect(getPcmModeSummary("inspired")).toMatch(/chromatic sampler/i);
    expect(getPcmModeSummary("inspired")).toMatch(/base note/i);

    expect(getSampleArrangementHelperCopy("inspired", 16, "mic-001")).toContain(
      "Use a sample id or sample name plus a target note from C0 to B8.",
    );
  });

  it("defines authentic mode as the trigger-and-rate workflow", () => {
    expect(formatEngineModeLabel("authentic")).toBe("Authentic");
    expect(getPcmModeLabel("authentic")).toBe("Authentic DPCM");
    expect(getPcmModeSummary("authentic")).toMatch(/one-shot workflow/i);
    expect(getPcmModeSummary("authentic")).toMatch(/playback rate/i);

    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "Authentic mode stays trigger-based: choose a sample and optional playback rate, without per-step note mapping.",
    );
    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "One trigger per line in the format 8: vox-hit@1x.",
    );
    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "Steps above 32 are ignored when you apply.",
    );
  });
});
