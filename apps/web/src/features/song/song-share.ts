import { deflateRaw, inflateRaw } from "pako";

import {
  DEFAULT_PULSE_DUTY,
  createEmptySongDocument,
  createDefaultSongDocument,
  parseSongDocument,
  type NoiseTrack,
  type PulseTrack,
  type SampleTrack,
  type SerializedSampleAsset,
  type SongDocument,
  type TriangleTrack,
} from "@/features/song/song-document";
import {
  formatNoiseConfigLabel,
  formatPulseDutyLabel,
  getMelodicArrangementEntries,
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  type MelodicArrangementEntry,
  type MelodicTrackId,
} from "@/features/song/song-pattern";

export const SONG_SHARE_HASH_KEY = "song";

const SHARE_FORMAT_VERSION = 3;
const SHARE_PAYLOAD_PREFIX = `v${SHARE_FORMAT_VERSION}.`;
const shareLineBreak = "\n";
const sampleLinePrefix = "$";
const defaultSharedMeta = createEmptySongDocument().meta;

const trackIdBySectionNumber = {
  1: "pulse1",
  2: "pulse2",
  3: "triangle",
  4: "noise",
  5: "sample",
} as const satisfies Record<number, SongDocument["tracks"][keyof SongDocument["tracks"]]["id"]>;

const sectionNumberByTrackId: Record<SongDocument["tracks"][keyof SongDocument["tracks"]]["id"], number> = {
  pulse1: 1,
  pulse2: 2,
  triangle: 3,
  noise: 4,
  sample: 5,
};

type ShareTrackId = keyof typeof sectionNumberByTrackId;

type ShareTrackSection = {
  volume: number;
  muted: boolean;
  arrangementLines: string[];
};

type ParsedShareHeader = {
  author: string;
  bpm: number;
  createdAt: string;
  engineMode: SongDocument["meta"]["engineMode"];
  loopLength: number;
  masterVolume: number;
  oldSpeakerMode: boolean;
  name: string;
  stepsPerBeat: number;
  updatedAt: string;
};

export type SongShareLoadResult =
  | {
      status: "empty";
    }
  | {
      status: "invalid";
      error: string;
    }
  | {
      status: "loaded";
      song: SongDocument;
    };

export function serializeSongSharePayload(song: SongDocument) {
  const compactText = serializeSongShareText(song);
  const compressedBytes = deflateRaw(new TextEncoder().encode(compactText));

  return `${SHARE_PAYLOAD_PREFIX}${encodeBase64Url(compressedBytes)}`;
}

export function parseSongSharePayload(payload: string) {
  const compressedPayloadMatch = /^v(\d+)\.(.+)$/u.exec(payload);

  if (compressedPayloadMatch !== null) {
    const compressedPayload = compressedPayloadMatch[2] ?? "";
    const compressedBytes = decodeBase64UrlToBytes(compressedPayload);
    const compactText = new TextDecoder().decode(inflateRaw(compressedBytes));

    return parseSongShareText(compactText);
  }

  // Backward compatibility with the original base64url(JSON.stringify(song)) links.
  return parseSongDocument(JSON.parse(decodeBase64UrlToText(payload)));
}

export function readSongShareFromHash(hash: string): SongShareLoadResult {
  const payload = readSongSharePayloadFromHash(hash);

  if (payload === null || payload.length === 0) {
    return { status: "empty" };
  }

  try {
    return {
      status: "loaded",
      song: parseSongSharePayload(payload),
    };
  } catch {
    return {
      status: "invalid",
      error: "The shared song link is invalid or no longer matches the current song format.",
    };
  }
}

export function buildSongShareUrl(currentUrl: string, song: SongDocument) {
  return buildSongShareUrlFromPayload(currentUrl, serializeSongSharePayload(song));
}

export function buildSongShareUrlFromPayload(currentUrl: string, payload: string) {
  const url = new URL(currentUrl);

  url.hash = `${SONG_SHARE_HASH_KEY}=${payload}`;

  return url.toString();
}

export function readSongSharePayloadFromHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalizedHash);

  return params.get(SONG_SHARE_HASH_KEY);
}

