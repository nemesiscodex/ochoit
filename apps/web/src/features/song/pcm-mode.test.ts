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

  it("defines authentic mode as the DPCM trigger workflow", () => {
    expect(formatEngineModeLabel("authentic")).toBe("Authentic");
    expect(getPcmModeLabel("authentic")).toBe("Authentic DPCM");
    expect(getPcmModeSummary("authentic")).toMatch(/one-bit delta-encoded/i);
    expect(getPcmModeSummary("authentic")).toMatch(/rate preset/i);

    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "Authentic mode stays trigger-based: choose a sample and optional DPCM rate preset, without per-step note mapping.",
    );
    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "One trigger per line in the format 8: vox-hit@11186hz.",
    );
    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "Steps above 32 are ignored when you apply.",
    );
  });
});
