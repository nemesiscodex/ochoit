import type { SongDocument } from "@/features/song/song-document";

export type EngineMode = SongDocument["meta"]["engineMode"];

type PcmModeDefinition = {
  readonly panelLabel: string;
  readonly summary: string;
  readonly arrangementSummary: string;
  readonly arrangementInstructions: string;
};

const pcmModeDefinitions: Record<EngineMode, PcmModeDefinition> = {
  inspired: {
    panelLabel: "Inspired PCM",
    summary:
      "PCM uses one-shot sample triggers with selectable playback rate. Musical note mapping is intentionally off for this mode.",
    arrangementSummary:
      "Inspired mode keeps PCM trigger-based: choose a sample plus playback rate, without musical note mapping.",
    arrangementInstructions:
      "One trigger per line in the format 8: {sampleReference}@1x. Use a sample id or sample name plus an optional playback rate from 0.25x to 4x.",
  },
  authentic: {
    panelLabel: "Authentic DPCM",
    summary:
      "Authentic mode plans a stricter DPCM lane with fixed NES rate presets, converted one-bit sample playback, and no arbitrary playback-rate pitch shifting.",
    arrangementSummary:
      "Authentic mode is planned as a hardware-oriented DPCM lane: fixed NES rate presets, one-shot hits, and no free-rate pitch control.",
    arrangementInstructions:
      "The current text editor still reflects the inspired placeholder format 8: {sampleReference}@1x until dedicated authentic editing ships.",
  },
};

export function formatEngineModeLabel(engineMode: EngineMode) {
  return engineMode === "inspired" ? "Inspired" : "Authentic";
}

export function getPcmModeLabel(engineMode: EngineMode) {
  return pcmModeDefinitions[engineMode].panelLabel;
}

export function getPcmModeSummary(engineMode: EngineMode) {
  return pcmModeDefinitions[engineMode].summary;
}

export function getSampleArrangementHelperCopy(engineMode: EngineMode, loopLength: number, sampleReference: string) {
  const definition = pcmModeDefinitions[engineMode];
  const arrangementInstructions = definition.arrangementInstructions.replaceAll("{sampleReference}", sampleReference);

  return `${definition.arrangementSummary} ${arrangementInstructions} Steps above ${loopLength} are ignored when you apply.`;
}
