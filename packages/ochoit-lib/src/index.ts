export * from "./core/dpcm.js";
export * from "./core/note-frequency.js";
export * from "./core/song-document.js";
export * from "./core/song-pattern.js";
export * from "./core/song-share.js";
export * from "./core/transport-scheduler.js";
export * from "./core/transport-worklet-shared.js";
export * from "./core/voice-song.js";

import {
  createDefaultSongDocument,
  createEmptySongDocument,
  parseSongDocument,
  type SongDocument,
} from "./core/song-document.js";
import {
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
} from "./core/song-pattern.js";
import { parseSongShareText, serializeSongShareText } from "./core/song-share.js";

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
