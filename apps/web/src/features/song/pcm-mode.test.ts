import { describe, expect, it } from "vitest";

import { formatEngineModeLabel, getPcmModeLabel, getPcmModeSummary, getSampleArrangementHelperCopy } from "@/features/song/pcm-mode";

describe("pcm-mode", () => {
  it("describes inspired mode as trigger-plus-rate PCM", () => {
    expect(formatEngineModeLabel("inspired")).toBe("Inspired");
    expect(getPcmModeLabel("inspired")).toBe("Inspired PCM");
    expect(getPcmModeSummary("inspired")).toMatch(/one-shot sample triggers with selectable playback rate/i);

    expect(getSampleArrangementHelperCopy("inspired", 16, "mic-001")).toContain(
      "Use a sample id or sample name plus an optional playback rate from 0.25x to 4x.",
    );
  });

  it("defines authentic mode as fixed-rate DPCM with hardware-oriented constraints", () => {
    expect(formatEngineModeLabel("authentic")).toBe("Authentic");
    expect(getPcmModeLabel("authentic")).toBe("Authentic DPCM");
    expect(getPcmModeSummary("authentic")).toMatch(/fixed NES rate presets/i);
    expect(getPcmModeSummary("authentic")).toMatch(/one-bit sample playback/i);

    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "fixed NES rate presets, one-shot hits, and no free-rate pitch control.",
    );
    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "The current text editor still reflects the inspired placeholder format 8: vox-hit@1x until dedicated authentic editing ships.",
    );
    expect(getSampleArrangementHelperCopy("authentic", 32, "vox-hit")).toContain(
      "Steps above 32 are ignored when you apply.",
    );
  });
});
