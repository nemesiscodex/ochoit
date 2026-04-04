import { createVoiceSong, isPlayableVoiceId, type PlayableVoiceId, type VoiceSongOptions } from "../core/voice-song.js";
import { parseSongShareText } from "../core/song-share.js";
import { parseSongDocument, type SongDocument } from "../core/song-document.js";
import type { AudioTransportEvent, AudioTransportSnapshot } from "./audio-transport.js";
import { AudioEngine } from "./audio-engine.js";
import { getSharedAudioContext, startSharedAudioContext } from "./shared-audio-context.js";

export type SongInput = string | SongDocument;
export type OchoitPlayerEvent = AudioTransportEvent;
export type OchoitVoiceOptions = VoiceSongOptions &
  Pick<OchoitOptions, "audioContext" | "autoResume"> & {
    loop?: boolean;
  };

export interface OchoitPlayer {
  play(options?: { when?: number; startStep?: number }): Promise<void>;
  stop(): void;
  update(input: SongInput): void;
  getSong(): SongDocument;
  getState(): AudioTransportSnapshot;
  subscribe(listener: (event: OchoitPlayerEvent) => void): () => void;
  destroy(): Promise<void>;
}

export interface OchoitOptions {
  audioContext?: AudioContext;
  autoResume?: boolean;
  masterVolume?: number;
}

const defaultPlaybackState: AudioTransportSnapshot = {
  playbackState: "stopped",
  nextStep: 0,
  nextStepTime: null,
  loopCount: 0,
};

function resolveSong(input: SongInput) {
  return typeof input === "string" ? parseSongShareText(input) : parseSongDocument(input);
}

class OchoitPlayerController implements OchoitPlayer {
  private engine: AudioEngine | null = null;
  private song: SongDocument;
  private state = defaultPlaybackState;
  private readonly listeners = new Set<(event: OchoitPlayerEvent) => void>();
  private destroyed = false;

  constructor(
    input: SongInput,
    private readonly options: OchoitOptions = {},
    private readonly playbackLoop = true,
  ) {
    this.song = resolveSong(input);
  }

  async play(options?: { when?: number; startStep?: number }) {
    const engine = await this.getOrCreateEngine();

    if (this.options.autoResume !== false) {
      await engine.resume();
    }

    engine.startTransport(options?.when, options?.startStep);
  }

  stop() {
    this.assertUsable();
    this.engine?.stopTransport();
  }

  update(input: SongInput) {
    this.assertUsable();
    this.song = resolveSong(input);

    if (this.engine !== null) {
      this.configureEngine(this.engine);
    }
  }

  getSong() {
    return this.song;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (event: OchoitPlayerEvent) => void) {
    this.assertUsable();
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.listeners.clear();
    const engine = this.engine;
    this.engine = null;

    if (engine !== null) {
      await engine.close();
    }
  }

  private async getOrCreateEngine() {
    this.assertUsable();

    if (this.engine !== null) {
      return this.engine;
    }

    const context = this.options.audioContext ?? getSharedAudioContext();
    const engine = await AudioEngine.create({ context });

    engine.transport.subscribe((event) => {
      if (event.type === "playback-state") {
        this.state = event.snapshot;
      }

      this.listeners.forEach((listener) => {
        listener(event);
      });
    });

    this.engine = engine;
    this.configureEngine(engine);
    return engine;
  }

  private configureEngine(engine: AudioEngine) {
    engine.configureSong(this.song, {
      loop: this.playbackLoop,
    });

    if (this.options.masterVolume !== undefined) {
      engine.setMasterVolume(this.options.masterVolume);
    }
  }

  private assertUsable() {
    if (this.destroyed) {
      throw new Error("This Ochoit player has been destroyed.");
    }
  }
}

function createVoicePlayer(voiceId: PlayableVoiceId, arrangementInput: string, options: OchoitVoiceOptions = {}) {
  const song = createVoiceSong(voiceId, arrangementInput, options);

  return new OchoitPlayerController(
    song,
    {
      audioContext: options.audioContext,
      autoResume: options.autoResume,
      masterVolume: options.masterVolume,
    },
    options.loop !== false,
  );
}

function createSongPlayer(input: SongInput, options?: OchoitOptions) {
  return new OchoitPlayerController(input, options);
}

export interface OchoitFactory {
  (input: SongInput, options?: OchoitOptions): OchoitPlayer;
  (voiceId: PlayableVoiceId, arrangementInput: string, options?: OchoitVoiceOptions): OchoitPlayer;
  start: (options?: AudioContextOptions) => Promise<AudioContext>;
  voice: (voiceId: PlayableVoiceId, arrangementInput: string, options?: OchoitVoiceOptions) => OchoitPlayer;
}

const ochoitFactory = Object.assign(
  (
    inputOrVoiceId: PlayableVoiceId | SongInput,
    arrangementInputOrOptions?: string | OchoitOptions,
    maybeOptions?: OchoitVoiceOptions,
  ) => {
    if (
      typeof inputOrVoiceId === "string" &&
      typeof arrangementInputOrOptions === "string" &&
      isPlayableVoiceId(inputOrVoiceId)
    ) {
      return createVoicePlayer(inputOrVoiceId, arrangementInputOrOptions, maybeOptions);
    }

    return createSongPlayer(inputOrVoiceId as SongInput, arrangementInputOrOptions as OchoitOptions | undefined);
  },
  {
    start: startSharedAudioContext,
    voice: createVoicePlayer,
  },
);

export const ochoit = ochoitFactory as OchoitFactory;
