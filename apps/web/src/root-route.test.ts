import { describe, expect, it } from "vitest";

import { Route } from "@/routes/__root";

describe("root route head", () => {
  it("registers the Google Fonts stylesheet as a document link", async () => {
    const headFn = Route.options.head;

    expect(headFn).toBeDefined();

    const head = await headFn?.({} as Parameters<NonNullable<typeof headFn>>[0]);

    expect(head?.links).toContainEqual({
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Anybody:wght@400;700;900&display=swap",
    });
  });
});
