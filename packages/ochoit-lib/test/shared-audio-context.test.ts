import { afterEach, describe, expect, it, vi } from "vitest";

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  readonly options?: AudioContextOptions;
  state: AudioContextState = "suspended";
  resumeCallCount = 0;

  constructor(options?: AudioContextOptions) {
    this.options = options;
    MockAudioContext.instances.push(this);
  }

  async resume() {
    this.resumeCallCount += 1;
    this.state = "running";
  }
}

describe("shared-audio-context", () => {
  afterEach(() => {
    MockAudioContext.instances = [];
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("creates the shared audio context only once", async () => {
    vi.stubGlobal("AudioContext", MockAudioContext);
    const { getSharedAudioContext } = await import("../src/web/shared-audio-context");

    const firstContext = getSharedAudioContext({ latencyHint: "interactive" });
    const secondContext = getSharedAudioContext({ sampleRate: 44_100 });

    expect(firstContext).toBe(secondContext);
    expect(MockAudioContext.instances).toHaveLength(1);
    expect(MockAudioContext.instances[0]?.options).toEqual({
      latencyHint: "interactive",
    });
  });

  it("resumes the shared audio context when started", async () => {
    vi.stubGlobal("AudioContext", MockAudioContext);
    const { startSharedAudioContext } = await import("../src/web/shared-audio-context");

    const context = await startSharedAudioContext();

    expect(context.state).toBe("running");
    expect(MockAudioContext.instances[0]?.resumeCallCount).toBe(1);
  });
});
