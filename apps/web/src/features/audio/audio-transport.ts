import {
  DEFAULT_TRANSPORT_LOOKAHEAD_SECONDS,
  TRANSPORT_WORKLET_NAME,
  type ScheduledTransportStep,
  type TransportConfig,
  type TransportProcessorCommand,
  type TransportProcessorEvent,
} from "@/features/audio/transport-worklet-shared";
import transportWorkletUrl from "@/features/audio/transport.worklet.ts?url";

export type AudioTransportPlaybackState = "stopped" | "playing";

export type AudioTransportSnapshot = {
  playbackState: AudioTransportPlaybackState;
  nextStep: number;
  nextStepTime: number | null;
  loopCount: number;
};

export type AudioTransportEvent =
  | {
      type: "playback-state";
      snapshot: AudioTransportSnapshot;
    }
  | {
      type: "scheduled-steps";
      steps: ScheduledTransportStep[];
    };

type AudioTransportListener = (event: AudioTransportEvent) => void;

export const TRANSPORT_WORKLET_URL = transportWorkletUrl;

function createTransportWorkletUrl() {
  return TRANSPORT_WORKLET_URL;
}

export class AudioTransport {
  readonly node: AudioWorkletNode;
  readonly sink: GainNode;
  private snapshot: AudioTransportSnapshot = {
    playbackState: "stopped",
    nextStep: 0,
    nextStepTime: null,
    loopCount: 0,
  };
  private readonly listeners = new Set<AudioTransportListener>();

  private constructor(node: AudioWorkletNode, sink: GainNode) {
    this.node = node;
    this.sink = sink;
    this.node.port.onmessage = (messageEvent: MessageEvent<TransportProcessorEvent>) => {
      this.handleProcessorEvent(messageEvent.data);
    };
  }

  static async create(context: AudioContext) {
    if (typeof AudioWorkletNode === "undefined" || typeof context.audioWorklet?.addModule !== "function") {
      throw new Error("AudioWorklet is not available in this browser.");
    }

    await context.audioWorklet.addModule(createTransportWorkletUrl());

    const node = new AudioWorkletNode(context, TRANSPORT_WORKLET_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const sink = context.createGain();
    sink.gain.value = 0;

    node.connect(sink);
    sink.connect(context.destination);

    return new AudioTransport(node, sink);
  }

  get state() {
    return this.snapshot;
  }

  subscribe(listener: AudioTransportListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  configure(config: TransportConfig, lookaheadSeconds = DEFAULT_TRANSPORT_LOOKAHEAD_SECONDS) {
    this.postCommand({
      type: "configure",
      config,
      lookaheadSeconds,
    });
  }

  start(startTime?: number, step?: number) {
    this.postCommand({
      type: "start",
      startTime,
      step,
    });
  }

  stop() {
    this.postCommand({
      type: "stop",
    });
  }

  disconnect() {
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.sink.disconnect();
    this.listeners.clear();
  }

  private postCommand(command: TransportProcessorCommand) {
    this.node.port.postMessage(command);
  }

  private handleProcessorEvent(event: TransportProcessorEvent) {
    switch (event.type) {
      case "playback-state": {
        this.snapshot = {
          playbackState: event.playing ? "playing" : "stopped",
          nextStep: event.nextStep,
          nextStepTime: event.nextStepTime,
          loopCount: event.loopCount,
        };

        this.listeners.forEach((listener) => {
          listener({
            type: "playback-state",
            snapshot: this.snapshot,
          });
        });
        return;
      }
      case "scheduled-steps": {
        this.listeners.forEach((listener) => {
          listener({
            type: "scheduled-steps",
            steps: event.steps,
          });
        });
      }
    }
  }
}
