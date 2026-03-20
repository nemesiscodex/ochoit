import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import type { AudioEngine } from "@/features/audio/audio-engine";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import { previewWaveformByTrackId } from "@/features/audio/waveform-data";
import { useTrackWaveform } from "@/features/audio/use-track-waveform";
import {
  type SongDocument,
  type Track,
  type TrackId,
  getOrderedTracks,
  trackOrder,
} from "@/features/song/song-document";
import { TRACK_VOLUME_PERCENT_RANGE, toTrackVolumePercent } from "@/features/song/song-mixer";
import {
  getDefaultSampleTrigger,
  getMelodicStepState,
  getNoiseTriggerPresetForStep,
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type NoteValue,
  type SampleStepUpdates,
  type TriggerTrackId,
} from "@/features/song/song-pattern";

import {
  accentByTrackId,
  labelByTrackId,
  shortLabelByTrackId,
  voiceColorByTrackId,
  waveformGlowColorByTrackId,
  waveformLineColorByTrackId,
} from "@/components/sequencer-theme";
import { StepDetailPanel, type StepSelection } from "@/components/step-detail-panel";
import { WaveformCanvas } from "@/components/waveform-canvas";

export function SequencerMatrix({
  defaultSampleId,
  engine,
  song,
  playbackState,
  nextStep,
  onToggleTrackMute,
  onUpdateTrackVolume,
  onOpenMelodicTrackEditor,
  onOpenTriggerTrackEditor,
  onUpdateMelodicStep,
  onUpdateNoiseStep,
  onUpdateSampleStep,
}: {
  defaultSampleId: string | null;
  engine: AudioEngine | null;
  song: SongDocument;
  playbackState: "stopped" | "playing";
  nextStep: number;
  onToggleTrackMute: (trackId: TrackId) => void;
  onUpdateTrackVolume: (trackId: TrackId, volume: number) => void;
  onOpenMelodicTrackEditor: (trackId: MelodicTrackId) => void;
  onOpenTriggerTrackEditor: (trackId: TriggerTrackId) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  onUpdateNoiseStep: (stepIndex: number, updates: NoiseStepUpdates) => void;
  onUpdateSampleStep: (stepIndex: number, updates: SampleStepUpdates) => void;
}) {
  const [selectedStep, setSelectedStep] = useState<StepSelection | null>(null);
  const tracks = getOrderedTracks(song);

  const handleDeselectStep = () => {
    setSelectedStep(null);
  };

  useEffect(() => {
    if (selectedStep === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.key) {
        case "Escape":
          setSelectedStep(null);
          event.preventDefault();
          break;
        case "ArrowLeft":
          setSelectedStep((prev) => {
            if (prev === null) return null;
            return { ...prev, stepIndex: Math.max(0, prev.stepIndex - 1) };
          });
          event.preventDefault();
          break;
        case "ArrowRight":
          setSelectedStep((prev) => {
            if (prev === null) return null;
            return {
              ...prev,
              stepIndex: Math.min(song.transport.loopLength - 1, prev.stepIndex + 1),
            };
          });
          event.preventDefault();
          break;
        case "ArrowUp": {
          const currentIndex = trackOrder.indexOf(selectedStep.trackId);
          if (currentIndex > 0) {
            setSelectedStep({ trackId: trackOrder[currentIndex - 1], stepIndex: selectedStep.stepIndex });
          }
          event.preventDefault();
          break;
        }
        case "ArrowDown": {
          const currentIndex = trackOrder.indexOf(selectedStep.trackId);
          if (currentIndex < trackOrder.length - 1) {
            setSelectedStep({ trackId: trackOrder[currentIndex + 1], stepIndex: selectedStep.stepIndex });
          }
          event.preventDefault();
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedStep, song.transport.loopLength]);

  return (
    <div className="flex flex-col gap-2">
      <StepRuler loopLength={song.transport.loopLength} nextStep={nextStep} playbackState={playbackState} />
      {tracks.map((track) => {
        const selectedStepIndex = selectedStep?.trackId === track.id ? selectedStep.stepIndex : null;

        return (
          <SequencerRow
            key={track.id}
            defaultSampleId={defaultSampleId}
            engine={engine}
            nextStep={nextStep}
            onDeselectStep={handleDeselectStep}
            onOpenMelodicTrackEditor={onOpenMelodicTrackEditor}
            onOpenTriggerTrackEditor={onOpenTriggerTrackEditor}
            onSelectStep={(stepIndex) => {
              setSelectedStep({ trackId: track.id, stepIndex });
            }}
            onToggleTrackMute={onToggleTrackMute}
            onUpdateTrackVolume={onUpdateTrackVolume}
            onUpdateMelodicStep={onUpdateMelodicStep}
            onUpdateNoiseStep={onUpdateNoiseStep}
            onUpdateSampleStep={onUpdateSampleStep}
            playbackState={playbackState}
            samples={song.samples}
            selectedStepIndex={selectedStepIndex}
            song={song}
            track={track}
          />
        );
      })}
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
  defaultSampleId,
  engine,
  nextStep,
  onDeselectStep,
  onOpenMelodicTrackEditor,
  onOpenTriggerTrackEditor,
  onSelectStep,
  onToggleTrackMute,
  onUpdateTrackVolume,
  onUpdateMelodicStep,
  onUpdateNoiseStep,
  onUpdateSampleStep,
  playbackState,
  samples,
  selectedStepIndex,
  song,
  track,
}: {
  defaultSampleId: string | null;
  engine: AudioEngine | null;
  nextStep: number;
  onDeselectStep: () => void;
  onOpenMelodicTrackEditor: (trackId: MelodicTrackId) => void;
  onOpenTriggerTrackEditor: (trackId: TriggerTrackId) => void;
  onSelectStep: (stepIndex: number) => void;
  onToggleTrackMute: (trackId: TrackId) => void;
  onUpdateTrackVolume: (trackId: TrackId, volume: number) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  onUpdateNoiseStep: (stepIndex: number, updates: NoiseStepUpdates) => void;
  onUpdateSampleStep: (stepIndex: number, updates: SampleStepUpdates) => void;
  playbackState: "stopped" | "playing";
  samples: SongDocument["samples"];
  selectedStepIndex: number | null;
  song: SongDocument;
  track: Track;
}) {
  const defaultSampleTrigger = getDefaultSampleTrigger(samples, defaultSampleId);

  const handleStepClick = (stepIndex: number) => {
    // For hold steps, redirect to the origin note
    if (track.kind === "pulse" || track.kind === "triangle") {
      const melodicState = getMelodicStepState(track, stepIndex);

      if (melodicState.kind === "hold") {
        if (selectedStepIndex === melodicState.startIndex) {
          onDeselectStep();
        } else {
          onSelectStep(melodicState.startIndex);
        }

        return;
      }
    }

    // Toggle selection
    if (selectedStepIndex === stepIndex) {
      onDeselectStep();
      return;
    }

    // Enable step if disabled, then select
    if (!track.steps[stepIndex].enabled) {
      switch (track.kind) {
        case "pulse":
        case "triangle":
          onUpdateMelodicStep(track.id, stepIndex, { enabled: true });
          break;
        case "noise":
          onUpdateNoiseStep(stepIndex, { enabled: true });
          break;
        case "sample": {
          const sampleStep = track.steps[stepIndex];
          onUpdateSampleStep(stepIndex, {
            enabled: true,
            sampleId: sampleStep.sampleId ?? defaultSampleTrigger.sampleId,
            note: (sampleStep.note as NoteValue) ?? defaultSampleTrigger.note,
            playbackRate: sampleStep.playbackRate ?? defaultSampleTrigger.playbackRate,
          });
          break;
        }
      }
    }

    onSelectStep(stepIndex);
  };

  const handleStepHover = (stepIndex: number) => {
    if (engine === null) {
      return;
    }

    switch (track.kind) {
      case "pulse":
      case "triangle": {
        const melodicState = getMelodicStepState(track, stepIndex);

        if (melodicState.kind === "rest") {
          return;
        }

        if (track.kind === "pulse") {
          const sourceStep = track.steps[melodicState.kind === "hold" ? melodicState.startIndex : stepIndex];

          engine.previewNote(track.id, melodicState.note, 120, sourceStep?.duty ?? 0.5);
          return;
        }

        engine.previewNote(track.id, melodicState.note);
        return;
      }
      case "noise": {
        const step = track.steps[stepIndex];

        if (!step.enabled) {
          return;
        }

        engine.previewNoiseConfig(step.mode, step.periodIndex);
        return;
      }
      case "sample": {
        const step = track.steps[stepIndex];

        if (!step.enabled || step.sampleId === null) {
          return;
        }

        if (song.meta.engineMode === "authentic") {
          engine.previewSampleTrigger(step.sampleId, step.playbackRate);
          return;
        }

        const sample = samples.find((entry) => entry.id === step.sampleId);

        if (sample === undefined) {
          return;
        }

        engine.previewSampleNote?.(sample.id, sample.baseNote as NoteValue, step.note as NoteValue);

        if (typeof engine.previewSampleNote !== "function") {
          engine.previewSampleTrigger(
            sample.id,
            getFrequencyForNote(step.note as NoteValue) / getFrequencyForNote(sample.baseNote),
          );
        }
      }
    }
  };

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
        <TrackVolumeControl track={track} onUpdateTrackVolume={onUpdateTrackVolume} />
        {track.kind === "pulse" || track.kind === "triangle" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${labelByTrackId[track.id]} arrangement as text`}
            className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              onOpenMelodicTrackEditor(track.id);
            }}
          >
            Text Edit
          </Button>
        ) : track.kind === "noise" || track.kind === "sample" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${labelByTrackId[track.id]} arrangement as text`}
            className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              onOpenTriggerTrackEditor(track.id);
            }}
          >
            Text Edit
          </Button>
        ) : null}
      </div>

      {/* Step grid + detail panel */}
      <div className="p-2">
        <CompactStepGrid
          accentClassName={accentByTrackId[track.id]}
          accentColor={waveformLineColorByTrackId[track.id]}
          engineMode={song.meta.engineMode}
          nextStep={nextStep}
          onStepHover={handleStepHover}
          onStepClick={handleStepClick}
          playbackState={playbackState}
          samples={samples}
          selectedStepIndex={selectedStepIndex}
          track={track}
        />
        {selectedStepIndex !== null ? (
          <StepDetailPanel
            defaultSampleId={defaultSampleId}
            engine={engine}
            onDeselect={onDeselectStep}
            onUpdateMelodicStep={onUpdateMelodicStep}
            onUpdateNoiseStep={onUpdateNoiseStep}
            onUpdateSampleStep={onUpdateSampleStep}
            samples={samples}
            selection={{ trackId: track.id, stepIndex: selectedStepIndex }}
            song={song}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ─────────── Track Volume Control ─────────── */

function TrackVolumeControl({
  track,
  onUpdateTrackVolume,
}: {
  track: Track;
  onUpdateTrackVolume: (trackId: TrackId, volume: number) => void;
}) {
  const volumeInputId = `track-volume-${track.id}`;
  const volumePercent = toTrackVolumePercent(track.volume);

  return (
    <div
      className="rounded-sm border border-white/[0.06] bg-black/20 px-2 py-1.5"
      style={{ ["--oc-track-accent" as string]: waveformLineColorByTrackId[track.id] }}
    >
      <div className="mb-1.5 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/30">
        <label htmlFor={volumeInputId} className="text-white/45">
          Level
        </label>
        <span className="text-white/65">{volumePercent}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">0</span>
        <input
          id={volumeInputId}
          type="range"
          min={TRACK_VOLUME_PERCENT_RANGE.min}
          max={TRACK_VOLUME_PERCENT_RANGE.max}
          step={TRACK_VOLUME_PERCENT_RANGE.step}
          value={volumePercent}
          aria-label={`${labelByTrackId[track.id]} volume`}
          className={cn("oc-track-volume", track.muted && "opacity-60")}
          onChange={(event) => {
            onUpdateTrackVolume(track.id, Number(event.currentTarget.value) / TRACK_VOLUME_PERCENT_RANGE.max);
          }}
        />
        <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">100</span>
      </div>
      <div className="mt-1 flex items-center justify-between font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.16em] text-white/25">
        <span>{track.muted ? "Muted bus" : "Bus live"}</span>
        <span>{track.kind}</span>
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

/* ─────────── Compact Step Grid ─────────── */

type CompactCellData = {
  enabled: boolean;
  isHold: boolean;
  holdNote: string | null;
  label: string;
  volume: number;
  isPartOfSelectedNote: boolean;
};

function getCompactCellData(
  track: Track,
  engineMode: SongDocument["meta"]["engineMode"],
  stepIndex: number,
  samples: SongDocument["samples"],
  selectedStepIndex: number | null,
): CompactCellData {
  switch (track.kind) {
    case "pulse":
    case "triangle": {
      const step = track.steps[stepIndex];
      const melodicState = getMelodicStepState(track, stepIndex);

      if (melodicState.kind === "hold") {
        return {
          enabled: false,
          isHold: true,
          holdNote: melodicState.note,
          label: melodicState.note,
          volume: step.volume,
          isPartOfSelectedNote: selectedStepIndex === melodicState.startIndex,
        };
      }

      return {
        enabled: step.enabled,
        isHold: false,
        holdNote: null,
        label: step.enabled ? step.note : "\u00b7",
        volume: step.volume,
        isPartOfSelectedNote: false,
      };
    }
    case "noise": {
      const step = track.steps[stepIndex];
      const preset = getNoiseTriggerPresetForStep(step);

      return {
        enabled: step.enabled,
        isHold: false,
        holdNote: null,
        label: step.enabled ? (preset?.shortLabel ?? step.mode[0]) : "\u00b7",
        volume: step.volume,
        isPartOfSelectedNote: false,
      };
    }
    case "sample": {
      const step = track.steps[stepIndex];
      const sample = step.sampleId === null ? null : samples.find((s) => s.id === step.sampleId) ?? null;

      return {
        enabled: step.enabled,
        isHold: false,
        holdNote: null,
        label:
          !step.enabled
            ? "\u00b7"
            : engineMode === "inspired"
              ? step.note
              : sample !== null
                ? sample.name
                : "pcm",
        volume: step.volume,
        isPartOfSelectedNote: false,
      };
    }
  }
}

function CompactStepGrid({
  accentClassName,
  accentColor,
  engineMode,
  nextStep,
  onStepHover,
  onStepClick,
  playbackState,
  samples,
  selectedStepIndex,
  track,
}: {
  accentClassName: string;
  accentColor: string;
  engineMode: SongDocument["meta"]["engineMode"];
  nextStep: number;
  onStepHover: (stepIndex: number) => void;
  onStepClick: (stepIndex: number) => void;
  playbackState: "stopped" | "playing";
  samples: SongDocument["samples"];
  selectedStepIndex: number | null;
  track: Track;
}) {
  return (
    <div className="grid grid-cols-8 gap-1 md:grid-cols-16" role="row">
      {track.steps.map((_, index) => {
        const isActive = playbackState === "playing" && nextStep === index;
        const isSelected = selectedStepIndex === index;
        const cellData = getCompactCellData(track, engineMode, index, samples, selectedStepIndex);

        return (
          <CompactStepCell
            key={`${track.id}-step-${index}`}
            accentClassName={accentClassName}
            accentColor={accentColor}
            ariaLabel={`${labelByTrackId[track.id]} step ${index + 1}`}
            enabled={cellData.enabled}
            holdNote={cellData.holdNote}
            index={index}
            isActive={isActive}
            isHold={cellData.isHold}
            isPartOfSelectedNote={cellData.isPartOfSelectedNote}
            isSelected={isSelected}
            label={cellData.label}
            volume={cellData.volume}
            onHover={() => {
              onStepHover(index);
            }}
            onClick={() => {
              onStepClick(index);
            }}
          />
        );
      })}
    </div>
  );
}

/* ─────────── Compact Step Cell ─────────── */

function CompactStepCell({
  accentClassName,
  accentColor,
  ariaLabel,
  enabled,
  holdNote,
  index,
  isActive,
  isHold,
  isPartOfSelectedNote,
  isSelected,
  label,
  volume,
  onHover,
  onClick,
}: {
  accentClassName: string;
  accentColor: string;
  ariaLabel: string;
  enabled: boolean;
  holdNote: string | null;
  index: number;
  isActive: boolean;
  isHold: boolean;
  isPartOfSelectedNote: boolean;
  isSelected: boolean;
  label: string;
  volume: number;
  onHover: () => void;
  onClick: () => void;
}) {
  const isQuarterBoundary = index % 4 === 0;

  return (
    <button
      type="button"
      aria-current={isActive ? "step" : undefined}
      aria-label={ariaLabel}
      aria-selected={isSelected || undefined}
      className={cn(
        "oc-step-cell relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-sm border font-[var(--oc-mono)] text-[10px] transition-all",
        isHold
          ? isPartOfSelectedNote
            ? "border-white/[0.1] bg-white/[0.06]"
            : "border-white/[0.06] bg-white/[0.03]"
          : enabled
            ? `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`
            : isQuarterBoundary
              ? "border-white/[0.08] bg-white/[0.04] text-white/30"
              : "border-white/[0.05] bg-white/[0.02] text-white/20",
        isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10 text-white",
        isSelected && "ring-2 ring-offset-0",
      )}
      style={isSelected ? { ["--tw-ring-color" as string]: accentColor } : undefined}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <span className="text-[8px] leading-none text-white/30">{index + 1}</span>
      <span
        className={cn(
          "max-w-full truncate px-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em]",
          isHold ? "text-white/35" : enabled ? "text-inherit" : "text-white/20",
        )}
      >
        {isHold ? (holdNote ?? "\u2014") : label}
      </span>

      {/* Velocity bar */}
      {enabled && !isHold ? (
        <div className="h-[3px] w-3/4 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${volume * 100}%`, backgroundColor: accentColor }}
          />
        </div>
      ) : null}

      {/* Hold continuation bar */}
      {isHold ? (
        <div
          className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2"
          style={{ backgroundColor: `${accentColor}35` }}
        />
      ) : null}
    </button>
  );
}
