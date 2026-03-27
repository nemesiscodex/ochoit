import { configureOldSpeakerFilters } from "@/features/audio/old-speaker";
import { NoiseVoice } from "@/features/audio/noise-voice";
import { AudioTransport } from "@/features/audio/audio-transport";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import { PulseVoice } from "@/features/audio/pulse-voice";
import { SampleVoice } from "@/features/audio/sample-voice";
import { TriangleVoice } from "@/features/audio/triangle-voice";
import { getOrderedTracks, trackOrder, type SongDocument, type TrackId } from "@/features/song/song-document";
import { getNoiseTriggerPresetById, type MelodicTrackId, type NoiseTriggerPresetId, type NoteValue, type PulseDutyValue } from "@/features/song/song-pattern";

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
  readonly transport: AudioTransport;
  private readonly masterDryGain: GainNode;
  private readonly masterSpeakerWetGain: GainNode;
  private readonly masterSpeakerHighPass: BiquadFilterNode;
  private readonly masterSpeakerLowPass: BiquadFilterNode;
  private readonly pulseVoice1: PulseVoice;
  private readonly pulseVoice2: PulseVoice;
  private readonly triangleVoice: TriangleVoice;
  private readonly noiseVoice: NoiseVoice;
  private readonly sampleVoice: SampleVoice;
  private readonly unsubscribeTransport: () => void;

  private constructor(
    context: AudioContext,
    masterGain: GainNode,
    masterDryGain: GainNode,
    masterSpeakerWetGain: GainNode,
    masterSpeakerHighPass: BiquadFilterNode,
    masterSpeakerLowPass: BiquadFilterNode,
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
    this.masterDryGain = masterDryGain;
    this.masterSpeakerWetGain = masterSpeakerWetGain;
    this.masterSpeakerHighPass = masterSpeakerHighPass;
    this.masterSpeakerLowPass = masterSpeakerLowPass;
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
    const masterDryGain = context.createGain();
    const masterSpeakerWetGain = context.createGain();
    const masterSpeakerHighPass = context.createBiquadFilter();
    const masterSpeakerLowPass = context.createBiquadFilter();

    masterGain.gain.value = 0.88;
    masterDryGain.gain.value = 1;
    masterSpeakerWetGain.gain.value = 0;
    configureOldSpeakerFilters(masterSpeakerHighPass, masterSpeakerLowPass);
    masterGain.connect(masterDryGain);
    masterDryGain.connect(context.destination);
    masterGain.connect(masterSpeakerHighPass);
    masterSpeakerHighPass.connect(masterSpeakerLowPass);
    masterSpeakerLowPass.connect(masterSpeakerWetGain);
    masterSpeakerWetGain.connect(context.destination);

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
      masterDryGain,
      masterSpeakerWetGain,
      masterSpeakerHighPass,
      masterSpeakerLowPass,
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

  setOldSpeakerMode(enabled: boolean) {
    this.masterDryGain.gain.value = enabled ? 0 : 1;
    this.masterSpeakerWetGain.gain.value = enabled ? 1 : 0;
  }

  setVoiceVolume(trackId: TrackId, volume: number) {
    this.voices[trackId].gain.gain.value = volume;
  }

  configureSong(song: SongDocument) {
    this.setMasterVolume(song.mixer.masterVolume);
    this.setOldSpeakerMode(song.mixer.oldSpeakerMode);
    getOrderedTracks(song).forEach((track) => {
      this.setVoiceVolume(track.id, track.muted ? 0 : track.volume);
    });
    this.pulseVoice1.configure(song.tracks.pulse1, song.transport);
    this.pulseVoice2.configure(song.tracks.pulse2, song.transport);
    this.triangleVoice.configure(song.tracks.triangle, song.transport);
    this.noiseVoice.configure(song.tracks.noise, song.transport);
    this.sampleVoice.configure(song.tracks.sample, song.samples, song.meta.engineMode);
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
  previewNote(trackId: MelodicTrackId, note: NoteValue, durationMs = 120, duty: PulseDutyValue = 0.5, volume = 0.25) {
    if (this.context.state !== "running") {
      return;
    }

    if (trackId === "pulse1") {
      this.pulseVoice1.previewNote(note, duty, durationMs, volume);
      return;
    }

    if (trackId === "pulse2") {
      this.pulseVoice2.previewNote(note, duty, durationMs, volume);
      return;
    }

    const now = this.context.currentTime;
    const durationSec = durationMs / 1000;
    const attackSec = 0.003;
    const releaseSec = 0.025;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(getFrequencyForNote(note), now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attackSec);
    gain.gain.setValueAtTime(volume, now + durationSec - releaseSec);
    gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

    oscillator.connect(gain);
    gain.connect(this.voices.triangle.input);

    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };

    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.01);
  }

  previewNoiseTrigger(presetId: NoiseTriggerPresetId, durationMs = 120) {
    if (this.context.state !== "running") {
      return;
    }

    const preset = getNoiseTriggerPresetById(presetId);

    if (preset === null) {
      return;
    }

    this.noiseVoice.previewStep(
      {
        volume: 0.78,
        mode: preset.mode,
        periodIndex: preset.periodIndex,
      },
      durationMs,
    );
  }

  previewNoiseConfig(mode: SongDocument["tracks"]["noise"]["steps"][number]["mode"], periodIndex: number, durationMs = 120) {
    if (this.context.state !== "running") {
      return;
    }

    this.noiseVoice.previewStep(
      {
        volume: 0.78,
        mode,
        periodIndex,
      },
      durationMs,
    );
  }

  previewSampleTrigger(sampleId: string, playbackRate = 1, durationMs = 250) {
    if (this.context.state !== "running") {
      return;
    }

    this.sampleVoice.previewSample(sampleId, playbackRate, durationMs, 0.82);
  }

  previewSampleNote(sampleId: string, baseNote: NoteValue, targetNote: NoteValue, durationMs = 250) {
    if (this.context.state !== "running") {
      return;
    }

    this.sampleVoice.previewSample(
      sampleId,
      getFrequencyForNote(targetNote) / getFrequencyForNote(baseNote),
      durationMs,
      0.82,
    );
  }

  async close() {
    if (this.context.state === "closed") {
      return;
    }

    this.unsubscribeTransport();
    this.transport.disconnect();
    this.masterGain.disconnect();
    this.masterDryGain.disconnect();
    this.masterSpeakerWetGain.disconnect();
    this.masterSpeakerHighPass.disconnect();
    this.masterSpeakerLowPass.disconnect();
    trackOrder.forEach((trackId) => {
      const voice = this.voices[trackId];
      voice.input.disconnect();
      voice.gain.disconnect();
      voice.analyser.disconnect();
    });
    await this.context.close();
  }
}
