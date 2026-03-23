import { ThemeProvider, useTheme } from "next-themes";
import { type ReactNode, useEffect, useMemo } from "react";

import { getRetroThemeCss } from "@/features/ui/retro-themes";
import { SkinRuntimeProvider } from "@/features/ui/skin-runtime";
import { useSkinSearch } from "@/features/ui/use-skin-search";

export function AppSkinProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey="ochoit-mode"
    >
      <SkinProviderBridge>{children}</SkinProviderBridge>
    </ThemeProvider>
  );
}

function SkinProviderBridge({ children }: { children: ReactNode }) {
  const { normalizedSearch } = useSkinSearch();
  const { resolvedTheme, setTheme } = useTheme();
  const retroThemeCode = useMemo(
    () => (normalizedSearch.skin === "8bitcn" ? getRetroThemeCss(normalizedSearch.theme) : null),
    [normalizedSearch],
  );

  useEffect(() => {
    const targets = [document.documentElement, document.body];

    for (const target of targets) {
      const themeClasses = Array.from(target.classList).filter((className) => className.startsWith("theme-"));

      for (const className of themeClasses) {
        target.classList.remove(className);
      }

      target.dataset.skin = normalizedSearch.skin;

      if (normalizedSearch.skin === "8bitcn") {
        target.classList.add(`theme-${normalizedSearch.theme}`);
      }
    }
  }, [normalizedSearch]);

  useEffect(() => {
    if (normalizedSearch.skin === "classic") {
      if (resolvedTheme !== "dark") {
        setTheme("dark");
      }
      return;
    }

    setTheme(normalizedSearch.mode);
  }, [normalizedSearch, resolvedTheme, setTheme]);

  return (
    <>
      {retroThemeCode === null ? null : <style data-ochoit-retro-theme>{retroThemeCode}</style>}
      <SkinRuntimeProvider skin={normalizedSearch.skin}>{children}</SkinRuntimeProvider>
    </>
  );
}
