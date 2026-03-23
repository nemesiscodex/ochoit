import { cn } from "@ochoit/ui/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { SkinButton as Button, SkinSlider } from "@/components/ui/skin-controls";
import type { AudioEngine } from "@/features/audio/audio-engine";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import type { EngineMode } from "@/features/song/pcm-mode";
import type {
  NoiseTrack,
  PulseTrack,
  SampleTrack,
  SongDocument,
  TrackId,
  TriangleTrack,
} from "@/features/song/song-document";
import {
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type NoteValue,
  type SampleStepUpdates,
  formatNoiseConfigLabel,
  formatPlaybackRateLabel,
  formatPulseDutyLabel,
  getDefaultSampleTrigger,
  getMelodicStepState,
  getMelodicTrackMaxLength,
  getNoiseTriggerPresetForStep,
  isMelodicTrackId,
  noiseTriggerPresets,
  pulseDutyOptions,
  samplePlaybackRateOptions,
} from "@/features/song/song-pattern";
import { labelByTrackId, waveformLineColorByTrackId } from "@/components/sequencer-theme";
import { NotePicker } from "@/components/note-picker";

export type StepSelection = {
  trackId: TrackId;
  stepIndex: number;
};

const STEP_VOLUME_PERCENT_MAX = 100;
const noiseModes = ["long", "short"] as const satisfies readonly NoiseTrack["steps"][number]["mode"][];
const noisePeriodRange = { min: 0, max: 15 } as const;

export function StepDetailPanel({
  defaultSampleId,
  engine,
  onDeselect,
  onUpdateMelodicStep,
  onUpdateNoiseStep,
  onUpdateSampleStep,
  samples,
  selection,
  song,
}: {
  defaultSampleId: string | null;
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  onUpdateNoiseStep: (stepIndex: number, updates: NoiseStepUpdates) => void;
  onUpdateSampleStep: (stepIndex: number, updates: SampleStepUpdates) => void;
  samples: SongDocument["samples"];
  selection: StepSelection;
  song: SongDocument;
}) {
  const accentColor = waveformLineColorByTrackId[selection.trackId];
  const trackLabel = labelByTrackId[selection.trackId];

  if (isMelodicTrackId(selection.trackId)) {
    const melodicTrackId = selection.trackId;
    const melodicTrack = song.tracks[melodicTrackId];

    return (
      <MelodicStepDetail
        accentColor={accentColor}
        engine={engine}
        onDeselect={onDeselect}
        onUpdate={(updates) => onUpdateMelodicStep(melodicTrackId, selection.stepIndex, updates)}
        stepIndex={selection.stepIndex}
        track={melodicTrack}
        trackLabel={trackLabel}
      />
    );
  }

  if (selection.trackId === "noise") {
    return (
      <NoiseStepDetail
        accentColor={accentColor}
        engine={engine}
        onDeselect={onDeselect}
        onUpdate={(updates) => onUpdateNoiseStep(selection.stepIndex, updates)}
        stepIndex={selection.stepIndex}
        track={song.tracks.noise}
        trackLabel={trackLabel}
      />
    );
  }

  if (selection.trackId === "sample") {
    return (
      <SampleStepDetail
        accentColor={accentColor}
        defaultSampleId={defaultSampleId}
        engineMode={song.meta.engineMode}
        engine={engine}
        onDeselect={onDeselect}
        onUpdate={(updates) => onUpdateSampleStep(selection.stepIndex, updates)}
        samples={samples}
        stepIndex={selection.stepIndex}
        track={song.tracks.sample}
        trackLabel={trackLabel}
      />
    );
  }

  return null;
}

/* ─────────── Melodic Step Detail (Pulse + Triangle) ─────────── */

