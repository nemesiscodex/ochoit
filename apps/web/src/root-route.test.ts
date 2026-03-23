import { describe, expect, it } from "vitest";

import { Route } from "@/routes/__root";

describe("root route head", () => {
  it("registers the Google Fonts stylesheet as a document link", async () => {
    const headFn = Route.options.head;

    expect(headFn).toBeDefined();

    const head = await headFn?.({} as Parameters<NonNullable<typeof headFn>>[0]);

    expect(head?.links).toContainEqual({
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Anybody:wght@400;700;900&family=Press+Start+2P&display=swap",
    });
  });

  it("registers favicon and app icon links", async () => {
    const headFn = Route.options.head;
    const head = await headFn?.({} as Parameters<NonNullable<typeof headFn>>[0]);

    expect(head?.links).toContainEqual({
      rel: "icon",
      type: "image/x-icon",
      href: "/favicon.ico",
    });
    expect(head?.links).toContainEqual({
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      href: "/favicon-32x32.png",
    });
    expect(head?.links).toContainEqual({
      rel: "icon",
      type: "image/png",
      sizes: "16x16",
      href: "/favicon-16x16.png",
    });
    expect(head?.links).toContainEqual({
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon.png",
    });
  });

  it("registers canonical, open graph, and twitter metadata", async () => {
    const headFn = Route.options.head;
    const head = await headFn?.({} as Parameters<NonNullable<typeof headFn>>[0]);

    expect(head?.links).toContainEqual({
      rel: "canonical",
      href: "https://ochoit.nemesiscodex.org",
    });
    expect(head?.meta).toContainEqual({
      property: "og:type",
      content: "website",
    });
    expect(head?.meta).toContainEqual({
      property: "og:url",
      content: "https://ochoit.nemesiscodex.org",
    });
    expect(head?.meta).toContainEqual({
      property: "og:title",
      content: "Ochoit — Browser-Based 8-Bit Music Workstation",
    });
    expect(head?.meta).toContainEqual({
      property: "og:description",
      content:
        "Create NES-inspired music in the browser with pulse, triangle, noise, and PCM sample tracks. Record sounds, export WAV, or share songs by link.",
    });
    expect(head?.meta).toContainEqual({
      property: "og:site_name",
      content: "Ochoit",
    });
    expect(head?.meta).toContainEqual({
      property: "og:image",
      content: "https://ochoit.nemesiscodex.org/og-cover.png",
    });
    expect(head?.meta).toContainEqual({
      property: "og:image:alt",
      content: "Ochoit browser-based 8-bit music workstation",
    });
    expect(head?.meta).toContainEqual({
      property: "og:image:width",
      content: "1200",
    });
    expect(head?.meta).toContainEqual({
      property: "og:image:height",
      content: "630",
    });
    expect(head?.meta).toContainEqual({
      property: "og:logo",
      content: "https://ochoit.nemesiscodex.org/ochoit-logo.png",
    });
    expect(head?.meta).toContainEqual({
      name: "twitter:card",
      content: "summary_large_image",
    });
    expect(head?.meta).toContainEqual({
      name: "twitter:title",
      content: "Ochoit — Browser-Based 8-Bit Music Workstation",
    });
    expect(head?.meta).toContainEqual({
      name: "twitter:description",
      content:
        "Create NES-inspired music in the browser with pulse, triangle, noise, and PCM sample tracks. Record sounds, export WAV, or share songs by link.",
    });
    expect(head?.meta).toContainEqual({
      name: "twitter:image",
      content: "https://ochoit.nemesiscodex.org/og-cover.png",
    });
    expect(head?.meta).toContainEqual({
      name: "twitter:image:alt",
      content: "Ochoit browser-based 8-bit music workstation",
    });
  });
});
