import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { Volume2, VolumeX } from "lucide-react";

import type { AudioEngine } from "@/features/audio/audio-engine";
import { previewWaveformByTrackId } from "@/features/audio/waveform-data";
import { useTrackWaveform } from "@/features/audio/use-track-waveform";
import {
  type PulseTrack,
  type SongDocument,
  type Track,
  type TrackId,
  type TriangleTrack,
  getOrderedTracks,
} from "@/features/song/song-document";
import {
  type MelodicStepUpdates,
  type MelodicTrackId,
} from "@/features/song/song-pattern";

import {
  accentByTrackId,
  getStepLabel,
  labelByTrackId,
  shortLabelByTrackId,
  voiceColorByTrackId,
  waveformGlowColorByTrackId,
  waveformLineColorByTrackId,
} from "@/components/sequencer-theme";
import { NotePicker } from "@/components/note-picker";
import { WaveformCanvas } from "@/components/waveform-canvas";

export function SequencerMatrix({
  engine,
  song,
  playbackState,
  nextStep,
  onToggleTrackMute,
  onUpdateMelodicStep,
}: {
  engine: AudioEngine | null;
  song: SongDocument;
  playbackState: "stopped" | "playing";
  nextStep: number;
  onToggleTrackMute: (trackId: TrackId) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
}) {
  const tracks = getOrderedTracks(song);

  return (
    <div className="flex flex-col gap-2">
      <StepRuler loopLength={song.transport.loopLength} nextStep={nextStep} playbackState={playbackState} />
      {tracks.map((track) => (
        <SequencerRow
          key={track.id}
          engine={engine}
          nextStep={nextStep}
          onToggleTrackMute={onToggleTrackMute}
          onUpdateMelodicStep={onUpdateMelodicStep}
          playbackState={playbackState}
          track={track}
        />
      ))}
    </div>
  );
}

/* ─────────── Step Ruler ─────────── */