function MelodicStepDetail({
  accentColor,
  engine,
  onDeselect,
  onUpdate,
  stepIndex,
  track,
  trackLabel,
}: {
  accentColor: string;
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: MelodicStepUpdates) => void;
  stepIndex: number;
  track: PulseTrack | TriangleTrack;
  trackLabel: string;
}) {
  const step = track.steps[stepIndex];
  const melodicState = getMelodicStepState(track, stepIndex);
  const maxLength = melodicState.kind === "start" ? getMelodicTrackMaxLength(track, stepIndex) : 1;
  const isPulse = track.kind === "pulse";
  const pulseStep = isPulse ? track.steps[stepIndex] : null;

  return (
    <DetailPanelFrame
      accentColor={accentColor}
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={() => onUpdate({ enabled: !step.enabled })}
      stepIndex={stepIndex}
      trackLabel={trackLabel}
    >
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <DetailField label="Note">
          <NotePicker
            accentColor={accentColor}
            ariaLabel={`${trackLabel} step ${stepIndex + 1} note`}
            disabled={!step.enabled}
            selectedNote={step.note}
            onHoverNote={(note) => {
              engine?.previewNote(track.id, note);
            }}
            onSelectNote={(note) => {
              onUpdate({ note });
            }}
          />
        </DetailField>

        {isPulse && pulseStep !== null ? (
          <DetailField label="Duty">
            <div
              className="flex gap-1"
              role="group"
              aria-label={`${trackLabel} step ${stepIndex + 1} duty cycle`}
            >
              {pulseDutyOptions.map((duty) => {
                const isSelected = pulseStep.duty === duty;

                return (
                  <Button
                    key={duty}
                    aria-label={`Set duty ${formatPulseDutyLabel(duty)}`}
                    aria-pressed={isSelected}
                    disabled={!step.enabled}
                    className={cn(
                      "rounded-md border px-2 py-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] transition-all",
                      isSelected
                        ? "text-[var(--oc-text)]"
                        : "border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:border-[var(--oc-border-bright)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]",
                      !step.enabled && "cursor-not-allowed opacity-30",
                    )}
                    style={
                      isSelected
                        ? { backgroundColor: `${accentColor}20`, borderColor: accentColor }
                        : undefined
                    }
                    onMouseEnter={() => {
                      engine?.previewNote(track.id, step.note as NoteValue, 120, duty);
                    }}
                    onClick={() => {
                      onUpdate({ duty });
                    }}
                  >
                    {formatPulseDutyLabel(duty)}
                  </Button>
                );
              })}
            </div>
          </DetailField>
        ) : null}

        <DetailField label="Length">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Shorten ${trackLabel} step ${stepIndex + 1} duration`}
              disabled={!step.enabled || step.length <= 1}
              className="h-6 min-w-0 rounded-md px-2 font-[var(--oc-mono)] text-xs font-semibold text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
              onClick={() => {
                onUpdate({ length: Math.max(1, step.length - 1) });
              }}
            >
              -
            </Button>
            <div
              aria-label={`${trackLabel} step ${stepIndex + 1} duration`}
              className="min-w-[3rem] rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-2 py-1 text-center font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--oc-text-muted)]"
            >
              {step.enabled ? `${step.length} st` : "--"}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Extend ${trackLabel} step ${stepIndex + 1} duration`}
              disabled={!step.enabled || step.length >= maxLength}
              className="h-6 min-w-0 rounded-md px-2 font-[var(--oc-mono)] text-xs font-semibold text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
              onClick={() => {
                onUpdate({ length: Math.min(maxLength, step.length + 1) });
              }}
            >
              +
            </Button>
          </div>
        </DetailField>

        <DetailField label="Step Vol">
          <StepVolumeSlider
            accentColor={accentColor}
            ariaLabel={`${trackLabel} step ${stepIndex + 1} volume`}
            disabled={!step.enabled}
            value={step.volume}
            onChange={(volume) => {
              onUpdate({ volume });
            }}
          />
        </DetailField>
      </div>
    </DetailPanelFrame>
  );
}

/* ─────────── Noise Step Detail ─────────── */

