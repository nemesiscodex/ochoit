import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const defaultEntryPoint = path.join(packageDirectory, "src/web/transport.worklet.ts");
const defaultOutputDirectory = path.join(packageDirectory, "dist/web");

export async function bundleTransportWorklet(options = {}) {
  const outputDirectory = options.outDir ?? defaultOutputDirectory;
  const outputFile = path.join(outputDirectory, "transport.worklet.js");

  await mkdir(outputDirectory, { recursive: true });

  await build({
    bundle: true,
    entryPoints: [defaultEntryPoint],
    format: "esm",
    legalComments: "none",
    outfile: outputFile,
    platform: "browser",
    sourcemap: true,
    target: "es2022",
  });

  return outputFile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await bundleTransportWorklet();
}
