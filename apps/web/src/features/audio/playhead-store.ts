export type Playhead = Readonly<{ nextStep: number; loopCount: number }>;

export type PlayheadStore = {
  get: () => Playhead;
  set: (next: Playhead) => void;
  subscribe: (listener: () => void) => () => void;
};

export const stoppedPlayhead: Playhead = { nextStep: 0, loopCount: 0 };

export function createPlayheadStore(initial: Playhead = stoppedPlayhead): PlayheadStore {
  let current: Playhead = { nextStep: initial.nextStep, loopCount: initial.loopCount };
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set: (next) => {
      if (next.nextStep === current.nextStep && next.loopCount === current.loopCount) {
        return;
      }

      current = { nextStep: next.nextStep, loopCount: next.loopCount };
      listeners.forEach((listener) => {
        listener();
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
