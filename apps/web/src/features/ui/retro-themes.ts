export const RetroThemeName = {
  Default: "default",
  Sega: "sega",
  Gameboy: "gameboy",
  Atari: "atari",
  Nintendo: "nintendo",
  Arcade: "arcade",
  NeoGeo: "neo-geo",
  SoftPop: "soft-pop",
  Pacman: "pacman",
  VHS: "vhs",
  RustyByte: "rusty-byte",
  Zelda: "zelda",
  DungeonTorch: "dungeon-torch",
  SpaceStation: "space-station",
  PixelForest: "pixel-forest",
  IceCavern: "ice-cavern",
  LavaCore: "lava-core",
  GlitchMode: "glitch-mode",
  DwarvenVault: "dwarven-vault",
  DragonHoard: "dragon-hoard",
  AncientRunes: "ancient-runes",
} as const;

export type RetroTheme = (typeof RetroThemeName)[keyof typeof RetroThemeName];

const retroThemePalette = {
  [RetroThemeName.Default]: { primary: "#111827", accent: "#6d28d9", ring: "#6b7280", charts: ["#111827", "#4b5563", "#0f766e", "#d97706", "#dc2626"] },
  [RetroThemeName.Sega]: { primary: "#0055a4", accent: "#15a3ff", ring: "#1d4ed8", charts: ["#0055a4", "#60a5fa", "#1d4ed8", "#93c5fd", "#0f172a"] },
  [RetroThemeName.Gameboy]: { primary: "#3f5f2a", accent: "#8bac0f", ring: "#5f7f38", charts: ["#1d2b1f", "#3f5f2a", "#6f8f3c", "#8bac0f", "#b8d070"] },
  [RetroThemeName.Atari]: { primary: "#7a4009", accent: "#f97316", ring: "#9a3412", charts: ["#7a4009", "#ea580c", "#fb923c", "#facc15", "#1f2937"] },
  [RetroThemeName.Nintendo]: { primary: "#104cb0", accent: "#ef4444", ring: "#1d4ed8", charts: ["#104cb0", "#ef4444", "#fbbf24", "#22c55e", "#f8fafc"] },
  [RetroThemeName.Arcade]: { primary: "#f07cd4", accent: "#7c3aed", ring: "#ec4899", charts: ["#f07cd4", "#7c3aed", "#f59e0b", "#06b6d4", "#ef4444"] },
  [RetroThemeName.NeoGeo]: { primary: "#dc2626", accent: "#111827", ring: "#991b1b", charts: ["#dc2626", "#111827", "#f59e0b", "#f8fafc", "#22c55e"] },
  [RetroThemeName.SoftPop]: { primary: "#4b3f99", accent: "#fb7185", ring: "#8b5cf6", charts: ["#4b3f99", "#fb7185", "#f59e0b", "#34d399", "#f8fafc"] },
  [RetroThemeName.Pacman]: { primary: "#ffcc00", accent: "#2563eb", ring: "#f59e0b", charts: ["#ffcc00", "#2563eb", "#ef4444", "#f8fafc", "#111827"] },
  [RetroThemeName.VHS]: { primary: "#8b5cf6", accent: "#22d3ee", ring: "#a855f7", charts: ["#8b5cf6", "#22d3ee", "#f472b6", "#f59e0b", "#0f172a"] },
  [RetroThemeName.RustyByte]: { primary: "#d2691e", accent: "#92400e", ring: "#ea580c", charts: ["#d2691e", "#92400e", "#fbbf24", "#78350f", "#1f2937"] },
  [RetroThemeName.Zelda]: { primary: "#b58900", accent: "#166534", ring: "#ca8a04", charts: ["#b58900", "#166534", "#65a30d", "#92400e", "#0f172a"] },
  [RetroThemeName.DungeonTorch]: { primary: "#c87533", accent: "#7f1d1d", ring: "#ea580c", charts: ["#c87533", "#7f1d1d", "#f59e0b", "#78716c", "#1c1917"] },
  [RetroThemeName.SpaceStation]: { primary: "#2196f3", accent: "#0f172a", ring: "#38bdf8", charts: ["#2196f3", "#0f172a", "#94a3b8", "#06b6d4", "#e2e8f0"] },
  [RetroThemeName.PixelForest]: { primary: "#4caf50", accent: "#166534", ring: "#22c55e", charts: ["#4caf50", "#166534", "#84cc16", "#a3e635", "#14532d"] },
  [RetroThemeName.IceCavern]: { primary: "#81d4fa", accent: "#0369a1", ring: "#38bdf8", charts: ["#81d4fa", "#0369a1", "#22d3ee", "#e0f2fe", "#0f172a"] },
  [RetroThemeName.LavaCore]: { primary: "#e64a19", accent: "#7f1d1d", ring: "#f97316", charts: ["#e64a19", "#7f1d1d", "#f59e0b", "#fca5a5", "#1f2937"] },
  [RetroThemeName.GlitchMode]: { primary: "#00ffcc", accent: "#111827", ring: "#22d3ee", charts: ["#00ffcc", "#111827", "#f472b6", "#8b5cf6", "#f8fafc"] },
  [RetroThemeName.DwarvenVault]: { primary: "#c8a600", accent: "#78350f", ring: "#ca8a04", charts: ["#c8a600", "#78350f", "#fbbf24", "#57534e", "#1c1917"] },
  [RetroThemeName.DragonHoard]: { primary: "#c62828", accent: "#f59e0b", ring: "#dc2626", charts: ["#c62828", "#f59e0b", "#7f1d1d", "#fca5a5", "#111827"] },
  [RetroThemeName.AncientRunes]: { primary: "#009688", accent: "#d97706", ring: "#0f766e", charts: ["#009688", "#d97706", "#334155", "#67e8f9", "#f8fafc"] },
} satisfies Record<RetroTheme, { primary: string; accent: string; ring: string; charts: [string, string, string, string, string] }>;

