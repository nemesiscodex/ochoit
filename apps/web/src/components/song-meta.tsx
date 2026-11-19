import { Input } from "@ochoit/ui/components/input";
import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { memo } from "react";
import { type SongDocument, type SongEdit } from "ochoit-lib";

import { type AudioBootstrapState } from "@/features/audio/use-audio-engine";
import { formatEngineModeLabel, getPcmModeLabel, getPcmModeSummary } from "@/features/song/pcm-mode";

export const SongMeta = memo(function SongMeta({
  author,
  bpm,
  engineMode: songEngineMode,
  engineState,
  loopLength,
  name,
  onEdit,
  trackCount,
}: {
  author: string;
  bpm: number;
  engineMode: SongDocument["meta"]["engineMode"];
  engineState: AudioBootstrapState;
  loopLength: number;
  name: string;
  onEdit: (edit: SongEdit) => void;
  trackCount: number;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-4">
      <h2 className="mb-3 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
        Song Info
      </h2>
      <div className="mb-3 grid gap-1.5">
        <label
          htmlFor="song-name"
          className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35"
        >
          Song Name
        </label>
        <Input
          id="song-name"
          aria-label="Song Name"
          maxLength={80}
          value={name}
          className="h-8 border-white/[0.08] bg-black/30 px-2.5 font-[var(--oc-mono)] text-[11px] text-white placeholder:text-white/20"
          onChange={(event) => {
            onEdit({ type: "set-song-name", name: event.currentTarget.value });
          }}
        />
      </div>
      <div className="mb-3 grid gap-1.5">
        <label
          htmlFor="song-author"
          className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35"
        >
          Author
        </label>
        <Input
          id="song-author"
          aria-label="Author"
          maxLength={80}
          value={author}
          className="h-8 border-white/[0.08] bg-black/30 px-2.5 font-[var(--oc-mono)] text-[11px] text-white placeholder:text-white/20"
          onChange={(event) => {
            onEdit({ type: "set-song-author", author: event.currentTarget.value });
          }}
        />
      </div>
      <div className="grid gap-2 font-[var(--oc-mono)] text-[10px]">
        <MetaRow label="Author" value={author} />
        <MetaRow label="Mode" value={formatEngineModeLabel(songEngineMode)} />
        <MetaRow label="Tempo" value={`${bpm} bpm`} />
        <MetaRow label="Loop" value={`${loopLength} steps`} />
        <MetaRow label="Voices" value={`${trackCount}`} />
        <MetaRow label="Audio" value={engineState} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["authentic", "inspired"] as const).map((engineMode) => {
          const isSelected = songEngineMode === engineMode;

          return (
            <Button
              key={engineMode}
              type="button"
              variant="outline"
              aria-pressed={isSelected}
              className={cn(
                "h-8 rounded-md border font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.16em] transition-all",
                isSelected
                  ? "border-[var(--oc-accent)]/45 bg-[var(--oc-accent)]/12 text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white",
              )}
              onClick={() => {
                onEdit({ type: "set-engine-mode", engineMode });
              }}
            >
              {formatEngineModeLabel(engineMode)}
            </Button>
          );
        })}
      </div>
      <div
        aria-label="PCM mode summary"
        className="mt-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 font-[var(--oc-mono)]"
      >
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
          {getPcmModeLabel(songEngineMode)}
        </div>
        <p className="mt-1 text-[10px] leading-5 text-white/55">{getPcmModeSummary(songEngineMode)}</p>
      </div>
    </div>
  );
});

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5 last:border-0 last:pb-0">
      <span className="uppercase tracking-[0.18em] text-white/30">{label}</span>
      <span className="font-medium text-white/70">{value}</span>
    </div>
  );
}
