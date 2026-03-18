import { trackOrder, type TrackId } from "@/features/song/song-document";

export type AudioEngineState = AudioContextState | "closed";

export type VoiceBus = {
  id: TrackId;
  input: GainNode;
  gain: GainNode;
  analyser: AnalyserNode;
};

const analyserFftSize = 1024;

export class AudioEngine {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly voices: Record<TrackId, VoiceBus>;

  private constructor(context: AudioContext, masterGain: GainNode, voices: Record<TrackId, VoiceBus>) {
    this.context = context;
    this.masterGain = masterGain;
    this.voices = voices;
  }

  static create() {
    if (typeof AudioContext === "undefined") {
      throw new Error("Web Audio is not available in this browser.");
    }

    const context = new AudioContext({ latencyHint: "interactive" });
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

    return new AudioEngine(context, masterGain, voices);
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

  getWaveform(trackId: TrackId, sampleSize = 256) {
    const waveform = new Uint8Array(sampleSize);
    this.voices[trackId].analyser.getByteTimeDomainData(waveform);
    return waveform;
  }

  async close() {
    if (this.context.state === "closed") {
      return;
    }

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