export function serializeSongShareText(song: SongDocument) {
  const lines = [
    serializeHeader(song),
    serializeMelodicSection(song.tracks.pulse1, "pulse1"),
    serializeMelodicSection(song.tracks.pulse2, "pulse2"),
    serializeMelodicSection(song.tracks.triangle, "triangle"),
    serializeNoiseSection(song.tracks.noise),
    serializeSampleSection(song.tracks.sample, song.meta.engineMode),
    ...song.samples.map((sample) => serializeSampleAsset(sample)),
  ];

  return lines.join(shareLineBreak);
}

export function parseSongShareText(input: string) {
  const defaultSong = createDefaultSongDocument();
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerLine = lines[0];

  if (headerLine === undefined || !headerLine.startsWith("!")) {
    throw new Error("Missing share header.");
  }

  const header = parseHeader(headerLine);
  const trackSections = createDefaultTrackSections(defaultSong);
  const sampleLines: string[] = [];
  let activeTrackId: ShareTrackId | null = null;

  for (const line of lines.slice(1)) {
    if (line.startsWith("=")) {
      const parsedSectionHeader = parseTrackSectionHeader(line, trackSections);
      trackSections[parsedSectionHeader.trackId] = {
        ...trackSections[parsedSectionHeader.trackId],
        volume: parsedSectionHeader.volume,
        muted: parsedSectionHeader.muted,
      };
      activeTrackId = parsedSectionHeader.trackId;
      continue;
    }

    if (line.startsWith(sampleLinePrefix)) {
      sampleLines.push(line);
      activeTrackId = null;
      continue;
    }

    if (activeTrackId === null) {
      throw new Error("Found an arrangement line outside of a track section.");
    }

    trackSections[activeTrackId].arrangementLines.push(line);
  }

  const samples = sampleLines.map((line) => parseSampleAsset(line));
  const loopLength = header.loopLength;
  const sharedSong = {
    kind: defaultSong.kind,
    version: defaultSong.version,
    meta: {
      name: header.name,
      author: header.author,
      createdAt: header.createdAt,
      updatedAt: header.updatedAt,
      engineMode: header.engineMode,
    },
    transport: {
      bpm: header.bpm,
      stepsPerBeat: header.stepsPerBeat,
      loopLength,
    },
    mixer: {
      masterVolume: header.masterVolume,
      oldSpeakerMode: header.oldSpeakerMode,
    },
    tracks: {
      pulse1: buildSharedPulseTrack(defaultSong.tracks.pulse1, trackSections.pulse1, loopLength, "pulse1"),
      pulse2: buildSharedPulseTrack(defaultSong.tracks.pulse2, trackSections.pulse2, loopLength, "pulse2"),
      triangle: buildSharedTriangleTrack(defaultSong.tracks.triangle, trackSections.triangle, loopLength),
      noise: buildSharedNoiseTrack(defaultSong.tracks.noise, trackSections.noise, loopLength),
      sample: buildSharedSampleTrack(defaultSong.tracks.sample, trackSections.sample, loopLength, samples),
    },
    samples,
  } satisfies SongDocument;

  return parseSongDocument(sharedSong);
}

function serializeHeader(song: SongDocument) {
  const modeToken = song.meta.engineMode === "inspired" ? "i" : "a";

  return [
    `!v=${SHARE_FORMAT_VERSION}`,
    `bpm=${song.transport.bpm}`,
    `loop=${song.transport.loopLength}`,
    `spb=${song.transport.stepsPerBeat}`,
    `mode=${modeToken}`,
    `mv=${formatLevelPercent(song.mixer.masterVolume)}`,
    `spk=${song.mixer.oldSpeakerMode ? "1" : "0"}`,
    `name=${encodeURIComponent(song.meta.name)}`,
    `author=${encodeURIComponent(song.meta.author)}`,
    `created=${song.meta.createdAt}`,
    `updated=${song.meta.updatedAt}`,
  ].join(";");
}

