import { deflateRaw, inflateRaw } from "pako";
import { defaultDpcmRate, normalizeDpcmRate } from "./dpcm";

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
} from "./song-document";
import {
  formatNoiseConfigLabel,
  formatPulseDutyLabel,
  getMelodicArrangementEntries,
  getNoiseTriggerPresetForStep,
  noteEntryOptions,
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  pulseDutyOptions,
  sampleDpcmRateOptions,
  type MelodicArrangementEntry,
  type MelodicTrackId,
  type NoteValue,
} from "./song-pattern";

export const SONG_SHARE_HASH_KEY = "song";

const SHARE_FORMAT_VERSION = 4;
const LEGACY_COMPRESSED_SHARE_FORMAT_VERSION = 3;
const SHARE_PAYLOAD_PREFIX = `v${SHARE_FORMAT_VERSION}.`;
const shareLineBreak = "\n";
const sampleLinePrefix = "$";
const defaultSharedMeta = createEmptySongDocument().meta;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const noteIndexByValue = new Map<NoteValue, number>(noteEntryOptions.map((note, index) => [note, index]));
const pulseDutyIndexByValue = new Map<PulseTrack["steps"][number]["duty"], number>(
  pulseDutyOptions.map((duty, index) => [duty, index]),
);
const samplePlaybackRateIndexByValue = new Map<number, number>(
  sampleDpcmRateOptions.map((playbackRate, index) => [playbackRate, index]),
);

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

type BinaryTrackState = Pick<PulseTrack | TriangleTrack | NoiseTrack | SampleTrack, "volume" | "muted">;

class ByteWriter {
  private readonly bytes: number[] = [];

  writeByte(value: number) {
    this.bytes.push(value & 0xff);
  }

  writeBytes(values: Uint8Array) {
    values.forEach((value) => {
      this.bytes.push(value);
    });
  }

  writeVarUint(value: number) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Expected a non-negative integer for varint encoding.");
    }

    let remaining = value;

    do {
      let currentByte = remaining & 0x7f;
      remaining >>>= 7;

      if (remaining > 0) {
        currentByte |= 0x80;
      }

      this.writeByte(currentByte);
    } while (remaining > 0);
  }

  writeString(value: string) {
    const bytes = textEncoder.encode(value);
    this.writeVarUint(bytes.length);
    this.writeBytes(bytes);
  }

  toUint8Array() {
    return Uint8Array.from(this.bytes);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readByte() {
    const value = this.bytes[this.offset];

    if (value === undefined) {
      throw new Error("Unexpected end of share payload.");
    }

    this.offset += 1;
    return value;
  }

  readBytes(length: number) {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error("Invalid binary length.");
    }

    const value = this.bytes.slice(this.offset, this.offset + length);

    if (value.length !== length) {
      throw new Error("Unexpected end of share payload.");
    }

    this.offset += length;
    return value;
  }

  readVarUint() {
    let value = 0;
    let shift = 0;

    while (true) {
      const currentByte = this.readByte();
      value |= (currentByte & 0x7f) << shift;

      if ((currentByte & 0x80) === 0) {
        return value;
      }

      shift += 7;

      if (shift > 28) {
        throw new Error("Invalid share payload varint.");
      }
    }
  }

  readString() {
    const length = this.readVarUint();
    return textDecoder.decode(this.readBytes(length));
  }

  assertFullyConsumed() {
    if (this.offset !== this.bytes.length) {
      throw new Error("Unexpected trailing bytes in share payload.");
    }
  }
}

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
  return serializeSongSharePayloadV4(song);
}

