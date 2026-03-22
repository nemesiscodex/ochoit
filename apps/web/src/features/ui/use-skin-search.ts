import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo } from "react";

import {
  DEFAULT_RETRO_THEME,
  DEFAULT_SKIN_MODE,
  RETRO_THEMES,
  SKINS,
  SKIN_MODES,
  getSkinSearchFor8bitcn,
  getSkinSearchForClassic,
  normalizeSkinSearch,
  type RetroTheme,
  type Skin,
  type SkinMode,
} from "@/features/ui/skin-config";

const skinSearchParsers = {
  skin: parseAsStringLiteral(SKINS),
  theme: parseAsStringLiteral(RETRO_THEMES),
  mode: parseAsStringLiteral(SKIN_MODES),
};

export function useSkinSearch() {
  const [rawSearch, setRawSearch] = useQueryStates(skinSearchParsers, {
    history: "replace",
    shallow: true,
  });

  const normalizedSearch = useMemo(() => normalizeSkinSearch(rawSearch), [rawSearch]);

  return {
    normalizedSearch,
    rawSearch,
    setClassicSkin: () => setRawSearch(getSkinSearchForClassic()),
    setSkin: (skin: Skin) =>
      skin === "classic"
        ? setRawSearch(getSkinSearchForClassic())
        : setRawSearch(getSkinSearchFor8bitcn(DEFAULT_RETRO_THEME, null)),
    setRetroTheme: (theme: RetroTheme) =>
      setRawSearch({
        skin: "8bitcn",
        theme,
      }),
    setRetroMode: (mode: SkinMode | null) =>
      setRawSearch({
        skin: "8bitcn",
        mode,
      }),
    toggleRetroMode: (resolvedMode: Exclude<SkinMode, "system">) =>
      setRawSearch({
        skin: "8bitcn",
        mode:
          (normalizedSearch.skin === "8bitcn" ? normalizedSearch.mode : DEFAULT_SKIN_MODE) === "dark"
            ? "light"
            : resolvedMode === "dark"
              ? "light"
              : "dark",
      }),
  };
}
