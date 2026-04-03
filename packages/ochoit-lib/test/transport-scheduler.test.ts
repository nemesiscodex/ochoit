import { describe, expect, it } from "vitest";

import {
  collectScheduledSteps,
  configureTransportScheduler,
  createTransportSchedulerState,
  getTransportStepDuration,
  startTransportScheduler,
  stopTransportScheduler,
} from "../src/core/transport-scheduler";

describe("transport-scheduler", () => {
  it("computes a step duration from bpm and steps per beat", () => {
    expect(
      getTransportStepDuration({
        bpm: 120,
        stepsPerBeat: 4,
        loopLength: 16,
      }),
    ).toBe(0.125);
  });

  it("schedules step events inside the lookahead window", () => {
    const state = startTransportScheduler(
      createTransportSchedulerState(
        {
          bpm: 120,
          stepsPerBeat: 4,
          loopLength: 8,
        },
        0.1,
      ),
      0,
    );

    const result = collectScheduledSteps(state, 0.05);

    expect(result.scheduledSteps).toEqual([
      { step: 0, time: 0, loopCount: 0 },
      { step: 1, time: 0.125, loopCount: 0 },
    ]);
    expect(result.state.nextStep).toBe(2);
    expect(result.state.nextStepTime).toBe(0.25);
  });

  it("wraps to the next loop when the last step has been scheduled", () => {
    const state = startTransportScheduler(
      createTransportSchedulerState(
        {
          bpm: 60,
          stepsPerBeat: 2,
          loopLength: 4,
        },
        0,
      ),
      1,
      3,
    );

    const result = collectScheduledSteps(state, 2.1);

    expect(result.scheduledSteps).toEqual([
      { step: 3, time: 1, loopCount: 0 },
      { step: 0, time: 1.5, loopCount: 1 },
      { step: 1, time: 2, loopCount: 1 },
    ]);
    expect(result.state.nextStep).toBe(2);
    expect(result.state.loopCount).toBe(1);
    expect(result.state.nextStepTime).toBe(2.5);
  });

  it("normalizes the next step when the loop length changes and resets on stop", () => {
    const configured = configureTransportScheduler(
      {
        ...createTransportSchedulerState({
          bpm: 136,
          stepsPerBeat: 4,
          loopLength: 16,
        }),
        playing: true,
        nextStep: 11,
        nextStepTime: 2,
        loopCount: 2,
      },
      {
        bpm: 90,
        stepsPerBeat: 4,
        loopLength: 8,
      },
    );

    expect(configured.nextStep).toBe(3);

    expect(stopTransportScheduler(configured)).toMatchObject({
      playing: false,
      nextStep: 0,
      nextStepTime: null,
      loopCount: 0,
    });
  });
});
