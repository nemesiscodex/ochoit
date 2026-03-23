import { Button as RetroButton } from "@ochoit/ui/components/ui/8bitcn/button";
import {
  Select as RetroSelect,
  SelectContent as RetroSelectContent,
  SelectItem as RetroSelectItem,
  SelectTrigger as RetroSelectTrigger,
  SelectValue as RetroSelectValue,
} from "@ochoit/ui/components/ui/8bitcn/select";
import { Github, Moon, Sun } from "lucide-react";
import { Label } from "@ochoit/ui/components/ui/8bitcn/label";
import {
  DEFAULT_RETRO_THEME,
  RETRO_THEMES,
  formatRetroThemeLabel,
  type NormalizedSkinSearch,
  type RetroTheme,
  type Skin,
} from "@/features/ui/skin-config";
import { useSkinSearch } from "@/features/ui/use-skin-search";
import { useTheme } from "next-themes";

type HeaderControls = {
  search: NormalizedSkinSearch;
  onSkinChange: (skin: Skin) => void;
  onThemeChange: (theme: RetroTheme) => void;
  onToggleMode: () => void;
};

type HeaderProps = {
  controls?: HeaderControls;
  resolvedMode?: "light" | "dark";
};

export default function Header(props: HeaderProps) {
  if (props.controls !== undefined) {
    return <HeaderView controls={props.controls} resolvedMode={props.resolvedMode ?? "dark"} />;
  }

  return <ConnectedHeader />;
}

function ConnectedHeader() {
  const { normalizedSearch, setRetroTheme, setSkin, toggleRetroMode } = useSkinSearch();
  const { resolvedTheme } = useTheme();

  return (
    <HeaderView
      controls={{
        search: normalizedSearch,
        onSkinChange: setSkin,
        onThemeChange: setRetroTheme,
        onToggleMode: () => toggleRetroMode(resolvedTheme === "dark" ? "dark" : "light"),
      }}
      resolvedMode={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}

function HeaderView({ controls, resolvedMode }: { controls: HeaderControls; resolvedMode: "light" | "dark" }) {
  const isRetro = controls.search.skin === "8bitcn";

  if (isRetro) {
    return <RetroHeaderView controls={controls} resolvedMode={resolvedMode} />;
  }

  return <ClassicHeaderView controls={controls} />;
}

function ClassicHeaderView({ controls }: { controls: HeaderControls }) {
  return (
    <header className="border-b border-white/[0.06] bg-[#07080e]/95 px-4 py-2.5 backdrop-blur-sm md:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/ochoit-logo.png"
            alt="Ochoit logo"
            className="size-10 rounded-md object-contain shadow-[0_0_18px_rgba(92,184,255,0.18)]"
          />
          <div>
            <p className="font-[var(--oc-display)] text-base leading-tight font-bold tracking-wide text-white">Ochoit</p>
            <p className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.28em] text-white/40">
              8-Bit Workstation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SkinSelect activeSkin={controls.search.skin} onSkinChange={controls.onSkinChange} retro={false} />
          <a
            href="https://github.com/nemesiscodex/ochoit"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.18em] text-white/60 transition hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white"
            aria-label="Open GitHub repository"
          >
            <Github className="size-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <div className="flex items-center gap-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.2em] text-white/35">
            <span className="hidden sm:inline">NES-Inspired Sequencer</span>
            <div className="size-1.5 rounded-full bg-[var(--oc-play)]" />
          </div>
        </div>
      </div>
    </header>
  );
}

function RetroHeaderView({ controls, resolvedMode }: { controls: HeaderControls; resolvedMode: "light" | "dark" }) {
  return (
    <header className="border-b border-border bg-card px-4 py-3 md:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/ochoit-logo.png"
            alt="Ochoit logo"
            className="size-10 object-contain"
          />
          <div>
            <p className="text-sm leading-tight font-bold text-foreground">Ochoit</p>
            <p className="text-[7px] uppercase tracking-[0.2em] text-muted-foreground">
              8-Bit Workstation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RetroModeToggle mode={resolvedMode} onClick={controls.onToggleMode} />
          <RetroThemeSelect
            activeTheme={controls.search.skin === "8bitcn" ? controls.search.theme : DEFAULT_RETRO_THEME}
            onThemeChange={controls.onThemeChange}
          />
          <SkinSelect activeSkin={controls.search.skin} onSkinChange={controls.onSkinChange} retro />
          <a
            href="https://github.com/nemesiscodex/ochoit"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub repository"
          >
            <RetroButton variant="outline" className="gap-2">
              <Github className="size-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </RetroButton>
            
          </a>
          <Label>NES-Inspired Sequencer</Label>
        </div>
      </div>
    </header>
  );
}

function SkinSelect({
  activeSkin,
  onSkinChange,
  retro,
}: {
  activeSkin: Skin;
  onSkinChange: (skin: Skin) => void;
  retro: boolean;
}) {
  if (retro) {
    return (
      <RetroSelect value={activeSkin} onValueChange={(value) => onSkinChange(value as Skin)}>
        <RetroSelectTrigger aria-label="Skin" className="min-w-32">
          <RetroSelectValue placeholder="Skin" />
        </RetroSelectTrigger>
        <RetroSelectContent>
          <RetroSelectItem value="classic">classic</RetroSelectItem>
          <RetroSelectItem value="8bitcn">8bitcn</RetroSelectItem>
        </RetroSelectContent>
      </RetroSelect>
    );
  }

  return (
    <label className="relative">
      <span className="sr-only">Skin</span>
      <select
        aria-label="Skin"
        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.18em] text-white/70 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.08]"
        value={activeSkin}
        onChange={(event) => onSkinChange(event.target.value as Skin)}
      >
        <option value="classic">classic</option>
        <option value="8bitcn">8bitcn</option>
      </select>
    </label>
  );
}

function RetroThemeSelect({
  activeTheme,
  onThemeChange,
}: {
  activeTheme: RetroTheme;
  onThemeChange: (theme: RetroTheme) => void;
}) {
  return (
    <RetroSelect value={activeTheme} onValueChange={(value) => onThemeChange(value as RetroTheme)}>
      <RetroSelectTrigger aria-label="Retro theme" className="min-w-40">
        <RetroSelectValue placeholder="Retro theme" />
      </RetroSelectTrigger>
      <RetroSelectContent>
        {RETRO_THEMES.map((theme) => (
          <RetroSelectItem key={theme} value={theme}>
            {formatRetroThemeLabel(theme)}
          </RetroSelectItem>
        ))}
      </RetroSelectContent>
    </RetroSelect>
  );
}

function RetroModeToggle({ mode, onClick }: { mode: "light" | "dark"; onClick: () => void }) {
  return (
    <RetroButton
      aria-label="Toggle retro mode"
      className="retro"
      size="icon"
      variant="outline"
      onClick={onClick}
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </RetroButton>
  );
}
