import { Input } from "@ochoit/ui/components/input";
import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { Mic, Pause, Play, Save, Square, Upload, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { SequencerMatrix } from "@/components/sequencer-matrix";
import { labelByTrackId, waveformGlowColorByTrackId, waveformLineColorByTrackId } from "@/components/sequencer-theme";
import { WaveformCanvas } from "@/components/waveform-canvas";
import { sampleDeckPreviewWaveform } from "@/features/audio/waveform-data";
import { useAudioEngine, type AudioBootstrapState } from "@/features/audio/use-audio-engine";
import { createDefaultSongDocument, getOrderedTracks, type SongDocument, type TrackId } from "@/features/song/song-document";
import {
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type SampleStepUpdates,
  type TriggerTrackId,
  isMelodicTrackId,
  noiseTriggerPresets,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  parseMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  serializeNoiseTrackArrangement,
  serializeSampleTrackArrangement,
  updateNoiseTrackStep,
  updateSampleTrackStep,
  serializeMelodicTrackArrangement,
  updateMelodicTrackStep,
} from "@/features/song/song-pattern";
import {
  resolveSongBpmInput,
  resolveSongLoopLengthInput,
  SONG_BPM_RANGE,
  SONG_LOOP_LENGTH_RANGE,
  updateSongTransport,
} from "@/features/song/song-transport";

type ArrangementEditorState = {
  trackId: MelodicTrackId | TriggerTrackId;
  draft: string;
  error: string | null;
};

export function WorkstationShell() {
  const [song, setSong] = useState(() => createDefaultSongDocument());
  const [arrangementEditor, setArrangementEditor] = useState<ArrangementEditorState | null>(null);
  const tracks = getOrderedTracks(song);
  const { engine, engineState, errorMessage, initializeAudio, startTransport, stopTransport, transportState } =
    useAudioEngine(song);
  const audioReady = engineState === "running" || engineState === "suspended";
  const isPlaying = transportState.playbackState === "playing";

  const toggleTrackMute = (trackId: TrackId) => {
    setSong((currentSong) => ({
      ...currentSong,
      tracks: {
        ...currentSong.tracks,
        [trackId]: {
          ...currentSong.tracks[trackId],
          muted: !currentSong.tracks[trackId].muted,
        },
      },
    }));
  };

  const updateMelodicStep = (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => {
    setSong((currentSong) => updateMelodicTrackStep(currentSong, trackId, stepIndex, updates));
  };

  const updateNoiseStep = (stepIndex: number, updates: NoiseStepUpdates) => {
    setSong((currentSong) => updateNoiseTrackStep(currentSong, stepIndex, updates));
  };

  const updateSampleStep = (stepIndex: number, updates: SampleStepUpdates) => {
    setSong((currentSong) => updateSampleTrackStep(currentSong, stepIndex, updates));
  };

  const openMelodicTrackEditor = (trackId: MelodicTrackId) => {
    setArrangementEditor({
      trackId,
      draft: serializeMelodicTrackArrangement(song.tracks[trackId]),
      error: null,
    });
  };

  const openTriggerTrackEditor = (trackId: TriggerTrackId) => {
    setArrangementEditor({
      trackId,
      draft:
        trackId === "noise"
          ? serializeNoiseTrackArrangement(song.tracks.noise)
          : serializeSampleTrackArrangement(song.tracks.sample),
      error: null,
    });
  };

  const closeMelodicTrackEditor = () => {
    setArrangementEditor(null);
  };

  const updateArrangementDraft = (draft: string) => {
    setArrangementEditor((currentEditor) => {
      if (currentEditor === null) {
        return null;
      }

      return {
        ...currentEditor,
        draft,
        error: null,
      };
    });
  };

  const applyArrangement = () => {
    if (arrangementEditor === null) {
      return;
    }

    if (arrangementEditor.trackId === "noise") {
      const parsedArrangement = parseNoiseTrackArrangement(arrangementEditor.draft, song.transport.loopLength);

      if (!parsedArrangement.ok) {
        setArrangementEditor((currentEditor) => {
          if (currentEditor === null) {
            return null;
          }

          return {
            ...currentEditor,
            error: parsedArrangement.error,
          };
        });
        return;
      }

      setSong((currentSong) => replaceNoiseTrackArrangement(currentSong, parsedArrangement.entries));
      setArrangementEditor(null);
      return;
    }

    if (arrangementEditor.trackId === "sample") {
      const parsedArrangement = parseSampleTrackArrangement(
        arrangementEditor.draft,
        song.transport.loopLength,
        song.samples,
      );

      if (!parsedArrangement.ok) {
        setArrangementEditor((currentEditor) => {
          if (currentEditor === null) {
            return null;
          }

          return {
            ...currentEditor,
            error: parsedArrangement.error,
          };
        });
        return;
      }

      setSong((currentSong) => replaceSampleTrackArrangement(currentSong, parsedArrangement.entries));
      setArrangementEditor(null);
      return;
    }

    if (!isMelodicTrackId(arrangementEditor.trackId)) {
      return;
    }

    const melodicTrackId = arrangementEditor.trackId;
    const parsedArrangement = parseMelodicTrackArrangement(arrangementEditor.draft, song.transport.loopLength);

    if (!parsedArrangement.ok) {
      setArrangementEditor((currentEditor) => {
        if (currentEditor === null) {
          return null;
        }

        return {
          ...currentEditor,
          error: parsedArrangement.error,
        };
      });
      return;
    }

    setSong((currentSong) =>
      replaceMelodicTrackArrangement(currentSong, melodicTrackId, parsedArrangement.entries),
    );
    setArrangementEditor(null);
  };

  useEffect(() => {
    if (arrangementEditor === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setArrangementEditor(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [arrangementEditor]);

  return (
    <main className="relative min-h-full overflow-auto bg-[var(--oc-bg)] text-white oc-scanlines">
      {/* Ambient gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-[8%] h-[340px] w-[420px] rounded-full bg-[var(--oc-pulse1)]/[0.04] blur-[100px]" />
        <div className="absolute top-[40px] right-[12%] h-[280px] w-[350px] rounded-full bg-[var(--oc-pulse2)]/[0.04] blur-[100px]" />
        <div className="absolute bottom-[20%] left-[30%] h-[200px] w-[300px] rounded-full bg-[var(--oc-triangle)]/[0.03] blur-[80px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-4 md:px-6 lg:px-8">
        {/* ── Transport + Controls Bar ── */}
        <section className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <TransportStrip
              song={song}
              engineState={engineState}
              startTransport={startTransport}
              stopTransport={stopTransport}
              isPlaying={isPlaying}
              onBpmChange={(nextBpm) => {
                setSong((currentSong) => updateSongTransport(currentSong, { bpm: nextBpm }));
              }}
              onLoopLengthChange={(nextLoopLength) => {
                setSong((currentSong) => updateSongTransport(currentSong, { loopLength: nextLoopLength }));
              }}
            />
            <div className="flex items-center gap-2">
              <AudioInitButton
                engineState={engineState}
                audioReady={audioReady}
                initializeAudio={initializeAudio}
              />
              <Button
                variant="outline"
                size="icon"
                className="size-10 border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white"
                aria-label="Save song"
              >
                <Save className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-10 border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white"
                aria-label="Load song"
              >
                <Upload className="size-4" />
              </Button>
            </div>
          </div>

          {errorMessage !== null ? (
            <div className="rounded-md border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] px-3 py-2 font-[var(--oc-mono)] text-xs text-[var(--oc-noise)]">
              {errorMessage}
            </div>
          ) : null}
        </section>

        {/* ── Grid: Sequencer (left) + Sample Deck (right) ── */}
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          {/* Sequencer Matrix */}
          <div className="min-w-0">
            <SequencerMatrix
              engine={engine}
              onOpenMelodicTrackEditor={openMelodicTrackEditor}
              onOpenTriggerTrackEditor={openTriggerTrackEditor}
              onToggleTrackMute={toggleTrackMute}
              onUpdateMelodicStep={updateMelodicStep}
              onUpdateNoiseStep={updateNoiseStep}
              onUpdateSampleStep={updateSampleStep}
              song={song}
              playbackState={transportState.playbackState}
              nextStep={transportState.nextStep}
            />
          </div>

          {/* Sample Deck Sidebar */}
          <aside className="flex flex-col gap-3">
            <SampleDeck sampleName={song.samples[0]?.name ?? null} />
            <SongMeta song={song} engineState={engineState} trackCount={tracks.length} />
          </aside>
        </section>
      </div>

      {arrangementEditor !== null ? (
        <TrackArrangementEditor
          trackId={arrangementEditor.trackId}
          loopLength={song.transport.loopLength}
          draft={arrangementEditor.draft}
          error={arrangementEditor.error}
          samples={song.samples}
          onChangeDraft={updateArrangementDraft}
          onClose={closeMelodicTrackEditor}
          onApply={applyArrangement}
        />
      ) : null}
    </main>
  );
}

/* ─────────── Transport Strip ─────────── */

function TransportStrip({
  song,
  engineState,
  startTransport,
  stopTransport,
  isPlaying,
  onBpmChange,
  onLoopLengthChange,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  startTransport: () => Promise<void>;
  stopTransport: () => void;
  isPlaying: boolean;
  onBpmChange: (value: number) => void;
  onLoopLengthChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-2 backdrop-blur">
      {/* Play / Stop */}
      <div className="flex items-center gap-1.5">
        <Button
          className={cn(
            "oc-btn-play h-10 rounded-md px-4 font-[var(--oc-mono)] text-xs font-semibold uppercase tracking-[0.12em]",
            isPlaying
              ? "bg-[var(--oc-play)]/20 text-[var(--oc-play)] hover:bg-[var(--oc-play)]/30"
              : "bg-[var(--oc-play)] text-[#07080e] hover:bg-[var(--oc-play)]/90",
          )}
          onClick={() => {
            void startTransport();
          }}
        >
          {isPlaying ? <Pause className="mr-1.5 size-3.5" /> : <Play className="mr-1.5 size-3.5" />}
          {isPlaying ? "Playing" : "Play"}
        </Button>
        <Button
          variant="outline"
          className="oc-btn-stop h-10 rounded-md border-white/[0.08] bg-white/[0.03] px-3 font-[var(--oc-mono)] text-xs uppercase tracking-[0.12em] text-white/60 hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
          disabled={!isPlaying}
          onClick={() => {
            stopTransport();
          }}
        >
          <Square className="mr-1.5 size-3.5" />
          Stop
        </Button>
      </div>

      {/* Divider */}
      <div className="mx-1 hidden h-6 w-px bg-white/[0.08] lg:block" />

      {/* BPM */}
      <TransportField
        label="BPM"
        value={song.transport.bpm}
        min={SONG_BPM_RANGE.min}
        max={SONG_BPM_RANGE.max}
        step={1}
        onChange={onBpmChange}
        parseValue={(rawValue) => resolveSongBpmInput(rawValue, song.transport.bpm)}
      />

      {/* Loop Length */}
      <TransportField
        label="Loop"
        value={song.transport.loopLength}
        min={SONG_LOOP_LENGTH_RANGE.min}
        max={SONG_LOOP_LENGTH_RANGE.max}
        step={SONG_LOOP_LENGTH_RANGE.step}
        onChange={onLoopLengthChange}
        parseValue={(rawValue) => resolveSongLoopLengthInput(rawValue, song.transport.loopLength)}
        suffix="st"
      />

      {/* Divider */}
      <div className="mx-1 hidden h-6 w-px bg-white/[0.08] lg:block" />

      {/* Status chips */}
      <div className="flex items-center gap-2">
        <StatusChip label="Audio" value={engineState} />
        <StatusChip label="Playback" value={isPlaying ? "playing" : "stopped"} />
      </div>
    </div>
  );
}

/* ─────────── Transport Field ─────────── */

function TransportField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  parseValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  parseValue: (rawValue: string) => number;
}) {
  const inputId = `transport-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-1.5">
      <label
        htmlFor={inputId}
        className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/40"
      >
        {label}
      </label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label === "Loop" ? "Loop Length" : label}
        className="h-7 w-14 border-0 bg-transparent px-0 text-center font-[var(--oc-mono)] text-sm font-semibold text-white focus-visible:ring-0"
        onChange={(event) => {
          onChange(parseValue(event.currentTarget.value));
        }}
      />
      {suffix ? (
        <span className="font-[var(--oc-mono)] text-[9px] uppercase text-white/30">{suffix}</span>
      ) : null}
    </div>
  );
}

/* ─────────── Audio Init Button ─────────── */

function AudioInitButton({
  engineState,
  audioReady,
  initializeAudio,
}: {
  engineState: AudioBootstrapState;
  audioReady: boolean;
  initializeAudio: () => Promise<unknown>;
}) {
  return (
    <Button
      className={cn(
        "h-10 rounded-md px-4 font-[var(--oc-mono)] text-xs font-semibold uppercase tracking-[0.1em] transition-all",
        audioReady
          ? "bg-[var(--oc-accent)]/15 text-[var(--oc-accent)] hover:bg-[var(--oc-accent)]/25"
          : "bg-[var(--oc-accent)] text-white hover:bg-[var(--oc-accent)]/90",
      )}
      onClick={() => {
        void initializeAudio();
      }}
    >
      <Zap className="mr-1.5 size-3.5" />
      {engineState === "initializing" ? "Booting…" : audioReady ? "Audio On" : "Start Audio"}
    </Button>
  );
}

/* ─────────── Status Chip ─────────── */

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
      <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</span>
      <span className="font-[var(--oc-mono)] text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">
        {value}
      </span>
    </div>
  );
}

/* ─────────── Sample Deck ─────────── */

function SampleDeck({ sampleName }: { sampleName: string | null }) {
  return (
    <div className="rounded-lg border border-[var(--oc-sample)]/20 bg-[var(--oc-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-sample)]">
          Sample Deck
        </h2>
        <Mic className="size-4 text-[var(--oc-sample)]/60" />
      </div>

      <p className="mb-3 font-[var(--oc-mono)] text-[10px] text-white/35">
        Record 1-2s, trim, trigger on the PCM lane.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button
          className="h-8 rounded-md bg-[var(--oc-sample)] font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#07080e] hover:bg-[var(--oc-sample)]/85"
        >
          Record
        </Button>
        <Button
          variant="outline"
          className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.07] hover:text-white"
        >
          Preview
        </Button>
      </div>

      <div className="rounded-md border border-white/[0.06] bg-black/25 p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-white/35">
          <span>Trim</span>
          <span>{sampleName ?? "No Sample"}</span>
        </div>
        <div className="oc-waveform-wrap rounded-sm">
          <WaveformCanvas
            ariaLabel="PCM trim preview waveform"
            samples={sampleDeckPreviewWaveform}
            className="h-12 w-full"
            backgroundColor="rgba(7, 8, 14, 0.9)"
            glowColor={waveformGlowColorByTrackId.sample}
            lineColor={waveformLineColorByTrackId.sample}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────── Song Metadata ─────────── */

function SongMeta({
  song,
  engineState,
  trackCount,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  trackCount: number;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-4">
      <h2 className="mb-3 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
        Song Info
      </h2>
      <div className="grid gap-2 font-[var(--oc-mono)] text-[10px]">
        <MetaRow label="Name" value={song.meta.name} />
        <MetaRow label="Author" value={song.meta.author} />
        <MetaRow label="Mode" value={song.meta.engineMode} />
        <MetaRow label="Tempo" value={`${song.transport.bpm} bpm`} />
        <MetaRow label="Loop" value={`${song.transport.loopLength} steps`} />
        <MetaRow label="Voices" value={`${trackCount}`} />
        <MetaRow label="Audio" value={engineState} />
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5 last:border-0 last:pb-0">
      <span className="uppercase tracking-[0.18em] text-white/30">{label}</span>
      <span className="font-medium text-white/70">{value}</span>
    </div>
  );
}

function TrackArrangementEditor({
  trackId,
  loopLength,
  draft,
  error,
  samples,
  onChangeDraft,
  onClose,
  onApply,
}: {
  trackId: MelodicTrackId | TriggerTrackId;
  loopLength: number;
  draft: string;
  error: string | null;
  samples: SongDocument["samples"];
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const trackLabel = labelByTrackId[trackId];
  const accentColor = waveformLineColorByTrackId[trackId];
  const helperCopy =
    trackId === "noise"
      ? `One trigger per line in the format 1: snare. Available presets: ${noiseTriggerPresets.map((preset) => preset.id).join(", ")}. Steps above ${loopLength} are ignored when you apply.`
      : trackId === "sample"
        ? `One trigger per line in the format 8: ${samples[0]?.id ?? "mic-001"}@1x. Use a sample id or sample name plus an optional playback rate from 0.25x to 4x. Steps above ${loopLength} are ignored when you apply.`
        : `One step per line in the format 1: E4. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`;
  const editorTitle =
    trackId === "noise" ? "Noise Trigger Map" : trackId === "sample" ? "PCM Trigger Map" : "Voice Arrangement";
  const labelSuffix =
    trackId === "noise" ? "trigger text" : trackId === "sample" ? "trigger text" : "arrangement text";

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close arrangement editor"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#090b14] p-5 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
              {editorTitle}
            </p>
            <h2
              className="mt-1 font-[var(--oc-mono)] text-lg font-bold uppercase tracking-[0.1em]"
              style={{ color: accentColor }}
            >
              {trackLabel}
            </h2>
            <p className="mt-2 max-w-xl font-[var(--oc-mono)] text-[10px] leading-5 text-white/50">
              {helperCopy}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-md border border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <label
          htmlFor={`arrangement-${trackId}`}
          className="mb-2 block font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.2em] text-white/40"
        >
          {trackLabel} {trackId === "noise" || trackId === "sample" ? "Trigger Text" : "Arrangement Text"}
        </label>
        <textarea
          id={`arrangement-${trackId}`}
          aria-label={`${trackLabel} ${labelSuffix}`}
          value={draft}
          autoFocus
          spellCheck={false}
          className="min-h-[360px] w-full rounded-xl border border-white/[0.08] bg-black/35 px-4 py-3 font-[var(--oc-mono)] text-sm leading-6 text-white outline-none transition focus:border-white/20"
          onChange={(event) => {
            onChangeDraft(event.currentTarget.value);
          }}
        />

        {error !== null ? (
          <div className="mt-3 rounded-lg border border-[var(--oc-noise)]/35 bg-[var(--oc-noise)]/[0.08] px-3 py-2 font-[var(--oc-mono)] text-[10px] text-[var(--oc-noise)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[#07080e]"
            style={{ backgroundColor: accentColor }}
            onClick={onApply}
          >
            Apply Arrangement
          </Button>
        </div>
      </div>
    </div>
  );
}