function NoiseStepDetail({
  accentColor,
  engine,
  onDeselect,
  onUpdate,
  stepIndex,
  track,
  trackLabel,
}: {
  accentColor: string;
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: NoiseStepUpdates) => void;
  stepIndex: number;
  track: NoiseTrack;
  trackLabel: string;
}) {
  const step = track.steps[stepIndex];
  const currentPreset = getNoiseTriggerPresetForStep(step);

  return (
    <DetailPanelFrame
      accentColor={accentColor}
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={() => onUpdate({ enabled: !step.enabled })}
      stepIndex={stepIndex}
      trackLabel={trackLabel}
    >
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <DetailField label="Preset">
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} trigger`}>
            {noiseTriggerPresets.map((preset) => {
              const isSelected = currentPreset?.id === preset.id;

              return (
                <Button
                  key={preset.id}
                  aria-label={`Select noise trigger ${preset.label}`}
                  aria-pressed={isSelected}
                  disabled={!step.enabled}
                  className={cn(
                    "rounded-md border px-2 py-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] transition-all",
                    isSelected
                      ? "text-white"
                      : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white",
                    !step.enabled && "cursor-not-allowed opacity-30",
                  )}
                  style={
                    isSelected
                      ? { backgroundColor: `${accentColor}20`, borderColor: accentColor }
                      : undefined
                  }
                  onMouseEnter={() => {
                    engine?.previewNoiseTrigger(preset.id);
                  }}
                  onClick={() => {
                    onUpdate({ enabled: true, presetId: preset.id });
                  }}
                >
                  {preset.shortLabel}
                </Button>
              );
            })}
          </div>
        </DetailField>

        <DetailField label="Mode">
          <div className="flex gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} noise mode`}>
            {noiseModes.map((mode) => {
              const isSelected = step.mode === mode;

              return (
                <Button
                  key={mode}
                  aria-label={`Set noise mode ${mode}`}
                  aria-pressed={isSelected}
                  disabled={!step.enabled}
                  className={cn(
                    "rounded-md border px-3 py-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] transition-all",
                    isSelected
                      ? "text-white"
                      : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white",
                    !step.enabled && "cursor-not-allowed opacity-30",
                  )}
                  style={
                    isSelected
                      ? { backgroundColor: `${accentColor}20`, borderColor: accentColor }
                      : undefined
                  }
                  onMouseEnter={() => {
                    engine?.previewNoiseConfig(mode, step.periodIndex);
                  }}
                  onClick={() => {
                    onUpdate({ mode });
                  }}
                >
                  {mode}
                </Button>
              );
            })}
          </div>
        </DetailField>

        <DetailField label="Period">
          <div className="flex items-center gap-2">
            <SkinSlider
              aria-label={`${trackLabel} step ${stepIndex + 1} noise period`}
              className="oc-track-volume w-24"
              disabled={!step.enabled}
              max={noisePeriodRange.max}
              min={noisePeriodRange.min}
              style={{ ["--oc-track-accent" as string]: accentColor }}
              value={step.periodIndex}
              onValueChange={(periodIndex) => {
                engine?.previewNoiseConfig(step.mode, periodIndex);
                onUpdate({ periodIndex });
              }}
            />
            <span
              className="min-w-[3rem] rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-2 py-1 text-center font-[var(--oc-mono)] text-[10px] font-semibold uppercase text-[var(--oc-text-muted)]"
              aria-label={`${trackLabel} step ${stepIndex + 1} noise settings`}
            >
              {formatNoiseConfigLabel(step.mode, step.periodIndex)}
            </span>
          </div>
        </DetailField>

        <DetailField label="Step Vol">
          <StepVolumeSlider
            accentColor={accentColor}
            ariaLabel={`${trackLabel} step ${stepIndex + 1} volume`}
            disabled={!step.enabled}
            value={step.volume}
            onChange={(volume) => {
              onUpdate({ volume });
            }}
          />
        </DetailField>
      </div>
    </DetailPanelFrame>
  );
}

/* ─────────── Sample Step Detail ─────────── */

