import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Header from "@/components/header";
import type { NormalizedSkinSearch, RetroTheme, Skin } from "@/features/ui/skin-config";

function renderHeader(
  search: NormalizedSkinSearch = {
    skin: "classic",
    theme: null,
    mode: null,
  },
) {
  const onSkinChange = vi.fn<(skin: Skin) => void>();
  const onThemeChange = vi.fn<(theme: RetroTheme) => void>();
  const onToggleMode = vi.fn<() => void>();

  render(
    <Header
      controls={{
        search,
        onSkinChange,
        onThemeChange,
        onToggleMode,
      }}
      resolvedMode="dark"
    />,
  );

  return { onSkinChange, onThemeChange, onToggleMode };
}

describe("header", () => {
  it("renders the page logo from the public assets folder", () => {
    renderHeader();

    const logo = screen.getByRole("img", { name: "Ochoit logo" });

    expect(logo.getAttribute("src")).toBe("/ochoit-logo.png");
  });

  it("renders a GitHub link to the repository", () => {
    renderHeader();

    const githubLink = screen.getByRole("link", { name: "Open GitHub repository" });

    expect(githubLink.getAttribute("href")).toBe("https://github.com/nemesiscodex/ochoit");
    expect(githubLink.getAttribute("target")).toBe("_blank");
    expect(githubLink.getAttribute("rel")).toBe("noreferrer");
  });

  it("shows the skin dropdown in classic mode and hides retro-only controls", () => {
    renderHeader();

    expect(screen.getByLabelText("Skin")).toBeTruthy();
    expect(screen.queryByLabelText("Retro theme")).toBeNull();
    expect(screen.queryByLabelText("Toggle retro mode")).toBeNull();
  });

  it("shows retro theme and mode controls when 8bitcn is active", () => {
    renderHeader({
      skin: "8bitcn",
      theme: "nintendo",
      mode: "light",
    });

    expect(screen.getByLabelText("Skin")).toBeTruthy();
    expect(screen.getByLabelText("Retro theme")).toBeTruthy();
    expect(screen.getByLabelText("Toggle retro mode")).toBeTruthy();
  });

  it("changes skin through the classic selector", () => {
    const { onSkinChange } = renderHeader();

    fireEvent.change(screen.getByLabelText("Skin"), {
      target: { value: "8bitcn" },
    });

    expect(onSkinChange).toHaveBeenCalledWith("8bitcn");
  });

  it("calls the retro mode toggle without affecting the repository link", () => {
    const { onToggleMode } = renderHeader({
      skin: "8bitcn",
      theme: "nintendo",
      mode: "dark",
    });

    fireEvent.click(screen.getByLabelText("Toggle retro mode"));

    expect(onToggleMode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Open GitHub repository" }).getAttribute("href")).toContain("github.com");
  });
});