function serializeMelodicSection(
  track: PulseTrack | TriangleTrack,
  trackId: "pulse1" | "pulse2" | "triangle",
) {
  const header = serializeTrackSectionHeader(trackId, track.volume, track.muted);
  const arrangementLines = getMelodicArrangementEntries(track).map((entry) => {
    const step = track.steps[entry.stepIndex];
    const stepRange =
      entry.length === 1 ? `${entry.stepIndex + 1}` : `${entry.stepIndex + 1}-${entry.stepIndex + entry.length}`;
    const dutySuffix =
      track.kind === "pulse" && (entry.duty ?? DEFAULT_PULSE_DUTY) !== DEFAULT_PULSE_DUTY
        ? `@${formatPulseDutyLabel(entry.duty ?? DEFAULT_PULSE_DUTY)}`
        : "";
    const volumeSuffix = formatStepVolumeSuffix(step?.volume ?? track.volume, track.volume);

    return `${stepRange}:${entry.note}${dutySuffix}${volumeSuffix}`;
  });

  return [header, ...arrangementLines].join(shareLineBreak);
}

function serializeNoiseSection(track: NoiseTrack) {
  const header = serializeTrackSectionHeader("noise", track.volume, track.muted);
  const arrangementLines = track.steps.flatMap((step, index) => {
    if (!step.enabled) {
      return [];
    }

    return `${index + 1}:${formatNoiseConfigLabel(step.mode, step.periodIndex)}${formatStepVolumeSuffix(step.volume, track.volume)}`;
  });

  return [header, ...arrangementLines].join(shareLineBreak);
}

function serializeSampleSection(track: SampleTrack, engineMode: SongDocument["meta"]["engineMode"]) {
  const header = serializeTrackSectionHeader("sample", track.volume, track.muted);
  const arrangementLines = track.steps.flatMap((step, index) => {
    if (!step.enabled || step.sampleId === null) {
      return [];
    }

    if (engineMode === "inspired") {
      return `${index + 1}:${step.sampleId}>${step.note}${formatStepVolumeSuffix(step.volume, track.volume)}`;
    }

    const rateSuffix = approximatelyEqual(step.playbackRate, 1) ? "" : `@${formatCompactNumber(step.playbackRate)}`;

    return `${index + 1}:${step.sampleId}${rateSuffix}${formatStepVolumeSuffix(step.volume, track.volume)}`;
  });

  return [header, ...arrangementLines].join(shareLineBreak);
}

function serializeTrackSectionHeader(trackId: ShareTrackId, volume: number, muted: boolean) {
  return `=${sectionNumberByTrackId[trackId]};vol=${formatLevelPercent(volume)};mute=${muted ? "1" : "0"}`;
}

function serializeSampleAsset(sample: SerializedSampleAsset) {
  const pcmBytes = quantizeSamplePcm(sample.pcm);

  return `${sampleLinePrefix}${encodeURIComponent(sample.id)}|${encodeURIComponent(sample.name)}|${
    sample.source === "mic" ? "m" : "i"
  }|${encodeURIComponent(sample.baseNote)}|${encodeURIComponent(sample.detectedBaseNote ?? "")}|${sample.sampleRate}|${sample.trim.startFrame}|${sample.trim.endFrame}|${encodeBase64Url(pcmBytes)}`;
}

function createDefaultTrackSections(defaultSong: SongDocument): Record<ShareTrackId, ShareTrackSection> {
  return {
    pulse1: {
      volume: defaultSong.tracks.pulse1.volume,
      muted: defaultSong.tracks.pulse1.muted,
      arrangementLines: [],
    },
    pulse2: {
      volume: defaultSong.tracks.pulse2.volume,
      muted: defaultSong.tracks.pulse2.muted,
      arrangementLines: [],
    },
    triangle: {
      volume: defaultSong.tracks.triangle.volume,
      muted: defaultSong.tracks.triangle.muted,
      arrangementLines: [],
    },
    noise: {
      volume: defaultSong.tracks.noise.volume,
      muted: defaultSong.tracks.noise.muted,
      arrangementLines: [],
    },
    sample: {
      volume: defaultSong.tracks.sample.volume,
      muted: defaultSong.tracks.sample.muted,
      arrangementLines: [],
    },
  };
}

