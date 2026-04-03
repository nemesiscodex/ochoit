import { parseSongShareText } from "../core/song-share";
import { parseSongDocument, type SongDocument } from "../core/song-document";
import type { AudioTransportEvent, AudioTransportSnapshot } from "./audio-transport";
import { AudioEngine } from "./audio-engine";

export type SongInput = string | SongDocument;
export type OchoitPlayerEvent = AudioTransportEvent;

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

    const engine = await AudioEngine.create({
      context: this.options.audioContext,
    });

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
    engine.configureSong(this.song);

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

export function ochoit(input: SongInput, options?: OchoitOptions): OchoitPlayer {
  return new OchoitPlayerController(input, options);
}
