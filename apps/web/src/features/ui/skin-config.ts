import { RETRO_THEMES, RetroThemeName, type RetroTheme } from "@/features/ui/retro-themes";

export const SKINS = ["classic", "8bitcn"] as const;
export const SKIN_MODES = ["light", "dark", "system"] as const;
export { RETRO_THEMES };
export type { RetroTheme };

export type Skin = (typeof SKINS)[number];
export type SkinMode = (typeof SKIN_MODES)[number];

export const DEFAULT_SKIN: Skin = "classic";
export const DEFAULT_RETRO_THEME: RetroTheme = RetroThemeName.Default;
export const DEFAULT_SKIN_MODE: SkinMode = "system";

export type SkinSearchInput = {
  skin?: string | null;
  theme?: string | null;
  mode?: string | null;
};

export type NormalizedSkinSearch =
  | {
      skin: "classic";
      theme: null;
      mode: null;
    }
  | {
      skin: "8bitcn";
      theme: RetroTheme;
      mode: SkinMode;
    };

export function isSkin(value: string | null | undefined): value is Skin {
  return typeof value === "string" && SKINS.includes(value as Skin);
}

export function isSkinMode(value: string | null | undefined): value is SkinMode {
  return typeof value === "string" && SKIN_MODES.includes(value as SkinMode);
}

export function isRetroTheme(value: string | null | undefined): value is RetroTheme {
  return typeof value === "string" && RETRO_THEMES.includes(value as RetroTheme);
}

export function normalizeSkinSearch(input: SkinSearchInput): NormalizedSkinSearch {
  if (input.skin !== "8bitcn") {
    return {
      skin: "classic",
      theme: null,
      mode: null,
    };
  }

  return {
    skin: "8bitcn",
    theme: isRetroTheme(input.theme) ? input.theme : DEFAULT_RETRO_THEME,
    mode: isSkinMode(input.mode) ? input.mode : DEFAULT_SKIN_MODE,
  };
}

export function getSkinSearchForClassic() {
  return {
    skin: "classic" as const,
    theme: null,
    mode: null,
  };
}

export function getSkinSearchFor8bitcn(
  theme: RetroTheme = DEFAULT_RETRO_THEME,
  mode: SkinMode | null = null,
) {
  return {
    skin: "8bitcn" as const,
    theme,
    mode,
  };
}

export function formatRetroThemeLabel(theme: RetroTheme) {
  return theme
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