function parseHeader(line: string): ParsedShareHeader {
  const headerEntries = parseSemicolonEntries(line.slice(1));
  const version = getRequiredEntry(headerEntries, "v");

  if (version !== "2" && version !== SHARE_FORMAT_VERSION.toString()) {
    throw new Error("Unsupported share format version.");
  }

  const modeToken = getRequiredEntry(headerEntries, "mode");

  return {
    author: decodeURIComponent(getOptionalEntry(headerEntries, "author") ?? "Julio"),
    bpm: parseIntegerValue(getRequiredEntry(headerEntries, "bpm"), "bpm"),
    createdAt: getOptionalEntry(headerEntries, "created") ?? defaultSharedMeta.createdAt,
    engineMode: modeToken === "a" ? "authentic" : "inspired",
    loopLength: parseIntegerValue(getRequiredEntry(headerEntries, "loop"), "loop"),
    masterVolume: parseLevelPercent(getOptionalEntry(headerEntries, "mv") ?? "88", "mv"),
    oldSpeakerMode: (getOptionalEntry(headerEntries, "spk") ?? "0") === "1",
    name: decodeURIComponent(getOptionalEntry(headerEntries, "name") ?? "Shared Song"),
    stepsPerBeat: parseIntegerValue(getOptionalEntry(headerEntries, "spb") ?? "4", "spb"),
    updatedAt: getOptionalEntry(headerEntries, "updated") ?? defaultSharedMeta.updatedAt,
  };
}

function parseTrackSectionHeader(
  line: string,
  trackSections: Record<ShareTrackId, ShareTrackSection>,
): { trackId: ShareTrackId; volume: number; muted: boolean } {
  const [rawSectionNumber, ...rawSettingEntries] = line.slice(1).split(";");
  const sectionNumber = Number(rawSectionNumber);
  const trackId = trackIdBySectionNumber[sectionNumber as keyof typeof trackIdBySectionNumber];

  if (trackId === undefined) {
    throw new Error("Unknown track section.");
  }

  const settings = parseSemicolonEntries(rawSettingEntries.join(";"));
  const fallbackSection = trackSections[trackId];

  return {
    trackId,
    volume: parseLevelPercent(getOptionalEntry(settings, "vol") ?? formatLevelPercent(fallbackSection.volume), "vol"),
    muted: (getOptionalEntry(settings, "mute") ?? "0") === "1",
  };
}

function buildSharedPulseTrack(
  defaultTrack: PulseTrack,
  section: ShareTrackSection,
  loopLength: number,
  trackId: Extract<MelodicTrackId, "pulse1" | "pulse2">,
) {
  const parsedLines = section.arrangementLines.map((line) => parseLineVolumeSuffix(line, section.volume));
  const arrangementInput = parsedLines.map((entry) => entry.content).join(shareLineBreak);
  const parsedArrangement = parseMelodicTrackArrangement(arrangementInput, loopLength, trackId);

  if (!parsedArrangement.ok) {
    throw new Error(parsedArrangement.error);
  }

  const stepVolumeByStepIndex = new Map(parsedLines.map((entry) => [entry.stepIndex, entry.volume]));
  const normalizedEntries = normalizeMelodicEntries(parsedArrangement.entries, loopLength);

  return {
    ...defaultTrack,
    muted: section.muted,
    solo: false,
    volume: section.volume,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const entry = normalizedEntries.find((candidate) => candidate.stepIndex === index);

      return {
        enabled: entry !== undefined,
        note: entry?.note ?? "C4",
        volume: entry === undefined ? section.volume : (stepVolumeByStepIndex.get(index) ?? section.volume),
        duty: entry?.duty ?? DEFAULT_PULSE_DUTY,
        length: entry?.length ?? 1,
      };
    }),
  };
}

function buildSharedTriangleTrack(defaultTrack: TriangleTrack, section: ShareTrackSection, loopLength: number) {
  const parsedLines = section.arrangementLines.map((line) => parseLineVolumeSuffix(line, section.volume));
  const arrangementInput = parsedLines.map((entry) => entry.content).join(shareLineBreak);
  const parsedArrangement = parseMelodicTrackArrangement(arrangementInput, loopLength, "triangle");

  if (!parsedArrangement.ok) {
    throw new Error(parsedArrangement.error);
  }

  const stepVolumeByStepIndex = new Map(parsedLines.map((entry) => [entry.stepIndex, entry.volume]));
  const normalizedEntries = normalizeMelodicEntries(parsedArrangement.entries, loopLength);

  return {
    ...defaultTrack,
    muted: section.muted,
    solo: false,
    volume: section.volume,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const entry = normalizedEntries.find((candidate) => candidate.stepIndex === index);

      return {
        enabled: entry !== undefined,
        note: entry?.note ?? "C3",
        volume: entry === undefined ? section.volume : (stepVolumeByStepIndex.get(index) ?? section.volume),
        length: entry?.length ?? 1,
      };
    }),
  };
}

