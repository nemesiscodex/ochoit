export async function copyTextToClipboard(value: string) {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    return false;
  }
}

export function downloadBlobFile(blob: Blob, fileName: string) {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("This browser cannot download WAV files.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the blob URL.
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1_000);
}

export function clearSongShareFromCurrentUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.toString());
}
