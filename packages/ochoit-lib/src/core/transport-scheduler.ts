import {
  DEFAULT_TRANSPORT_LOOKAHEAD_SECONDS,
  type ScheduledTransportStep,
  type TransportConfig,
} from "./transport-worklet-shared";

export type TransportSchedulerState = {
  config: TransportConfig;
  lookaheadSeconds: number;
  playing: boolean;
  nextStep: number;
  nextStepTime: number | null;
  loopCount: number;
};

export function getTransportStepDuration({ bpm, stepsPerBeat }: TransportConfig) {
  return 60 / bpm / stepsPerBeat;
}

export function normalizeTransportStep(step: number, loopLength: number) {
  const normalizedStep = ((step % loopLength) + loopLength) % loopLength;
  return normalizedStep;
}

export function createTransportSchedulerState(
  config: TransportConfig,
  lookaheadSeconds = DEFAULT_TRANSPORT_LOOKAHEAD_SECONDS,
): TransportSchedulerState {
  return {
    config,
    lookaheadSeconds,
    playing: false,
    nextStep: 0,
    nextStepTime: null,
    loopCount: 0,
  };
}

export function configureTransportScheduler(
  state: TransportSchedulerState,
  config: TransportConfig,
  lookaheadSeconds = state.lookaheadSeconds,
): TransportSchedulerState {
  return {
    ...state,
    config,
    lookaheadSeconds,
    nextStep: normalizeTransportStep(state.nextStep, config.loopLength),
  };
}

export function startTransportScheduler(
  state: TransportSchedulerState,
  startTime: number,
  step = state.nextStep,
): TransportSchedulerState {
  return {
    ...state,
    playing: true,
    nextStep: normalizeTransportStep(step, state.config.loopLength),
    nextStepTime: startTime,
  };
}

export function stopTransportScheduler(state: TransportSchedulerState): TransportSchedulerState {
  return {
    ...state,
    playing: false,
    nextStep: 0,
    nextStepTime: null,
    loopCount: 0,
  };
}

export function collectScheduledSteps(
  state: TransportSchedulerState,
  blockEndTime: number,
): {
  state: TransportSchedulerState;
  scheduledSteps: ScheduledTransportStep[];
} {
  if (!state.playing || state.nextStepTime === null) {
    return {
      state,
      scheduledSteps: [],
    };
  }

  const scheduledSteps: ScheduledTransportStep[] = [];
  const scheduleWindowEnd = blockEndTime + state.lookaheadSeconds;
  const stepDuration = getTransportStepDuration(state.config);
  let nextStep = state.nextStep;
  let nextStepTime = state.nextStepTime;
  let loopCount = state.loopCount;

  while (nextStepTime < scheduleWindowEnd) {
    scheduledSteps.push({
      step: nextStep,
      time: nextStepTime,
      loopCount,
    });

    nextStep += 1;
    if (nextStep >= state.config.loopLength) {
      nextStep = 0;
      loopCount += 1;
    }

    nextStepTime += stepDuration;
  }

  return {
    state: {
      ...state,
      nextStep,
      nextStepTime,
      loopCount,
    },
    scheduledSteps,
  };
}
