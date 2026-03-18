export const TRANSPORT_WORKLET_NAME = "ochoit-transport-processor";
export const DEFAULT_TRANSPORT_LOOKAHEAD_SECONDS = 0.1;

export type TransportConfig = {
  bpm: number;
  stepsPerBeat: number;
  loopLength: number;
};

export type ScheduledTransportStep = {
  step: number;
  time: number;
  loopCount: number;
};

export type TransportProcessorCommand =
  | {
      type: "configure";
      config: TransportConfig;
      lookaheadSeconds?: number;
    }
  | {
      type: "start";
      startTime?: number;
      step?: number;
    }
  | {
      type: "stop";
    };

export type TransportProcessorEvent =
  | {
      type: "playback-state";
      playing: boolean;
      nextStep: number;
      nextStepTime: number | null;
      loopCount: number;
    }
  | {
      type: "scheduled-steps";
      steps: ScheduledTransportStep[];
    };
