import { describe, expect, it } from "vitest";

import {
  SAMPLE_RECORDING_TARGET_RATE,
  SAMPLE_RECORDING_WAVEFORM_SIZE,
  createRecordedSampleAsset,
  createWaveformFromPcm,
  getNextMicSampleId,
} from "@/features/audio/sample-recorder";
import { createDefaultSongDocument } from "@/features/song/song-document";

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly length: number;
  private readonly channels: Float32Array[];

  constructor(channels: number[][], sampleRate: number) {
    this.channels = channels.map((channel) => Float32Array.from(channel));
    this.numberOfChannels = this.channels.length;
    this.sampleRate = sampleRate;
    this.length = this.channels[0]?.length ?? 0;
  }

  getChannelData(channel: number) {
    const channelData = this.channels[channel];

    if (channelData === undefined) {
      throw new Error(`Missing mock audio channel ${channel}.`);
    }

    return channelData;
  }
}

describe("sample-recorder", () => {
  it("increments microphone sample ids from the existing deck", () => {
    const song = createDefaultSongDocument();

    expect(getNextMicSampleId(song.samples)).toBe("mic-002");
  });

  it("converts a recorded buffer into a mono serialized sample asset", () => {
    const song = createDefaultSongDocument();
    const buffer = new MockAudioBuffer(
      [
        [1, 0, -1, 0],
        [1, 0, -1, 0],
      ],
      22_050,
    );

    const recording = createRecordedSampleAsset(buffer, song.samples);

    expect(recording.asset.id).toBe("mic-002");
    expect(recording.asset.name).toBe("mic-002");
    expect(recording.asset.channels).toBe(1);
    expect(recording.asset.baseNote).toBe("C4");
    expect(recording.asset.detectedBaseNote).toBeNull();
    expect(recording.asset.sampleRate).toBe(SAMPLE_RECORDING_TARGET_RATE);
    expect(recording.asset.frameCount).toBe(2);
    expect(recording.asset.trim).toEqual({
      startFrame: 0,
      endFrame: 2,
    });
    expect(recording.asset.pcm).toEqual([0.5, -0.5]);
    expect(recording.durationMs).toBe(0);
    expect(recording.waveform).toHaveLength(SAMPLE_RECORDING_WAVEFORM_SIZE);
    expect(recording.waveform[0]).toBeGreaterThan(128);
    expect(recording.waveform[recording.waveform.length - 1]).toBeLessThan(128);
  });

  it("captures bucket peaks so oscillating recordings do not collapse into a flat preview", () => {
    const waveform = createWaveformFromPcm([1, -1, 1, -1, 1, -1, 1, -1], 4);

    expect(Array.from(waveform)).toEqual([240, 16, 240, 16]);
  });
});
