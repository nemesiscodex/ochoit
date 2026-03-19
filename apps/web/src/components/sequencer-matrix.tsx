import { Button } from "@ochoit/ui/components/button";
import { Card, CardContent } from "@ochoit/ui/components/card";
import { cn } from "@ochoit/ui/lib/utils";
import { Activity, Volume2, VolumeX } from "lucide-react";

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
  noteEntryOptions,
} from "@/features/song/song-pattern";

import {
  accentByTrackId,
  getStepLabel,
  getTrackControls,
  getTrackSummary,
  labelByTrackId,
  waveformGlowColorByTrackId,
  waveformLineColorByTrackId,
} from "@/components/sequencer-theme";
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
    <div className="grid gap-3">
      <StepRuler loopLength={song.transport.loopLength} nextStep={nextStep} playbackState={playbackState} />
      {tracks.map((track, index) => (
        <SequencerRow
          key={track.id}
          barNumber={index + 1}
          engine={engine}
          loopLength={song.transport.loopLength}
          nextStep={nextStep}
          onToggleTrackMute={onToggleTrackMute}
          onUpdateMelodicStep={onUpdateMelodicStep}
          playbackState={playbackState}
          sampleCount={song.samples.length}
          track={track}
        />
      ))}
    </div>
  );
}

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
    <div className="rounded-none border border-white/10 bg-[#091022]/85 p-3 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/65">
        <span>Pattern Ruler</span>
        <span>{loopLength} step loop</span>
      </div>
      <div className="grid grid-cols-8 gap-2 md:grid-cols-16">
        {Array.from({ length: loopLength }, (_, index) => {
          const isQuarterBoundary = index % 4 === 0;
          const isActive = playbackState === "playing" && nextStep === index;

          return (
            <div
              key={`ruler-step-${index}`}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "rounded-none border px-2 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em]",
                isActive
                  ? "border-cyan-200/75 bg-cyan-200/15 text-cyan-100 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                  : isQuarterBoundary
                    ? "border-white/15 bg-white/[0.07] text-white/80"
                    : "border-white/10 bg-white/5 text-white/45",
              )}
            >
              <div className="text-[9px] text-white/40">Step</div>
              <div className="mt-1">{index + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SequencerRow({
  barNumber,
  engine,
  loopLength,
  nextStep,
  onToggleTrackMute,
  onUpdateMelodicStep,
  playbackState,
  sampleCount,
  track,
}: {
  barNumber: number;
  engine: AudioEngine | null;
  loopLength: number;
  nextStep: number;
  onToggleTrackMute: (trackId: TrackId) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  playbackState: "stopped" | "playing";
  sampleCount: number;
  track: Track;
}) {
  const accentClassName = accentByTrackId[track.id];

  return (
    <Card className="border-white/10 bg-[#091022]/85 backdrop-blur">
      <CardContent className="grid gap-3 px-0 py-0 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="border-b border-white/10 p-4 lg:border-r lg:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/60">
                Row {barNumber.toString().padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-mono text-lg uppercase tracking-[0.16em] text-white">
                {labelByTrackId[track.id]}
              </h3>
            </div>
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "rounded-none border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em]",
                  accentClassName,
                )}
              >
                {track.kind}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`${track.muted ? "Unmute" : "Mute"} ${labelByTrackId[track.id]}`}
                aria-pressed={track.muted}
                className={cn(
                  "border-white/15 bg-white/5 text-white hover:bg-white/10",
                  track.muted && "border-[#ff8c69]/45 bg-[#ff8c69]/12 text-[#ffb39b] hover:bg-[#ff8c69]/18",
                )}
                onClick={() => {
                  onToggleTrackMute(track.id);
                }}
              >
                {track.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-300">{getTrackSummary(track)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {getTrackControls(track).map((control) => (
              <span
                key={control}
                className={cn(
                  "rounded-none border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em]",
                  accentClassName,
                )}
              >
                {control}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] uppercase tracking-[0.2em] text-white/65">
            <MiniStat label="Track Vol" value={`${Math.round(track.volume * 100)}%`} />
            <MiniStat label="Muted" value={track.muted ? "yes" : "no"} />
            <MiniStat label="Sample" value={track.id === "sample" ? `${sampleCount}` : "n/a"} />
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-none border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-white/65">
                <span>Waveform</span>
                <Activity className="size-4 text-cyan-200" />
              </div>
              <VoiceWaveformPanel engine={engine} track={track} />
            </div>

            <div className="rounded-none border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-white/65">
                <span>Step Grid</span>
                <span>{loopLength} steps</span>
              </div>
              {track.kind === "pulse" || track.kind === "triangle" ? (
                <MelodicStepGrid
                  accentClassName={accentClassName}
                  nextStep={nextStep}
                  onUpdateMelodicStep={onUpdateMelodicStep}
                  playbackState={playbackState}
                  track={track}
                />
              ) : (
                <StaticStepGrid
                  accentClassName={accentClassName}
                  nextStep={nextStep}
                  playbackState={playbackState}
                  track={track}
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
      className="h-20 w-full"
      glowColor={waveformGlowColorByTrackId[track.id]}
      lineColor={waveformLineColorByTrackId[track.id]}
    />
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border border-white/10 bg-black/20 px-2 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/80">{value}</div>
    </div>
  );
}

function MelodicStepGrid({
  accentClassName,
  nextStep,
  onUpdateMelodicStep,
  playbackState,
  track,
}: {
  accentClassName: string;
  nextStep: number;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  playbackState: "stopped" | "playing";
  track: PulseTrack | TriangleTrack;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 md:grid-cols-8 xl:grid-cols-16">
      {track.steps.map((step, index) => {
        const isQuarterBoundary = index % 4 === 0;
        const isActive = playbackState === "playing" && nextStep === index;

        return (
          <div
            key={`${track.id}-step-${index}`}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${labelByTrackId[track.id]} step ${index + 1}`}
            className={cn(
              "rounded-none border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
              step.enabled
                ? `${accentClassName} shadow-[0_0_0_1px_rgba(255,255,255,0.03)]`
                : isQuarterBoundary
                  ? "border-white/15 bg-white/[0.07] text-white/45"
                  : "border-white/10 bg-white/5 text-white/35",
              isActive && "border-cyan-200/80 bg-cyan-200/15 text-white shadow-[0_0_0_1px_rgba(139,211,255,0.35)]",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-[9px] text-white/45">
              <span>{index + 1}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`${step.enabled ? "Disable" : "Enable"} ${labelByTrackId[track.id]} step ${index + 1}`}
                aria-pressed={step.enabled}
                className={cn(
                  "h-6 rounded-none border-white/15 bg-black/25 px-2 text-[9px] uppercase tracking-[0.16em] text-white hover:bg-white/10",
                  step.enabled && "border-white/25 bg-black/35",
                )}
                onClick={() => {
                  onUpdateMelodicStep(track.id, index, { enabled: !step.enabled });
                }}
              >
                {step.enabled ? "On" : "Off"}
              </Button>
            </div>

            <select
              aria-label={`${labelByTrackId[track.id]} step ${index + 1} note`}
              className={cn(
                "h-8 w-full rounded-none border border-white/10 bg-[#050816]/90 px-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white outline-none",
                "focus:border-cyan-200/65",
                !step.enabled && "cursor-not-allowed opacity-45",
              )}
              disabled={!step.enabled}
              value={step.note}
              onChange={(event) => {
                onUpdateMelodicStep(track.id, index, {
                  note: event.currentTarget.value as MelodicStepUpdates["note"],
                });
              }}
            >
              {noteEntryOptions.map((note) => (
                <option key={note} value={note}>
                  {note}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

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
    <div className="grid grid-cols-8 gap-2 md:grid-cols-16">
      {track.steps.map((step, index) => {
        const isQuarterBoundary = index % 4 === 0;
        const isActive = playbackState === "playing" && nextStep === index;

        return (
          <div
            key={`${track.id}-step-${index}`}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${labelByTrackId[track.id]} step ${index + 1}`}
            className={cn(
              "rounded-none border px-2 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
              step.enabled
                ? `${accentClassName} shadow-[0_0_0_1px_rgba(255,255,255,0.03)]`
                : isQuarterBoundary
                  ? "border-white/15 bg-white/[0.07] text-white/45"
                  : "border-white/10 bg-white/5 text-white/35",
              isActive && "border-cyan-200/80 bg-cyan-200/15 text-white shadow-[0_0_0_1px_rgba(139,211,255,0.35)]",
            )}
          >
            <div className="mb-2 text-[9px] text-white/45">{index + 1}</div>
            <div className="text-white">{getStepLabel(track, index)}</div>
          </div>
        );
      })}
    </div>
  );
}