function StepRuler({
  loopLength,
  nextStep,
  playbackState,
}: {
  loopLength: number;
  nextStep: number;
  playbackState: "stopped" | "playing";
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-2 backdrop-blur">
      <div className="mb-2 flex items-center justify-between px-1 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/30">
        <span>Pattern Ruler</span>
        <span>{loopLength} step loop</span>
      </div>
      <div className="grid grid-cols-8 gap-1 md:grid-cols-16">
        {Array.from({ length: loopLength }, (_, index) => {
          const isQuarterBoundary = index % 4 === 0;
          const isActive = playbackState === "playing" && nextStep === index;

          return (
            <div
              key={`ruler-step-${index}`}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "rounded-sm py-1.5 text-center font-[var(--oc-mono)] text-[10px] font-medium transition-all",
                isActive
                  ? "oc-playhead-active bg-[var(--oc-play)]/15 text-[var(--oc-play)]"
                  : isQuarterBoundary
                    ? "bg-white/[0.06] text-white/50"
                    : "bg-white/[0.03] text-white/25",
              )}
            >
              {index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Sequencer Row ─────────── */

function SequencerRow({
  engine,
  nextStep,
  onToggleTrackMute,
  onUpdateMelodicStep,
  playbackState,
  track,
}: {
  engine: AudioEngine | null;
  nextStep: number;
  onToggleTrackMute: (trackId: TrackId) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  playbackState: "stopped" | "playing";
  track: Track;
}) {
  return (
    <div
      className="oc-voice-row grid gap-0 overflow-hidden rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] backdrop-blur lg:grid-cols-[200px_minmax(0,1fr)]"
      style={{ borderLeftColor: voiceColorByTrackId[track.id], borderLeftWidth: "3px" }}
    >
      {/* Voice info panel */}
      <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: waveformLineColorByTrackId[track.id] }}
            />
            <h3 className="font-[var(--oc-mono)] text-sm font-bold uppercase tracking-[0.12em] text-white">
              {labelByTrackId[track.id]}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.18em]",
                accentByTrackId[track.id],
              )}
            >
              {shortLabelByTrackId[track.id]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${track.muted ? "Unmute" : "Mute"} ${labelByTrackId[track.id]}`}
              aria-pressed={track.muted}
              className={cn(
                "size-7 text-white/40 hover:bg-white/[0.06] hover:text-white",
                track.muted && "text-[var(--oc-noise)] hover:text-[var(--oc-noise)]",
              )}
              onClick={() => {
                onToggleTrackMute(track.id);
              }}
            >
              {track.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* Inline waveform */}
        <div className="oc-waveform-wrap rounded-sm border border-white/[0.05] bg-black/30">
          <VoiceWaveformPanel engine={engine} track={track} />
        </div>

        {/* Volume readout */}
        <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/25">
          <span>Vol {Math.round(track.volume * 100)}%</span>
          <span>{track.muted ? "Muted" : "Active"}</span>
        </div>
      </div>

      {/* Step grid */}
      <div className="p-2">
        {track.kind === "pulse" || track.kind === "triangle" ? (
          <MelodicStepGrid
            accentClassName={accentByTrackId[track.id]}
            accentColor={waveformLineColorByTrackId[track.id]}
            engine={engine}
            nextStep={nextStep}
            onUpdateMelodicStep={onUpdateMelodicStep}
            playbackState={playbackState}
            track={track}
          />
        ) : (
          <StaticStepGrid
            accentClassName={accentByTrackId[track.id]}
            nextStep={nextStep}
            playbackState={playbackState}
            track={track}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────── Voice Waveform ─────────── */

function VoiceWaveformPanel({
  engine,
  track,
}: {
  engine: AudioEngine | null;
  track: Track;
}) {
  const waveform = useTrackWaveform({
    engine,
    trackId: track.id,
    fallbackWaveform: previewWaveformByTrackId[track.id],
  });

  return (
    <WaveformCanvas
      ariaLabel={`${labelByTrackId[track.id]} waveform`}
      samples={waveform}
      className="h-14 w-full"
      backgroundColor="rgba(7, 8, 14, 0.85)"
      glowColor={waveformGlowColorByTrackId[track.id]}
      lineColor={waveformLineColorByTrackId[track.id]}
    />
  );
}

/* ─────────── Melodic Step Grid ─────────── */

function MelodicStepGrid({
  accentClassName,
  accentColor,
  engine,
  nextStep,
  onUpdateMelodicStep,
  playbackState,
  track,
}: {
  accentClassName: string;
  accentColor: string;
  engine: AudioEngine | null;
  nextStep: number;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  playbackState: "stopped" | "playing";
  track: PulseTrack | TriangleTrack;
}) {
  return (
    <div className="grid grid-cols-4 gap-1 md:grid-cols-8 xl:grid-cols-16">
      {track.steps.map((step, index) => {
        const isQuarterBoundary = index % 4 === 0;
        const isActive = playbackState === "playing" && nextStep === index;

        return (
          <div
            key={`${track.id}-step-${index}`}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${labelByTrackId[track.id]} step ${index + 1}`}
            className={cn(
              "oc-step-cell rounded-sm border px-1 py-1.5 font-[var(--oc-mono)] text-[10px] transition-all",
              step.enabled
                ? `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`
                : isQuarterBoundary
                  ? "border-white/[0.08] bg-white/[0.04] text-white/30"
                  : "border-white/[0.05] bg-white/[0.02] text-white/20",
              isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10 text-white",
            )}
          >
            {/* Step number + toggle */}
            <div className="mb-1 flex items-center justify-between text-[8px] text-white/30">
              <span>{index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`${step.enabled ? "Disable" : "Enable"} ${labelByTrackId[track.id]} step ${index + 1}`}
                aria-pressed={step.enabled}
                className={cn(
                  "h-4 rounded-sm px-1 text-[7px] font-semibold uppercase tracking-[0.14em] text-white/35 hover:bg-white/[0.08] hover:text-white",
                  step.enabled && "text-white/60",
                )}
                onClick={() => {
                  onUpdateMelodicStep(track.id, index, { enabled: !step.enabled });
                }}
              >
                {step.enabled ? "On" : "Off"}
              </Button>
            </div>

            {/* Note picker grid */}
            <NotePicker
              selectedNote={step.note}
              disabled={!step.enabled}
              accentColor={accentColor}
              ariaLabel={`${labelByTrackId[track.id]} step ${index + 1} note`}
              onSelectNote={(note) => {
                onUpdateMelodicStep(track.id, index, { note });
              }}
              onHoverNote={(note) => {
                engine?.previewNote(track.id, note);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ─────────── Static Step Grid (Noise / Sample) ─────────── */

function StaticStepGrid({
  accentClassName,
  nextStep,
  playbackState,
  track,
}: {
  accentClassName: string;
  nextStep: number;
  playbackState: "stopped" | "playing";
  track: Track;
}) {
  return (
    <div className="grid grid-cols-8 gap-1 md:grid-cols-16">
      {track.steps.map((step, index) => {
        const isQuarterBoundary = index % 4 === 0;
        const isActive = playbackState === "playing" && nextStep === index;

        return (
          <div
            key={`${track.id}-step-${index}`}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${labelByTrackId[track.id]} step ${index + 1}`}
            className={cn(
              "oc-step-cell rounded-sm border px-1 py-2.5 text-center font-[var(--oc-mono)] text-[10px] font-medium transition-all",
              step.enabled
                ? `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`
                : isQuarterBoundary
                  ? "border-white/[0.08] bg-white/[0.04] text-white/30"
                  : "border-white/[0.05] bg-white/[0.02] text-white/20",
              isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10 text-white",
            )}
          >
            <div className="mb-1 text-[8px] text-white/25">{index + 1}</div>
            <div className="text-white/80">{getStepLabel(track, index)}</div>
          </div>
        );
      })}
    </div>
  );
}
