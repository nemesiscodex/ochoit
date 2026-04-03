declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;

  constructor(options?: unknown);

  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

declare const currentTime: number;
declare const sampleRate: number;
