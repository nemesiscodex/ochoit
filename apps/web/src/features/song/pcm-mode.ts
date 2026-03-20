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
    panelLabel: "Inspired Sampler",
    summary:
      "Inspired mode turns the PCM lane into a chromatic sampler: every clip gets a base note and each step can transpose it with the note picker.",
    arrangementSummary:
      "Inspired mode is note-based: choose a sample, set its base note, then place target notes on the PCM lane.",
    arrangementInstructions:
      'One trigger per line in the format 8: {sampleReference}>C5. Use a sample id or sample name plus a target note from C0 to B8. If you omit the ">note" suffix, the sample uses its saved base note.',
  },
  authentic: {
    panelLabel: "Authentic DPCM",
    summary:
      "Authentic mode keeps the PCM lane closer to the original one-shot workflow: choose a clip and trigger it at a playback rate.",
    arrangementSummary:
      "Authentic mode stays trigger-based: choose a sample and optional playback rate, without per-step note mapping.",
    arrangementInstructions:
      "One trigger per line in the format 8: {sampleReference}@1x. Use a sample id or sample name plus an optional playback rate from 0.25x to 4x.",
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
