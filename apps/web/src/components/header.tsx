import { Github } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-white/[0.06] bg-[#07080e]/95 px-4 py-2.5 backdrop-blur-sm md:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-[var(--oc-pulse1)] to-[var(--oc-noise)]">
            <span className="font-[var(--oc-display)] text-xs font-black text-[#07080e]">O</span>
          </div>
          <div>
            <p className="font-[var(--oc-display)] text-base leading-tight font-bold tracking-wide text-white">
              Ochoit
            </p>
            <p className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.28em] text-white/40">
              8-Bit Workstation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