function SampleStepDetail({
  accentColor,
  defaultSampleId,
  engineMode,
  engine,
  onDeselect,
  onUpdate,
  samples,
  stepIndex,
  track,
  trackLabel,
}: {
  accentColor: string;
  defaultSampleId: string | null;
  engineMode: EngineMode;
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: SampleStepUpdates) => void;
  samples: SongDocument["samples"];
  stepIndex: number;
  track: SampleTrack;
  trackLabel: string;
}) {
  const step = track.steps[stepIndex];
  const selectedSample = step.sampleId === null ? null : samples.find((s) => s.id === step.sampleId) ?? null;
  const previewSampleAtNote = (sampleId: string, baseNote: NoteValue, targetNote: NoteValue) => {
    const playbackRate = getFrequencyForNote(targetNote) / getFrequencyForNote(baseNote);

    engine?.previewSampleNote?.(sampleId, baseNote, targetNote);

    if (typeof engine?.previewSampleNote !== "function") {
      engine?.previewSampleTrigger(sampleId, playbackRate);
    }
  };

  const handleToggleEnabled = () => {
    if (step.enabled) {
      onUpdate({ enabled: false });
      return;
    }

    const defaultTrigger = getDefaultSampleTrigger(samples, defaultSampleId);

    onUpdate({
      enabled: true,
      sampleId: step.sampleId ?? defaultTrigger.sampleId,
      note: (step.note as NoteValue) ?? defaultTrigger.note,
      playbackRate: step.playbackRate ?? defaultTrigger.playbackRate,
    });
  };

  return (
    <DetailPanelFrame
      accentColor={accentColor}
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={handleToggleEnabled}
      stepIndex={stepIndex}
      trackLabel={trackLabel}
    >
      {samples.length === 0 ? (
        <p className="font-[var(--oc-mono)] text-[10px] text-[var(--oc-text-faint)]">
          Record a sample to assign triggers.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <DetailField label="Sample">
            <div className="flex flex-wrap gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} trigger`}>
              {samples.map((sample) => {
                const isSelected = step.sampleId === sample.id;

                return (
                  <Button
                    key={sample.id}
                    aria-label={`Assign ${sample.name}`}
                    aria-pressed={isSelected}
                    disabled={!step.enabled}
                    className={cn(
                      "rounded-md border px-2 py-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] transition-all",
                      isSelected
                        ? "text-[var(--oc-text)]"
                        : "border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:border-[var(--oc-border-bright)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]",
                      !step.enabled && "cursor-not-allowed opacity-30",
                    )}
                    style={
                      isSelected
                        ? { backgroundColor: `${accentColor}20`, borderColor: accentColor }
                        : undefined
                    }
                    onMouseEnter={() => {
                      if (engineMode === "inspired") {
                        previewSampleAtNote(sample.id, sample.baseNote as NoteValue, step.note as NoteValue);
                        return;
                      }

                      engine?.previewSampleTrigger(sample.id, step.playbackRate);
                    }}
                    onClick={() => {
                      onUpdate({ sampleId: sample.id });
                    }}
                  >
                    {sample.name}
                  </Button>
                );
              })}
            </div>
          </DetailField>

          {engineMode === "inspired" ? (
            <DetailField label="Note">
              <NotePicker
                accentColor={accentColor}
                ariaLabel={`${trackLabel} step ${stepIndex + 1} note`}
                disabled={!step.enabled || selectedSample === null}
                selectedNote={step.note}
                onHoverNote={(note) => {
                  if (selectedSample === null) {
                    return;
                  }

                  previewSampleAtNote(selectedSample.id, selectedSample.baseNote as NoteValue, note);
                }}
                onSelectNote={(note) => {
                  onUpdate({ note });
                }}
              />
            </DetailField>
          ) : (
            <DetailField label="Rate">
              <div className="flex gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} playback rate`}>
                {samplePlaybackRateOptions.map((rate) => {
                  const isSelected = step.playbackRate === rate;

                  return (
                    <Button
                      key={rate}
                      aria-label={`Set rate ${formatPlaybackRateLabel(rate)}`}
                      aria-pressed={isSelected}
                      disabled={!step.enabled}
                      className={cn(
                        "rounded-md border px-2 py-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] transition-all",
                        isSelected
                          ? "text-white"
                          : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white",
                        !step.enabled && "cursor-not-allowed opacity-30",
                      )}
                      style={
                        isSelected
                          ? { backgroundColor: `${accentColor}20`, borderColor: accentColor }
                          : undefined
                      }
                      onMouseEnter={() => {
                        if (step.sampleId !== null) {
                          engine?.previewSampleTrigger(step.sampleId, rate);
                        }
                      }}
                      onClick={() => {
                        onUpdate({ playbackRate: rate });
                      }}
                    >
                      {formatPlaybackRateLabel(rate)}
                    </Button>
                  );
                })}
              </div>
            </DetailField>
          )}

          <DetailField label="Step Vol">
            <StepVolumeSlider
              accentColor={accentColor}
              ariaLabel={`${trackLabel} step ${stepIndex + 1} volume`}
              disabled={!step.enabled}
              value={step.volume}
              onChange={(volume) => {
                onUpdate({ volume });
              }}
            />
          </DetailField>

          {selectedSample !== null ? (
            <div className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-[var(--oc-text-faint)]">
              {engineMode === "inspired"
                ? `${selectedSample.name} ${selectedSample.baseNote} → ${step.note}`
                : `${selectedSample.name} ${formatPlaybackRateLabel(step.playbackRate)}`}
            </div>
          ) : null}
        </div>
      )}
    </DetailPanelFrame>
  );
}

