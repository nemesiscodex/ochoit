import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createPlayheadStore, type PlayheadStore } from "@/features/audio/playhead-store";
import { usePlayheadSelector } from "@/features/audio/use-playhead-selector";

describe("playhead-store", () => {
  it("starts at the stopped playhead unless given one", () => {
    expect(createPlayheadStore().get()).toEqual({ nextStep: 0, loopCount: 0 });
    expect(createPlayheadStore({ nextStep: 7, loopCount: 2 }).get()).toEqual({ nextStep: 7, loopCount: 2 });
  });

  it("notifies once per changed playhead and ignores equal values", () => {
    const store = createPlayheadStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ nextStep: 0, loopCount: 0 });
    expect(listener).not.toHaveBeenCalled();

    store.set({ nextStep: 3, loopCount: 0 });
    store.set({ nextStep: 3, loopCount: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ nextStep: 3, loopCount: 0 });

    store.set({ nextStep: 3, loopCount: 1 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ nextStep: 3, loopCount: 1 });
  });

  it("stops notifying after unsubscribe", () => {
    const store = createPlayheadStore();
    const kept = vi.fn();
    const removed = vi.fn();
    store.subscribe(kept);
    const unsubscribe = store.subscribe(removed);

    unsubscribe();
    store.set({ nextStep: 1, loopCount: 0 });

    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("re-renders a selector consumer only when its selected value changes", () => {
    const store = createPlayheadStore();
    let renders = 0;

    function StepThreeLight({ playhead }: { playhead: PlayheadStore }) {
      const isLit = usePlayheadSelector(playhead, (current) => current.nextStep === 3);
      renders += 1;
      return <span aria-label="step three">{isLit ? "lit" : "dark"}</span>;
    }

    render(<StepThreeLight playhead={store} />);
    expect(renders).toBe(1);

    act(() => {
      store.set({ nextStep: 1, loopCount: 0 });
      store.set({ nextStep: 2, loopCount: 0 });
    });
    act(() => {
      store.set({ nextStep: 2, loopCount: 1 });
    });
    expect(renders).toBe(1);
    expect(screen.getByLabelText("step three").textContent).toBe("dark");

    act(() => {
      store.set({ nextStep: 3, loopCount: 1 });
    });
    expect(renders).toBe(2);
    expect(screen.getByLabelText("step three").textContent).toBe("lit");

    act(() => {
      store.set({ nextStep: 4, loopCount: 1 });
    });
    expect(renders).toBe(3);
    expect(screen.getByLabelText("step three").textContent).toBe("dark");
  });
});
