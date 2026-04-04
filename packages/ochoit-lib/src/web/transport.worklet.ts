import {
  type TransportConfig,
  type TransportProcessorCommand,
  type TransportProcessorEvent,
  TRANSPORT_WORKLET_NAME,
} from "../core/transport-worklet-shared.js";
import {
  collectScheduledSteps,
  configureTransportScheduler,
  createTransportSchedulerState,
  startTransportScheduler,
  stopTransportScheduler,
  type TransportSchedulerState,
} from "../core/transport-scheduler.js";

const defaultTransportConfig: TransportConfig = {
  bpm: 136,
  stepsPerBeat: 4,
  loopLength: 16,
};

class TransportProcessor extends AudioWorkletProcessor {
  private schedulerState: TransportSchedulerState = createTransportSchedulerState(defaultTransportConfig);

  constructor() {
    super();

    this.port.onmessage = (messageEvent: MessageEvent<TransportProcessorCommand>) => {
      this.handleCommand(messageEvent.data);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0];
    output?.forEach((channel) => {
      channel.fill(0);
    });

    const frameCount = output?.[0]?.length ?? 128;
    const blockEndTime = currentTime + frameCount / sampleRate;
    const { state, scheduledSteps } = collectScheduledSteps(this.schedulerState, blockEndTime);
    this.schedulerState = state;

    if (scheduledSteps.length > 0) {
      this.postEvent({
        type: "scheduled-steps",
        steps: scheduledSteps,
      });

      this.postPlaybackState();
    }

    return true;
  }

  private handleCommand(command: TransportProcessorCommand) {
    switch (command.type) {
      case "configure": {
        this.schedulerState = configureTransportScheduler(
          this.schedulerState,
          command.config,
          command.lookaheadSeconds,
        );
        this.postPlaybackState();
        return;
      }
      case "start": {
        const startTime = command.startTime ?? currentTime;
        this.schedulerState = startTransportScheduler(this.schedulerState, startTime, command.step);
        this.postPlaybackState();
        return;
      }
      case "stop": {
        this.schedulerState = stopTransportScheduler(this.schedulerState);
        this.postPlaybackState();
      }
    }
  }

  private postPlaybackState() {
    this.postEvent({
      type: "playback-state",
      playing: this.schedulerState.playing,
      nextStep: this.schedulerState.nextStep,
      nextStepTime: this.schedulerState.nextStepTime,
      loopCount: this.schedulerState.loopCount,
    });
  }

  private postEvent(event: TransportProcessorEvent) {
    this.port.postMessage(event);
  }
}

registerProcessor(TRANSPORT_WORKLET_NAME, TransportProcessor);