function buildSharedNoiseTrack(defaultTrack: NoiseTrack, section: ShareTrackSection, loopLength: number) {
  const parsedLines = section.arrangementLines.map((line) => parseLineVolumeSuffix(line, section.volume));
  const arrangementInput = parsedLines.map((entry) => entry.content).join(shareLineBreak);
  const parsedArrangement = parseNoiseTrackArrangement(arrangementInput, loopLength);

  if (!parsedArrangement.ok) {
    throw new Error(parsedArrangement.error);
  }

  const entriesByStep = new Map(parsedArrangement.entries.map((entry) => [entry.stepIndex, entry]));
  const stepVolumeByStepIndex = new Map(parsedLines.map((entry) => [entry.stepIndex, entry.volume]));

  return {
    ...defaultTrack,
    muted: section.muted,
    solo: false,
    volume: section.volume,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const entry = entriesByStep.get(index);

      return {
        enabled: entry !== undefined,
        volume: entry === undefined ? section.volume : (stepVolumeByStepIndex.get(index) ?? section.volume),
        mode: entry?.mode ?? "long",
        periodIndex: entry?.periodIndex ?? 8,
      };
    }),
  };
}

function buildSharedSampleTrack(
  defaultTrack: SampleTrack,
  section: ShareTrackSection,
  loopLength: number,
  samples: readonly SerializedSampleAsset[],
) {
  const parsedLines = section.arrangementLines.map((line) => parseLineVolumeSuffix(line, section.volume));
  const arrangementInput = parsedLines.map((entry) => entry.content).join(shareLineBreak);
  const parsedArrangement = parseSampleTrackArrangement(arrangementInput, loopLength, samples);

  if (!parsedArrangement.ok) {
    throw new Error(parsedArrangement.error);
  }

  const entriesByStep = new Map(parsedArrangement.entries.map((entry) => [entry.stepIndex, entry]));
  const stepVolumeByStepIndex = new Map(parsedLines.map((entry) => [entry.stepIndex, entry.volume]));

  return {
    ...defaultTrack,
    muted: section.muted,
    solo: false,
    volume: section.volume,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const entry = entriesByStep.get(index);

      return {
        enabled: entry !== undefined,
        volume: entry === undefined ? section.volume : (stepVolumeByStepIndex.get(index) ?? section.volume),
        sampleId: entry?.sampleId ?? null,
        note: entry?.note ?? "C4",
        playbackRate: entry?.playbackRate ?? 1,
      };
    }),
  };
}

function parseSampleAsset(line: string): SerializedSampleAsset {
  const fields = line.slice(sampleLinePrefix.length).split("|");

  if (fields.length !== 7 && fields.length !== 9) {
    throw new Error("Invalid sample entry.");
  }

  const hasPitchMetadata = fields.length === 9;
  const [
    rawId,
    rawName,
    rawSource,
    rawBaseNote,
    rawDetectedBaseNote,
    rawSampleRate,
    rawTrimStart,
    rawTrimEnd,
    rawPcm,
  ] = hasPitchMetadata
    ? fields
    : [fields[0], fields[1], fields[2], "C4", "", fields[3], fields[4], fields[5], fields[6]];
  const pcm = dequantizeSamplePcm(decodeBase64UrlToBytes(rawPcm ?? ""));

  return {
    id: decodeURIComponent(rawId ?? ""),
    name: decodeURIComponent(rawName ?? ""),
    source: rawSource === "i" ? "import" : "mic",
    baseNote: decodeURIComponent(rawBaseNote ?? "C4"),
    detectedBaseNote: (decodeURIComponent(rawDetectedBaseNote ?? "") || null) as SerializedSampleAsset["detectedBaseNote"],
    sampleRate: parseIntegerValue(rawSampleRate ?? "", "sampleRate"),
    frameCount: pcm.length,
    channels: 1,
    trim: {
      startFrame: parseIntegerValue(rawTrimStart ?? "", "trim start"),
      endFrame: parseIntegerValue(rawTrimEnd ?? "", "trim end"),
    },
    pcm,
  };
}

