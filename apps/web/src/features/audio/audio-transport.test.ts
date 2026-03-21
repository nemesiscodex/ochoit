import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioTransport, TRANSPORT_WORKLET_URL } from "@/features/audio/audio-transport";
import type {
  ScheduledTransportStep,
  TransportConfig,
  TransportProcessorEvent,
} from "@/features/audio/transport-worklet-shared";

class MockMessagePort {
  onmessage: ((event: MessageEvent<TransportProcessorEvent>) => void) | null = null;
  readonly postMessage = vi.fn<(message: unknown) => void>();

  emit(event: TransportProcessorEvent) {
    this.onmessage?.(new MessageEvent("message", { data: event }));
  }
}

class MockAudioWorkletNode {
  readonly port = new MockMessagePort();
  readonly connect = vi.fn<(node: AudioNode) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(
    readonly context: BaseAudioContext,
    readonly name: string,
    readonly options?: AudioWorkletNodeOptions,
  ) {}
}

function createMockGain() {
  return {
    gain: { value: 1 },
    connect: vi.fn<(node: AudioNode) => void>(),
    disconnect: vi.fn<() => void>(),
  } as unknown as GainNode;
}

function createMockAudioContext() {
  const sink = createMockGain();
  const destination = {} as AudioDestinationNode;
  const addModule = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);

  return {
    context: {
      audioWorklet: { addModule },
      createGain: vi.fn(() => sink),
      destination,
    } as unknown as AudioContext,
    sink,
    destination,
    addModule,
  };
}

function emitPlaybackState(node: MockAudioWorkletNode) {
  node.port.emit({
    type: "playback-state",
    playing: true,
    nextStep: 2,
    nextStepTime: 1.25,
    loopCount: 1,
  });
}

function emitScheduledSteps(node: MockAudioWorkletNode, steps: ScheduledTransportStep[]) {
  node.port.emit({
    type: "scheduled-steps",
    steps,
  });
}

describe("audio-transport", () => {
  let mockNode: MockAudioWorkletNode | null = null;

  beforeEach(() => {
    vi.stubGlobal(
      "AudioWorkletNode",
      class extends MockAudioWorkletNode {
        constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
          super(context, name, options);
          mockNode = this;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockNode = null;
  });

  it("loads the worklet module and posts transport commands", async () => {
    const { context, sink, destination, addModule } = createMockAudioContext();
    const transport = await AudioTransport.create(context);
    const config: TransportConfig = {
      bpm: 136,
      stepsPerBeat: 4,
      loopLength: 16,
    };

    expect(addModule).toHaveBeenCalledTimes(1);
    expect(addModule.mock.calls[0]?.[0]).toBe(TRANSPORT_WORKLET_URL);
    expect(mockNode?.connect).toHaveBeenCalledWith(sink);
    expect(sink.connect).toHaveBeenCalledWith(destination);

    transport.configure(config, 0.2);
    transport.start(2.5, 3);
    transport.stop();

    expect(mockNode?.port.postMessage).toHaveBeenNthCalledWith(1, {
      type: "configure",
      config,
      lookaheadSeconds: 0.2,
    });
    expect(mockNode?.port.postMessage).toHaveBeenNthCalledWith(2, {
      type: "start",
      startTime: 2.5,
      step: 3,
    });
    expect(mockNode?.port.postMessage).toHaveBeenNthCalledWith(3, {
      type: "stop",
    });
  });

  it("publishes processor events to subscribers and updates playback state", async () => {
    const { context } = createMockAudioContext();
    const transport = await AudioTransport.create(context);
    const listener = vi.fn<(event: unknown) => void>();

    const unsubscribe = transport.subscribe(listener);

    emitPlaybackState(mockNode as MockAudioWorkletNode);

    expect(transport.state).toEqual({
      playbackState: "playing",
      nextStep: 2,
      nextStepTime: 1.25,
      loopCount: 1,
    });
    expect(listener).toHaveBeenCalledWith({
      type: "playback-state",
      snapshot: {
        playbackState: "playing",
        nextStep: 2,
        nextStepTime: 1.25,
        loopCount: 1,
      },
    });

    const scheduledSteps: ScheduledTransportStep[] = [{ step: 2, time: 1.25, loopCount: 1 }];
    emitScheduledSteps(mockNode as MockAudioWorkletNode, scheduledSteps);

    expect(listener).toHaveBeenLastCalledWith({
      type: "scheduled-steps",
      steps: scheduledSteps,
    });

    unsubscribe();
    emitScheduledSteps(mockNode as MockAudioWorkletNode, [{ step: 3, time: 1.5, loopCount: 1 }]);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("disconnects the worklet node and sink during teardown", async () => {
    const { context, sink } = createMockAudioContext();
    const transport = await AudioTransport.create(context);

    transport.disconnect();

    expect(mockNode?.disconnect).toHaveBeenCalledTimes(1);
    expect(sink.disconnect).toHaveBeenCalledTimes(1);
    expect(mockNode?.port.onmessage).toBeNull();
  });
});
