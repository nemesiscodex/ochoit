import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toaster, toast } from "@ochoit/ui/components/toast";

function stubViewport(isPhone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: isPhone,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderToastRegion() {
  const { container } = render(<Toaster />);

  act(() => {
    toast("Loaded Mario Theme");
  });

  const region = container.ownerDocument.querySelector("[data-side]");

  if (region === null) {
    throw new Error("Expected the toast region to render.");
  }

  return region;
}

describe("Toaster", () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
    cleanup();
    vi.unstubAllGlobals();
  });

  it("drops toasts in from the top centre on a phone, clear of the first lane", () => {
    stubViewport(true);

    const region = renderToastRegion();

    expect(region.getAttribute("data-side")).toBe("top");
    expect(region.getAttribute("data-align")).toBe("center");
  });

  it("keeps only the newest of several toasts reachable while the stack is collapsed", () => {
    stubViewport(true);

    const region = renderToastRegion();

    act(() => {
      toast("Share link copied");
      toast("Loaded the song from the link");
    });

    const toasts = [...region.querySelectorAll("[data-slot='toast']")];
    const reachable = toasts.filter((item) => !item.hasAttribute("inert"));

    expect(toasts).toHaveLength(3);
    expect(reachable.map((item) => item.textContent)).toEqual(["Loaded the song from the link"]);
  });

  it("keeps toasts in the bottom corner on wider screens", () => {
    stubViewport(false);

    const region = renderToastRegion();

    expect(region.getAttribute("data-side")).toBe("bottom");
    expect(region.getAttribute("data-align")).toBe("end");
  });
});
