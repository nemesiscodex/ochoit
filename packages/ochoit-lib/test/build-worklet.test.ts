// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { bundleTransportWorklet } from "../scripts/build-worklet.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("build-worklet", () => {
  it("bundles the transport worklet into a standalone module", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "ochoit-lib-worklet-"));
    temporaryDirectories.push(outputDirectory);

    const outputFile = await bundleTransportWorklet({ outDir: outputDirectory });
    const bundledWorklet = await readFile(outputFile, "utf8");

    expect(bundledWorklet).toContain('var TRANSPORT_WORKLET_NAME = "ochoit-transport-processor";');
    expect(bundledWorklet).toContain("registerProcessor(TRANSPORT_WORKLET_NAME, TransportProcessor);");
    expect(bundledWorklet).not.toContain('from "../core/transport-worklet-shared.js"');
    expect(bundledWorklet).not.toContain('from "../core/transport-scheduler.js"');
  });
});