function parseLineVolumeSuffix(line: string, fallbackVolume: number) {
  const separatorIndex = line.lastIndexOf("~");

  if (separatorIndex === -1) {
    return {
      content: line,
      stepIndex: parseArrangementStepIndex(line),
      volume: fallbackVolume,
    };
  }

  const content = line.slice(0, separatorIndex).trim();
  const rawVolume = line.slice(separatorIndex + 1).trim();

  return {
    content,
    stepIndex: parseArrangementStepIndex(content),
    volume: parseLevelPercent(rawVolume, "step volume"),
  };
}

function parseArrangementStepIndex(line: string) {
  const [rawStepRange] = line.split(":", 1);
  const [rawStepNumber] = (rawStepRange ?? "").split("-", 1);
  const stepNumber = parseIntegerValue(rawStepNumber ?? "", "step");

  return stepNumber - 1;
}

function normalizeMelodicEntries(entries: readonly MelodicArrangementEntry[], loopLength: number) {
  const dedupedEntries = Array.from(new Map(entries.map((entry) => [entry.stepIndex, entry])).values()).sort(
    (left, right) => left.stepIndex - right.stepIndex,
  );

  return dedupedEntries.map((entry, index) => {
    const nextStartIndex = dedupedEntries[index + 1]?.stepIndex ?? loopLength;
    const maxLength = Math.min(loopLength - entry.stepIndex, nextStartIndex - entry.stepIndex);

    return {
      ...entry,
      length: Math.max(1, Math.min(Math.round(entry.length), maxLength)),
    };
  });
}

function parseSemicolonEntries(input: string) {
  const entries = new Map<string, string>();

  input
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .forEach((segment) => {
      const separatorIndex = segment.indexOf("=");

      if (separatorIndex === -1) {
        return;
      }

      const key = segment.slice(0, separatorIndex).trim();
      const value = segment.slice(separatorIndex + 1).trim();

      entries.set(key, value);
    });

  return entries;
}

function getRequiredEntry(entries: Map<string, string>, key: string) {
  const value = entries.get(key);

  if (value === undefined) {
    throw new Error(`Missing "${key}" in share payload.`);
  }

  return value;
}

function getOptionalEntry(entries: Map<string, string>, key: string) {
  return entries.get(key);
}

function parseIntegerValue(rawValue: string, label: string) {
  const value = Number(rawValue);

  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${label} value.`);
  }

  return value;
}

function parseLevelPercent(rawValue: string, label: string) {
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${label} value.`);
  }

  return value / 100;
}

function formatLevelPercent(level: number) {
  return formatCompactNumber(level * 100);
}

function formatStepVolumeSuffix(stepVolume: number, trackVolume: number) {
  return approximatelyEqual(stepVolume, trackVolume) ? "" : `~${formatLevelPercent(stepVolume)}`;
}

function formatCompactNumber(value: number) {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

function quantizeSamplePcm(pcm: readonly number[]) {
  const signedBytes = Int8Array.from(pcm, (sample) => clampQuantizedSample(Math.round(clampSampleValue(sample) * 127)));

  return new Uint8Array(signedBytes.buffer.slice(0));
}

function dequantizeSamplePcm(bytes: Uint8Array) {
  const signedBytes = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return Array.from(signedBytes, (sample) => (sample === -128 ? -1 : sample / 127));
}

function clampSampleValue(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function clampQuantizedSample(value: number) {
  return Math.max(-128, Math.min(127, value));
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.000_001;
}

function encodeBase64Url(value: Uint8Array) {
  const encoded = encodeBase64(value);

  return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const requiredPadding = (4 - (normalized.length % 4)) % 4;

  return decodeBase64(`${normalized}${"=".repeat(requiredPadding)}`);
}

function decodeBase64UrlToText(value: string) {
  return new TextDecoder().decode(decodeBase64UrlToBytes(value));
}

function encodeBase64(value: Uint8Array) {
  let binary = "";

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
