import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETRO_THEME,
  DEFAULT_SKIN_MODE,
  formatRetroThemeLabel,
  getSkinSearchFor8bitcn,
  getSkinSearchForClassic,
  normalizeSkinSearch,
} from "@/features/ui/skin-config";

describe("skin-config", () => {
  it("defaults to classic when skin is missing or invalid", () => {
    expect(normalizeSkinSearch({})).toEqual({
      skin: "classic",
      theme: null,
      mode: null,
    });
    expect(normalizeSkinSearch({ skin: "broken" })).toEqual({
      skin: "classic",
      theme: null,
      mode: null,
    });
  });

  it("defaults 8bitcn theme and mode when they are missing", () => {
    expect(normalizeSkinSearch({ skin: "8bitcn" })).toEqual({
      skin: "8bitcn",
      theme: DEFAULT_RETRO_THEME,
      mode: DEFAULT_SKIN_MODE,
    });
  });

  it("drops invalid 8bitcn values back to defaults", () => {
    expect(normalizeSkinSearch({ skin: "8bitcn", theme: "broken", mode: "broken" })).toEqual({
      skin: "8bitcn",
      theme: DEFAULT_RETRO_THEME,
      mode: DEFAULT_SKIN_MODE,
    });
  });

  it("builds normalized search payloads for classic and 8bitcn", () => {
    expect(getSkinSearchForClassic()).toEqual({
      skin: "classic",
      theme: null,
      mode: null,
    });
    expect(getSkinSearchFor8bitcn("nintendo", null)).toEqual({
      skin: "8bitcn",
      theme: "nintendo",
      mode: null,
    });
  });

  it("formats retro theme labels for dropdowns", () => {
    expect(formatRetroThemeLabel("neo-geo")).toBe("Neo Geo");
  });
});
