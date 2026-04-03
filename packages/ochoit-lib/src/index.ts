export * from "./core/dpcm";
export * from "./core/note-frequency";
export * from "./core/song-document";
export * from "./core/song-pattern";
export * from "./core/song-share";
export * from "./core/transport-scheduler";
export * from "./core/transport-worklet-shared";

import {
  createDefaultSongDocument,
  createEmptySongDocument,
  parseSongDocument,
  type SongDocument,
} from "./core/song-document";
import {
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
} from "./core/song-pattern";
import { parseSongShareText, serializeSongShareText } from "./core/song-share";

export type SongInput = string | SongDocument;

export const parseSong = parseSongShareText;
export const validateSong = parseSongDocument;
export const serializeSong = serializeSongShareText;
export const createEmptySong = createEmptySongDocument;
export const createDefaultSong = createDefaultSongDocument;
export const parseMelodicArrangement = parseMelodicTrackArrangement;
export const parseNoiseArrangement = parseNoiseTrackArrangement;
export const parseSampleArrangement = parseSampleTrackArrangement;
export const replaceMelodicArrangement = replaceMelodicTrackArrangement;
export const replaceNoiseArrangement = replaceNoiseTrackArrangement;
export const replaceSampleArrangement = replaceSampleTrackArrangement;