export const RETRO_THEMES = Object.values(RetroThemeName);

export function getRetroThemeCss(theme: RetroTheme) {
  const palette = retroThemePalette[theme];

  return `
    :root {
      --radius: 0rem;
      --background: #f7f4ea;
      --foreground: #171717;
      --card: #fffaf0;
      --card-foreground: #171717;
      --popover: #fffaf0;
      --popover-foreground: #171717;
      --primary: ${palette.primary};
      --primary-foreground: #ffffff;
      --secondary: #ede7d4;
      --secondary-foreground: #171717;
      --muted: #ece8dc;
      --muted-foreground: #4b5563;
      --accent: ${palette.accent};
      --accent-foreground: #ffffff;
      --destructive: #dc2626;
      --border: ${palette.ring};
      --input: #efe7d2;
      --ring: ${palette.ring};
      --chart-1: ${palette.charts[0]};
      --chart-2: ${palette.charts[1]};
      --chart-3: ${palette.charts[2]};
      --chart-4: ${palette.charts[3]};
      --chart-5: ${palette.charts[4]};
    }

    .dark {
      --background: #111111;
      --foreground: #f7f1df;
      --card: #181818;
      --card-foreground: #f7f1df;
      --popover: #181818;
      --popover-foreground: #f7f1df;
      --primary: ${palette.primary};
      --primary-foreground: #ffffff;
      --secondary: #1f1f1f;
      --secondary-foreground: #f7f1df;
      --muted: #171717;
      --muted-foreground: #b5b0a1;
      --accent: ${palette.accent};
      --accent-foreground: #ffffff;
      --destructive: #f87171;
      --border: ${palette.ring};
      --input: #202020;
      --ring: ${palette.ring};
      --chart-1: ${palette.charts[0]};
      --chart-2: ${palette.charts[1]};
      --chart-3: ${palette.charts[2]};
      --chart-4: ${palette.charts[3]};
      --chart-5: ${palette.charts[4]};
    }
  `;
}