export function parseSongSharePayload(payload: string) {
  const compressedPayloadMatch = /^v(\d+)\.(.+)$/u.exec(payload);

  if (compressedPayloadMatch !== null) {
    const version = Number(compressedPayloadMatch[1] ?? "");
    const payloadBody = compressedPayloadMatch[2] ?? "";

    if (version === SHARE_FORMAT_VERSION) {
      return parseSongSharePayloadV4(payloadBody);
    }

    if (version === LEGACY_COMPRESSED_SHARE_FORMAT_VERSION) {
      return parseSongSharePayloadV3(payloadBody);
    }

    throw new Error("Unsupported share format version.");
  }

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

function serializeSongSharePayloadV4(song: SongDocument) {
  const writer = new ByteWriter();
  const headerFlags =
    (song.meta.engineMode === "authentic" ? 1 : 0) |
    (song.mixer.oldSpeakerMode ? 1 << 1 : 0) |
    (song.meta.name !== defaultSharedMeta.name ? 1 << 2 : 0) |
    (song.meta.author !== defaultSharedMeta.author ? 1 << 3 : 0) |
    (song.meta.createdAt !== defaultSharedMeta.createdAt ? 1 << 4 : 0) |
    (song.meta.updatedAt !== defaultSharedMeta.updatedAt ? 1 << 5 : 0);

  writer.writeByte(headerFlags);
  writer.writeVarUint(song.transport.bpm - 40);
  writer.writeVarUint(song.transport.stepsPerBeat - 1);
  writer.writeVarUint(song.transport.loopLength / 4 - 2);
  writer.writeByte(quantizeLevel(song.mixer.masterVolume));

  if ((headerFlags & (1 << 2)) !== 0) {
    writer.writeString(song.meta.name);
  }

  if ((headerFlags & (1 << 3)) !== 0) {
    writer.writeString(song.meta.author);
  }

  if ((headerFlags & (1 << 4)) !== 0) {
    writer.writeString(song.meta.createdAt);
  }

  if ((headerFlags & (1 << 5)) !== 0) {
    writer.writeString(song.meta.updatedAt);
  }

  writeSamples(writer, song.samples);
  writePulseTrack(writer, song.tracks.pulse1);
  writePulseTrack(writer, song.tracks.pulse2);
  writeTriangleTrack(writer, song.tracks.triangle);
  writeNoiseTrack(writer, song.tracks.noise);
  writeSampleTrack(writer, song.tracks.sample, song.samples, song.meta.engineMode);

  return `${SHARE_PAYLOAD_PREFIX}${encodeBase64Url(deflateRaw(writer.toUint8Array()))}`;
}

function parseSongSharePayloadV4(payloadBody: string) {
  const reader = new ByteReader(inflateRaw(decodeBase64UrlToBytes(payloadBody)));
  return parseSongSharePayloadV4FromReader(reader);
}

function parseSongSharePayloadV4FromReader(reader: ByteReader) {
  const defaultSong = createDefaultSongDocument();
  const headerFlags = reader.readByte();
  const bpm = reader.readVarUint() + 40;
  const stepsPerBeat = reader.readVarUint() + 1;
  const loopLength = (reader.readVarUint() + 2) * 4;
  const masterVolume = dequantizeLevel(reader.readByte());

  const name = (headerFlags & (1 << 2)) !== 0 ? reader.readString() : defaultSharedMeta.name;
  const author = (headerFlags & (1 << 3)) !== 0 ? reader.readString() : defaultSharedMeta.author;
  const createdAt = (headerFlags & (1 << 4)) !== 0 ? reader.readString() : defaultSharedMeta.createdAt;
  const updatedAt = (headerFlags & (1 << 5)) !== 0 ? reader.readString() : defaultSharedMeta.updatedAt;
  const engineMode = (headerFlags & 1) !== 0 ? "authentic" : "inspired";
  const oldSpeakerMode = (headerFlags & (1 << 1)) !== 0;

  const samples = readSamples(reader);
  const pulse1 = readPulseTrack(reader, defaultSong.tracks.pulse1, loopLength);
  const pulse2 = readPulseTrack(reader, defaultSong.tracks.pulse2, loopLength);
  const triangle = readTriangleTrack(reader, defaultSong.tracks.triangle, loopLength);
  const noise = readNoiseTrack(reader, defaultSong.tracks.noise, loopLength);
  const sample = readSampleTrack(reader, defaultSong.tracks.sample, loopLength, samples);

  reader.assertFullyConsumed();

  return parseSongDocument({
    kind: defaultSong.kind,
    version: defaultSong.version,
    meta: {
      name,
      author,
      createdAt,
      updatedAt,
      engineMode,
    },
    transport: {
      bpm,
      stepsPerBeat,
      loopLength,
    },
    mixer: {
      masterVolume,
      oldSpeakerMode,
    },
    tracks: {
      pulse1,
      pulse2,
      triangle,
      noise,
      sample,
    },
    samples,
  } satisfies SongDocument);
}

function parseSongSharePayloadV3(payloadBody: string) {
  const compactText = textDecoder.decode(inflateRaw(decodeBase64UrlToBytes(payloadBody)));
  return parseSongShareText(compactText);
}

function serializeHeader(song: SongDocument) {
  const modeToken = song.meta.engineMode === "inspired" ? "i" : "a";

  return [
    `!v=${LEGACY_COMPRESSED_SHARE_FORMAT_VERSION}`,
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

    const dpcmRate = normalizeDpcmRate(step.playbackRate);
    const rateSuffix = dpcmRate === defaultDpcmRate ? "" : `@${formatCompactNumber(dpcmRate)}hz`;

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

  if (version !== "2" && version !== LEGACY_COMPRESSED_SHARE_FORMAT_VERSION.toString()) {
    throw new Error("Unsupported share format version.");
  }

  const modeToken = getRequiredEntry(headerEntries, "mode");

  return {
    author: decodeURIComponent(getOptionalEntry(headerEntries, "author") ?? "Julio"),
    bpm: parseIntegerValue(getRequiredEntry(headerEntries, "bpm"), "bpm"),
    createdAt: getOptionalEntry(headerEntries, "created") ?? defaultSharedMeta.createdAt,
    engineMode: modeToken === "a" ? "authentic" : "inspired",
    loopLength: parseIntegerValue(getRequiredEntry(headerEntries, "loop"), "loop"),
    masterVolume: parseLevelPercent(getOptionalEntry(headerEntries, "mv") ?? "75", "mv"),
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
        mode: (entry?.mode ?? "long") as NoiseTrack["steps"][number]["mode"],
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
      playbackRate: entry?.playbackRate ?? defaultDpcmRate,
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

function writeSamples(writer: ByteWriter, samples: readonly SerializedSampleAsset[]) {
  writer.writeVarUint(samples.length);

  samples.forEach((sample) => {
    const sampleFlags = (sample.source === "import" ? 1 : 0) | (sample.detectedBaseNote !== null ? 1 << 1 : 0);
    const pcmBytes = quantizeSamplePcm(sample.pcm);

    writer.writeByte(sampleFlags);
    writer.writeString(sample.id);
    writer.writeString(sample.name);
    writer.writeByte(getRequiredNoteIndex(sample.baseNote as NoteValue));

    if (sample.detectedBaseNote !== null) {
      writer.writeByte(getRequiredNoteIndex(sample.detectedBaseNote as NoteValue));
    }

    writer.writeVarUint(sample.sampleRate);
    writer.writeVarUint(sample.trim.startFrame);
    writer.writeVarUint(sample.trim.endFrame - sample.trim.startFrame);
    writer.writeVarUint(pcmBytes.length);
    writer.writeBytes(pcmBytes);
  });
}

function readSamples(reader: ByteReader): SerializedSampleAsset[] {
  const sampleCount = reader.readVarUint();

  return Array.from({ length: sampleCount }, () => {
    const sampleFlags = reader.readByte();
    const id = reader.readString();
    const name = reader.readString();
    const baseNote = getNoteValueByIndex(reader.readByte());
    const detectedBaseNote = (sampleFlags & (1 << 1)) !== 0 ? getNoteValueByIndex(reader.readByte()) : null;
    const sampleRate = reader.readVarUint();
    const trimStartFrame = reader.readVarUint();
    const trimLength = reader.readVarUint();
    const pcmLength = reader.readVarUint();
    const pcm = dequantizeSamplePcm(reader.readBytes(pcmLength));

    return {
      id,
      name,
      source: (sampleFlags & 1) !== 0 ? "import" : "mic",
      baseNote,
      detectedBaseNote,
      sampleRate,
      frameCount: pcm.length,
      channels: 1,
      trim: {
        startFrame: trimStartFrame,
        endFrame: trimStartFrame + trimLength,
      },
      pcm,
    };
  });
}

function writeTrackState(writer: ByteWriter, track: BinaryTrackState) {
  writer.writeByte(quantizeLevel(track.volume));
  writer.writeByte(track.muted ? 1 : 0);
}

function readTrackState(reader: ByteReader) {
  return {
    volume: dequantizeLevel(reader.readByte()),
    muted: reader.readByte() === 1,
  };
}

function writePulseTrack(writer: ByteWriter, track: PulseTrack) {
  writeTrackState(writer, track);
  const entries = getMelodicArrangementEntries(track);

  writer.writeVarUint(entries.length);

  let previousStepIndex = -1;

  entries.forEach((entry) => {
    const step = track.steps[entry.stepIndex];
    const dutyIndex = pulseDutyIndexByValue.get(entry.duty ?? DEFAULT_PULSE_DUTY);

    if (step === undefined || dutyIndex === undefined) {
      throw new Error("Invalid pulse track entry.");
    }

    const hasVolumeOverride = !approximatelyEqual(step.volume, track.volume);
    const entryFlags = dutyIndex | (hasVolumeOverride ? 1 << 2 : 0);

    writer.writeVarUint(entry.stepIndex - previousStepIndex - 1);
    writer.writeByte(getRequiredNoteIndex(entry.note));
    writer.writeVarUint(entry.length - 1);
    writer.writeByte(entryFlags);

    if (hasVolumeOverride) {
      writer.writeByte(quantizeLevel(step.volume));
    }

    previousStepIndex = entry.stepIndex;
  });
}

function readPulseTrack(reader: ByteReader, defaultTrack: PulseTrack, loopLength: number) {
  const trackState = readTrackState(reader);
  const eventCount = reader.readVarUint();
  const entries = new Map<number, PulseTrack["steps"][number]>();
  let stepIndex = -1;

  for (let index = 0; index < eventCount; index += 1) {
    stepIndex += reader.readVarUint() + 1;
    const note = getNoteValueByIndex(reader.readByte());
    const length = reader.readVarUint() + 1;
    const entryFlags = reader.readByte();
    const duty = pulseDutyOptions[entryFlags & 0b11];

    if (duty === undefined) {
      throw new Error("Invalid pulse duty in share payload.");
    }

    const hasVolumeOverride = (entryFlags & (1 << 2)) !== 0;
    const volume = hasVolumeOverride ? dequantizeLevel(reader.readByte()) : trackState.volume;

    entries.set(stepIndex, {
      enabled: true,
      note,
      volume,
      duty,
      length,
    });
  }

  return {
    ...defaultTrack,
    muted: trackState.muted,
    solo: false,
    volume: trackState.volume,
    steps: Array.from({ length: loopLength }, (_, currentStepIndex) => {
      const entry = entries.get(currentStepIndex);

      return entry ?? {
        enabled: false,
        note: "C4",
        volume: trackState.volume,
        duty: DEFAULT_PULSE_DUTY,
        length: 1,
      };
    }),
  };
}

function writeTriangleTrack(writer: ByteWriter, track: TriangleTrack) {
  writeTrackState(writer, track);
  const entries = getMelodicArrangementEntries(track);

  writer.writeVarUint(entries.length);

  let previousStepIndex = -1;

  entries.forEach((entry) => {
    const step = track.steps[entry.stepIndex];

    if (step === undefined) {
      throw new Error("Invalid triangle track entry.");
    }

    const hasVolumeOverride = !approximatelyEqual(step.volume, track.volume);

    writer.writeVarUint(entry.stepIndex - previousStepIndex - 1);
    writer.writeByte(getRequiredNoteIndex(entry.note));
    writer.writeVarUint(entry.length - 1);
    writer.writeByte(hasVolumeOverride ? 1 : 0);

    if (hasVolumeOverride) {
      writer.writeByte(quantizeLevel(step.volume));
    }

    previousStepIndex = entry.stepIndex;
  });
}

function readTriangleTrack(reader: ByteReader, defaultTrack: TriangleTrack, loopLength: number) {
  const trackState = readTrackState(reader);
  const eventCount = reader.readVarUint();
  const entries = new Map<number, TriangleTrack["steps"][number]>();
  let stepIndex = -1;

  for (let index = 0; index < eventCount; index += 1) {
    stepIndex += reader.readVarUint() + 1;
    const note = getNoteValueByIndex(reader.readByte());
    const length = reader.readVarUint() + 1;
    const hasVolumeOverride = reader.readByte() === 1;
    const volume = hasVolumeOverride ? dequantizeLevel(reader.readByte()) : trackState.volume;

    entries.set(stepIndex, {
      enabled: true,
      note,
      volume,
      length,
    });
  }

  return {
    ...defaultTrack,
    muted: trackState.muted,
    solo: false,
    volume: trackState.volume,
    steps: Array.from({ length: loopLength }, (_, currentStepIndex) => {
      const entry = entries.get(currentStepIndex);

      return entry ?? {
        enabled: false,
        note: "C3",
        volume: trackState.volume,
        length: 1,
      };
    }),
  };
}

function writeNoiseTrack(writer: ByteWriter, track: NoiseTrack) {
  writeTrackState(writer, track);
  const steps = track.steps.flatMap((step, stepIndex) => (step.enabled ? [{ step, stepIndex }] : []));

  writer.writeVarUint(steps.length);

  let previousStepIndex = -1;

  steps.forEach(({ step, stepIndex }) => {
    const preset = getNoiseTriggerPresetForStep(step);
    const hasVolumeOverride = !approximatelyEqual(step.volume, track.volume);
    const presetIndex = preset === null ? 0 : getNoisePresetIndex(preset.id);

    writer.writeVarUint(stepIndex - previousStepIndex - 1);
    writer.writeByte(presetIndex | (hasVolumeOverride ? 1 << 4 : 0));

    if (preset === null) {
      writer.writeByte((step.mode === "short" ? 1 << 4 : 0) | (step.periodIndex & 0x0f));
    }

    if (hasVolumeOverride) {
      writer.writeByte(quantizeLevel(step.volume));
    }

    previousStepIndex = stepIndex;
  });
}

function readNoiseTrack(reader: ByteReader, defaultTrack: NoiseTrack, loopLength: number): NoiseTrack {
  const trackState = readTrackState(reader);
  const eventCount = reader.readVarUint();
  const entries = new Map<number, NoiseTrack["steps"][number]>();
  let stepIndex = -1;

  for (let index = 0; index < eventCount; index += 1) {
    stepIndex += reader.readVarUint() + 1;
    const entryFlags = reader.readByte();
    const hasVolumeOverride = (entryFlags & (1 << 4)) !== 0;
    const presetIndex = entryFlags & 0x0f;
    const preset = presetIndex === 0 ? null : noisePresetByIndex[presetIndex - 1];

    if (preset === undefined) {
      throw new Error("Invalid noise preset in share payload.");
    }

    const encodedNoiseValue = preset === null ? reader.readByte() : null;
    const volume = hasVolumeOverride ? dequantizeLevel(reader.readByte()) : trackState.volume;

    entries.set(stepIndex, {
      enabled: true,
      volume,
      mode:
        preset === null
          ? ((((encodedNoiseValue ?? 0) & (1 << 4)) !== 0 ? "short" : "long") as NoiseTrack["steps"][number]["mode"])
          : preset.mode,
      periodIndex: preset === null ? (encodedNoiseValue ?? 0) & 0x0f : preset.periodIndex,
    });
  }

  return {
    ...defaultTrack,
    muted: trackState.muted,
    solo: false,
    volume: trackState.volume,
    steps: Array.from({ length: loopLength }, (_, currentStepIndex) => {
      const entry = entries.get(currentStepIndex);

      return entry ?? {
        enabled: false,
        volume: trackState.volume,
        mode: "long" as NoiseTrack["steps"][number]["mode"],
        periodIndex: 8,
      };
    }),
  };
}

function writeSampleTrack(
  writer: ByteWriter,
  track: SampleTrack,
  samples: readonly SerializedSampleAsset[],
  engineMode: SongDocument["meta"]["engineMode"],
) {
  writeTrackState(writer, track);
  const sampleIndexById = new Map(samples.map((sample, index) => [sample.id, index]));
  const steps = track.steps.flatMap((step, stepIndex) =>
    step.enabled && step.sampleId !== null ? [{ step, stepIndex }] : [],
  );

  writer.writeVarUint(steps.length);

  let previousStepIndex = -1;

  steps.forEach(({ step, stepIndex }) => {
    const sampleIndex = sampleIndexById.get(step.sampleId ?? "");

    if (sampleIndex === undefined) {
      throw new Error("Sample track references an unknown sample.");
    }

    const hasVolumeOverride = !approximatelyEqual(step.volume, track.volume);
    const normalizedPlaybackRate = engineMode === "authentic" ? normalizeDpcmRate(step.playbackRate) : step.playbackRate;
    const playbackRateIndex = samplePlaybackRateIndexByValue.get(normalizedPlaybackRate) ?? -1;
    const hasIndexedPlaybackRate = engineMode === "authentic" && playbackRateIndex !== -1;
    const entryFlags =
      (hasVolumeOverride ? 1 : 0) |
      (engineMode === "authentic" ? 1 << 1 : 0) |
      (hasIndexedPlaybackRate ? 1 << 2 : 0);

    writer.writeVarUint(stepIndex - previousStepIndex - 1);
    writer.writeVarUint(sampleIndex);
    writer.writeByte(entryFlags);

    if (engineMode === "inspired") {
      writer.writeByte(getRequiredNoteIndex(step.note as NoteValue));
    } else if (hasIndexedPlaybackRate) {
      writer.writeByte(playbackRateIndex);
    } else {
      writer.writeVarUint(Math.round(normalizedPlaybackRate));
    }

    if (hasVolumeOverride) {
      writer.writeByte(quantizeLevel(step.volume));
    }

    previousStepIndex = stepIndex;
  });
}

function readSampleTrack(
  reader: ByteReader,
  defaultTrack: SampleTrack,
  loopLength: number,
  samples: readonly SerializedSampleAsset[],
) {
  const trackState = readTrackState(reader);
  const eventCount = reader.readVarUint();
  const entries = new Map<number, SampleTrack["steps"][number]>();
  let stepIndex = -1;

  for (let index = 0; index < eventCount; index += 1) {
    stepIndex += reader.readVarUint() + 1;
    const sampleIndex = reader.readVarUint();
    const entryFlags = reader.readByte();
    const hasVolumeOverride = (entryFlags & 1) !== 0;
    const encodedEngineMode = (entryFlags & (1 << 1)) !== 0 ? "authentic" : "inspired";
    const hasIndexedPlaybackRate = (entryFlags & (1 << 2)) !== 0;
    const sample = samples[sampleIndex];

    if (sample === undefined) {
      throw new Error("Invalid sample index in share payload.");
    }

    let note: NoteValue = sample.baseNote as NoteValue;
    let playbackRate = defaultDpcmRate;

    if (encodedEngineMode === "inspired") {
      note = getNoteValueByIndex(reader.readByte());
    } else if (hasIndexedPlaybackRate) {
      const playbackRateIndex = reader.readByte();
      const indexedPlaybackRate = sampleDpcmRateOptions[playbackRateIndex];

      if (indexedPlaybackRate === undefined) {
        throw new Error("Invalid sample playback rate in share payload.");
      }

      playbackRate = indexedPlaybackRate;
    } else {
      const rawPlaybackRate = reader.readVarUint();
      playbackRate = rawPlaybackRate <= 400 ? rawPlaybackRate / 100 : rawPlaybackRate;
    }

    const volume = hasVolumeOverride ? dequantizeLevel(reader.readByte()) : trackState.volume;

    entries.set(stepIndex, {
      enabled: true,
      volume,
      sampleId: sample.id,
      note,
      playbackRate: encodedEngineMode === "authentic" ? playbackRate : defaultDpcmRate,
    });
  }

  return {
    ...defaultTrack,
    muted: trackState.muted,
    solo: false,
    volume: trackState.volume,
    steps: Array.from({ length: loopLength }, (_, currentStepIndex) => {
      const entry = entries.get(currentStepIndex);

      return entry ?? {
        enabled: false,
        volume: trackState.volume,
        sampleId: null,
        note: "C4",
        playbackRate: defaultDpcmRate,
      };
    }),
  };
}

const noisePresetByIndex = [
  { mode: "short", periodIndex: 0, id: "tick" },
  { mode: "short", periodIndex: 1, id: "hat" },
  { mode: "short", periodIndex: 3, id: "snare" },
  { mode: "short", periodIndex: 7, id: "burst" },
  { mode: "long", periodIndex: 5, id: "shaker" },
  { mode: "long", periodIndex: 8, id: "hiss" },
  { mode: "long", periodIndex: 12, id: "crash" },
  { mode: "long", periodIndex: 15, id: "rumble" },
] as const satisfies ReadonlyArray<{
  id: string;
  mode: NoiseTrack["steps"][number]["mode"];
  periodIndex: NoiseTrack["steps"][number]["periodIndex"];
}>;

function getNoisePresetIndex(presetId: string) {
  const presetIndex = noisePresetByIndex.findIndex((preset) => preset.id === presetId);

  if (presetIndex === -1) {
    throw new Error("Unknown noise preset.");
  }

  return presetIndex + 1;
}

function getRequiredNoteIndex(note: NoteValue) {
  const noteIndex = noteIndexByValue.get(note);

  if (noteIndex === undefined) {
    throw new Error("Unsupported note in share payload.");
  }

  return noteIndex;
}

function getNoteValueByIndex(noteIndex: number) {
  const note = noteEntryOptions[noteIndex];

  if (note === undefined) {
    throw new Error("Invalid note index in share payload.");
  }

  return note;
}

function quantizeLevel(level: number) {
  return Math.max(0, Math.min(100, Math.round(level * 100)));
}

function dequantizeLevel(level: number) {
  return level / 100;
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
  return textDecoder.decode(decodeBase64UrlToBytes(value));
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
