import { NoiseVoice } from "@/features/audio/noise-voice";
import { AudioTransport } from "@/features/audio/audio-transport";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import { PulseVoice } from "@/features/audio/pulse-voice";
import { SampleVoice } from "@/features/audio/sample-voice";
import { TriangleVoice } from "@/features/audio/triangle-voice";
import { getOrderedTracks, trackOrder, type SongDocument, type TrackId } from "@/features/song/song-document";
import type { MelodicTrackId, NoteValue } from "@/features/song/song-pattern";

export type AudioEngineState = AudioContextState | "closed";

export type VoiceBus = {
  id: TrackId;
  input: GainNode;
  gain: GainNode;
  analyser: AnalyserNode;
};

const analyserFftSize = 1024;

function getPreviewOscillatorType(trackId: MelodicTrackId): OscillatorType {
  return trackId === "triangle" ? "triangle" : "square";
}

export class AudioEngine {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly voices: Record<TrackId, VoiceBus>;
  readonly transport: AudioTransport;
  private readonly pulseVoice1: PulseVoice;
  private readonly pulseVoice2: PulseVoice;
  private readonly triangleVoice: TriangleVoice;
  private readonly noiseVoice: NoiseVoice;
  private readonly sampleVoice: SampleVoice;
  private readonly unsubscribeTransport: () => void;

  private constructor(
    context: AudioContext,
    masterGain: GainNode,
    voices: Record<TrackId, VoiceBus>,
    transport: AudioTransport,
    pulseVoice1: PulseVoice,
    pulseVoice2: PulseVoice,
    triangleVoice: TriangleVoice,
    noiseVoice: NoiseVoice,
    sampleVoice: SampleVoice,
    unsubscribeTransport: () => void,
  ) {
    this.context = context;
    this.masterGain = masterGain;
    this.voices = voices;
    this.transport = transport;
    this.pulseVoice1 = pulseVoice1;
    this.pulseVoice2 = pulseVoice2;
    this.triangleVoice = triangleVoice;
    this.noiseVoice = noiseVoice;
    this.sampleVoice = sampleVoice;
    this.unsubscribeTransport = unsubscribeTransport;
  }

  static async create() {
    if (typeof AudioContext === "undefined") {
      throw new Error("Web Audio is not available in this browser.");
    }

    const context = new AudioContext({ latencyHint: "interactive" });
    const transport = await AudioTransport.create(context);
    const masterGain = context.createGain();
    masterGain.gain.value = 0.88;
    masterGain.connect(context.destination);

    const voices = Object.fromEntries(
      trackOrder.map((trackId) => {
        const input = context.createGain();
        const gain = context.createGain();
        const analyser = context.createAnalyser();

        gain.gain.value = 0.75;
        analyser.fftSize = analyserFftSize;
        analyser.smoothingTimeConstant = 0.85;

        input.connect(gain);
        gain.connect(analyser);
        analyser.connect(masterGain);

        return [
          trackId,
          {
            id: trackId,
            input,
            gain,
            analyser,
          },
        ];
      }),
    ) as Record<TrackId, VoiceBus>;

    const pulseVoice1 = new PulseVoice(context, voices.pulse1.input);
    const pulseVoice2 = new PulseVoice(context, voices.pulse2.input);
    const triangleVoice = new TriangleVoice(context, voices.triangle.input);
    const noiseVoice = new NoiseVoice(context, voices.noise.input);
    const sampleVoice = new SampleVoice(context, voices.sample.input);
    const unsubscribeTransport = transport.subscribe((event) => {
      if (event.type !== "scheduled-steps") {
        return;
      }

      event.steps.forEach(({ step, time }) => {
        pulseVoice1.scheduleStep(step, time);
        pulseVoice2.scheduleStep(step, time);
        triangleVoice.scheduleStep(step, time);
        noiseVoice.scheduleStep(step, time);
        sampleVoice.scheduleStep(step, time);
      });
    });

    return new AudioEngine(
      context,
      masterGain,
      voices,
      transport,
      pulseVoice1,
      pulseVoice2,
      triangleVoice,
      noiseVoice,
      sampleVoice,
      unsubscribeTransport,
    );
  }

  get state(): AudioEngineState {
    return this.context.state;
  }

  async resume() {
    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }

  async suspend() {
    if (this.context.state === "running") {
      await this.context.suspend();
    }
  }

  setMasterVolume(volume: number) {
    this.masterGain.gain.value = volume;
  }

  setVoiceVolume(trackId: TrackId, volume: number) {
    this.voices[trackId].gain.gain.value = volume;
  }

  configureSong(song: SongDocument) {
    this.setMasterVolume(song.mixer.masterVolume);
    getOrderedTracks(song).forEach((track) => {
      this.setVoiceVolume(track.id, track.muted ? 0 : track.volume);
    });
    this.pulseVoice1.configure(song.tracks.pulse1, song.transport);
    this.pulseVoice2.configure(song.tracks.pulse2, song.transport);
    this.triangleVoice.configure(song.tracks.triangle, song.transport);
    this.noiseVoice.configure(song.tracks.noise, song.transport);
    this.sampleVoice.configure(song.tracks.sample, song.samples);
    this.transport.configure(song.transport);
  }

  configureTransport(transport: SongDocument["transport"]) {
    this.transport.configure(transport);
  }

  startTransport(startTime?: number, step?: number) {
    this.transport.start(startTime, step);
  }

  stopTransport() {
    this.transport.stop();
  }

  getWaveform(trackId: TrackId, sampleSize = 256) {
    const waveform = new Uint8Array(sampleSize);
    this.voices[trackId].analyser.getByteTimeDomainData(waveform);
    return waveform;
  }

  /**
   * Play a short preview tone at the given note.
   * Used for hover-preview in the note picker grid.
   */
  previewNote(trackId: MelodicTrackId, note: NoteValue, durationMs = 120) {
    if (this.context.state !== "running") {
      return;
    }

    const now = this.context.currentTime;
    const durationSec = durationMs / 1000;
    const attackSec = 0.003;
    const releaseSec = 0.025;
    const volume = 0.25;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = getPreviewOscillatorType(trackId);
    oscillator.frequency.setValueAtTime(getFrequencyForNote(note), now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attackSec);
    gain.gain.setValueAtTime(volume, now + durationSec - releaseSec);
    gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

    oscillator.connect(gain);
    gain.connect(this.masterGain);

    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };

    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.01);
  }

  async close() {
    if (this.context.state === "closed") {
      return;
    }

    this.unsubscribeTransport();
    this.transport.disconnect();
    this.masterGain.disconnect();
    trackOrder.forEach((trackId) => {
      const voice = this.voices[trackId];
      voice.input.disconnect();
      voice.gain.disconnect();
      voice.analyser.disconnect();
    });
    await this.context.close();
  }
}
