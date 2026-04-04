let sharedAudioContext: AudioContext | null = null;

function createAudioContext(options?: AudioContextOptions) {
  if (typeof AudioContext === "undefined") {
    throw new Error("Web Audio is not available in this browser.");
  }

  return new AudioContext(options);
}

export function getSharedAudioContext(options?: AudioContextOptions) {
  sharedAudioContext ??= createAudioContext(options);
  return sharedAudioContext;
}

export async function startSharedAudioContext(options?: AudioContextOptions) {
  const context = getSharedAudioContext(options);

  if (context.state !== "running") {
    await context.resume();
  }

  return context;
}