/* ─────────── Shared Components ─────────── */

function DetailPanelFrame({
  accentColor,
  children,
  enabled,
  onClose,
  onToggleEnabled,
  stepIndex,
  trackLabel,
}: {
  accentColor: string;
  children: ReactNode;
  enabled: boolean;
  onClose: () => void;
  onToggleEnabled: () => void;
  stepIndex: number;
  trackLabel: string;
}) {
  return (
    <div
      className="oc-detail-panel mt-2 rounded-lg border bg-[var(--oc-surface-raised)] p-3"
      style={{ borderColor: `${accentColor}30` }}
      aria-label={`${trackLabel} step ${stepIndex + 1} editor`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="font-[var(--oc-mono)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--oc-text)]">
            Step {stepIndex + 1}
          </span>
          <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-[var(--oc-text-faint)]">
            {trackLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${enabled ? "Disable" : "Enable"} ${trackLabel} step ${stepIndex + 1}`}
            aria-pressed={enabled}
            className={cn(
              "h-6 rounded-md px-2 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.12em]",
              enabled
                ? "bg-[var(--oc-btn-subtle-hover)] text-[var(--oc-text-dim)] hover:bg-[var(--oc-border-bright)] hover:text-[var(--oc-text)]"
                : "text-[var(--oc-text-faint)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text-muted)]",
            )}
            onClick={onToggleEnabled}
          >
            {enabled ? "On" : "Off"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close step editor"
            className="size-6 text-[var(--oc-text-faint)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            onClick={onClose}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.2em] text-[var(--oc-text-faint)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function StepVolumeSlider({
  accentColor,
  ariaLabel,
  disabled,
  value,
  onChange,
}: {
  accentColor: string;
  ariaLabel: string;
  disabled: boolean;
  value: number;
  onChange: (volume: number) => void;
}) {
  const percent = Math.round(value * 100);

  return (
    <div className="flex items-center gap-2">
      <SkinSlider
        aria-label={ariaLabel}
        className="oc-track-volume w-20"
        disabled={disabled}
        max={STEP_VOLUME_PERCENT_MAX}
        min={0}
        style={{ ["--oc-track-accent" as string]: accentColor }}
        value={percent}
        onValueChange={(nextValue) => {
          onChange(nextValue / STEP_VOLUME_PERCENT_MAX);
        }}
      />
      <span className="w-8 text-right font-[var(--oc-mono)] text-[9px] text-[var(--oc-text-muted)]">{percent}%</span>
    </div>
  );
}
