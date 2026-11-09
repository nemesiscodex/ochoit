import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { X } from "lucide-react";
import { memo, type ReactNode } from "react";
import {
  formatNoiseConfigLabel,
  formatPlaybackRateLabel,
  formatPulseDutyLabel,
  getFrequencyForNote,
  getMelodicStepState,
  getMelodicTrackMaxLength,
  getNoiseTriggerPresetForStep,
  noiseTriggerPresets,
  pulseDutyOptions,
  sampleDpcmRateOptions,
  type MelodicStepUpdates,
  type NoiseStepUpdates,
  type NoiseTrack,
  type NoteValue,
  type PulseTrack,
  type SampleStepUpdates,
  type SampleTrack,
  type SongDocument,
  type SongEdit,
  type Track,
  type TriangleTrack,
} from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";

import type { EngineMode } from "@/features/song/pcm-mode";
import { labelByTrackId, waveformLineColorByTrackId } from "@/components/sequencer-theme";
import { NotePicker } from "@/components/note-picker";

const STEP_VOLUME_PERCENT_MAX = 100;
const noiseModes = ["long", "short"] as const satisfies readonly NoiseTrack["steps"][number]["mode"][];
const noisePeriodRange = { min: 0, max: 15 } as const;

/** Takes the selected row's own track so an edit or drag on another row, or a drag preview, skips it. */
export const StepDetailPanel = memo(function StepDetailPanel({
  engine,
  engineMode,
  onDeselect,
  onEdit,
  samples,
  stepDurationMs,
  stepIndex,
  track,
}: {
  engine: AudioEngine | null;
  engineMode: EngineMode;
  onDeselect: () => void;
  onEdit: (edit: SongEdit) => void;
  samples: SongDocument["samples"];
  stepDurationMs: number;
  stepIndex: number;
  track: Track;
}) {
  const accentColor = waveformLineColorByTrackId[track.id];
  const trackLabel = labelByTrackId[track.id];

  switch (track.kind) {
    case "pulse":
    case "triangle": {
      const trackId = track.id;

      return (
        <MelodicStepDetail
          accentColor={accentColor}
          engine={engine}
          onDeselect={onDeselect}
          onUpdate={(changes) => onEdit({ type: "update-step", trackId, stepIndex, changes })}
          stepDurationMs={stepDurationMs}
          stepIndex={stepIndex}
          track={track}
          trackLabel={trackLabel}
        />
      );
    }
    case "noise":
      return (
        <NoiseStepDetail
          accentColor={accentColor}
          engine={engine}
          onDeselect={onDeselect}
          onUpdate={(changes) => onEdit({ type: "update-step", trackId: "noise", stepIndex, changes })}
          stepIndex={stepIndex}
          track={track}
          trackLabel={trackLabel}
        />
      );
    case "sample":
      return (
        <SampleStepDetail
          accentColor={accentColor}
          engineMode={engineMode}
          engine={engine}
          onDeselect={onDeselect}
          onUpdate={(changes) => onEdit({ type: "update-step", trackId: "sample", stepIndex, changes })}
          samples={samples}
          stepIndex={stepIndex}
          track={track}
          trackLabel={trackLabel}
        />
      );
  }
});

/* ─────────── Melodic Step Detail (Pulse + Triangle) ─────────── */

function MelodicStepDetail({
  accentColor,
  engine,
  onDeselect,
  onUpdate,
  stepDurationMs,
  stepIndex,
  track,
  trackLabel,
}: {
  accentColor: string;
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: MelodicStepUpdates) => void;
  stepDurationMs: number;
  stepIndex: number;
  track: PulseTrack | TriangleTrack;
  trackLabel: string;
}) {
  const step = track.steps[stepIndex];
  const melodicState = getMelodicStepState(track, stepIndex);
  const maxLength = melodicState.kind === "start" ? getMelodicTrackMaxLength(track, stepIndex) : 1;
  const isPulse = track.kind === "pulse";
  const pulseStep = isPulse ? track.steps[stepIndex] : null;
  const previewDurationMs = stepDurationMs * Math.max(step.length, 1);
  const previewVolume = step.volume;

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
              engine?.previewNote(track.id, note, previewDurationMs, pulseStep?.duty ?? 0.5, previewVolume);
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
                  <button
                    key={duty}
                    type="button"
                    aria-label={`Set duty ${formatPulseDutyLabel(duty)}`}
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
                      engine?.previewNote(track.id, step.note as NoteValue, previewDurationMs, duty, previewVolume);
                    }}
                    onClick={() => {
                      onUpdate({ duty });
                    }}
                  >
                    {formatPulseDutyLabel(duty)}
                  </button>
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
              className="h-6 min-w-0 rounded-md px-2 font-[var(--oc-mono)] text-xs font-semibold text-white/40 hover:bg-white/[0.08] hover:text-white"
              onClick={() => {
                onUpdate({ length: step.length - 1 });
              }}
            >
              -
            </Button>
            <div
              aria-label={`${trackLabel} step ${stepIndex + 1} duration`}
              className="min-w-[3rem] rounded-md border border-white/[0.06] bg-black/25 px-2 py-1 text-center font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60"
            >
              {step.enabled ? `${step.length} st` : "--"}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Extend ${trackLabel} step ${stepIndex + 1} duration`}
              disabled={!step.enabled || step.length >= maxLength}
              className="h-6 min-w-0 rounded-md px-2 font-[var(--oc-mono)] text-xs font-semibold text-white/40 hover:bg-white/[0.08] hover:text-white"
              onClick={() => {
                onUpdate({ length: step.length + 1 });
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
                <button
                  key={preset.id}
                  type="button"
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
                </button>
              );
            })}
          </div>
        </DetailField>

        <DetailField label="Mode">
          <div className="flex gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} noise mode`}>
            {noiseModes.map((mode) => {
              const isSelected = step.mode === mode;

              return (
                <button
                  key={mode}
                  type="button"
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
                </button>
              );
            })}
          </div>
        </DetailField>

        <DetailField label="Period">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={noisePeriodRange.min}
              max={noisePeriodRange.max}
              step={1}
              value={step.periodIndex}
              disabled={!step.enabled}
              aria-label={`${trackLabel} step ${stepIndex + 1} noise period`}
              className="oc-track-volume w-24"
              style={{ ["--oc-track-accent" as string]: accentColor }}
              onChange={(event) => {
                const periodIndex = Number(event.currentTarget.value);
                engine?.previewNoiseConfig(step.mode, periodIndex);
                onUpdate({ periodIndex });
              }}
            />
            <span
              className="min-w-[3rem] rounded-md border border-white/[0.06] bg-black/25 px-2 py-1 text-center font-[var(--oc-mono)] text-[10px] font-semibold uppercase text-white/60"
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

  return (
    <DetailPanelFrame
      accentColor={accentColor}
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={() => onUpdate({ enabled: !step.enabled })}
      stepIndex={stepIndex}
      trackLabel={trackLabel}
    >
      {samples.length === 0 ? (
        <p className="font-[var(--oc-mono)] text-[10px] text-white/35">
          Record a sample to assign triggers.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <DetailField label="Sample">
            <div className="flex flex-wrap gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} trigger`}>
              {samples.map((sample) => {
                const isSelected = step.sampleId === sample.id;

                return (
                  <button
                    key={sample.id}
                    type="button"
                    aria-label={`Assign ${sample.name}`}
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
                  </button>
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
            <DetailField label="DPCM Rate">
              <div className="flex gap-1" role="group" aria-label={`${trackLabel} step ${stepIndex + 1} playback rate`}>
                {sampleDpcmRateOptions.map((rate) => {
                  const isSelected = step.playbackRate === rate;

                  return (
                    <button
                      key={rate}
                      type="button"
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
                    </button>
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
            <div className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/30">
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
          <span className="font-[var(--oc-mono)] text-[11px] font-bold uppercase tracking-[0.12em] text-white">
            Step {stepIndex + 1}
          </span>
          <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/35">
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
                ? "bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white"
                : "text-white/35 hover:bg-white/[0.08] hover:text-white/60",
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
            className="size-6 text-white/30 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
      {!enabled ? (
        <p className="mb-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/40">
          Empty step selected. Press Enter to create a note or trigger here.
        </p>
      ) : null}
      {children}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.2em] text-white/30">
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
      <input
        type="range"
        min={0}
        max={STEP_VOLUME_PERCENT_MAX}
        step={1}
        value={percent}
        disabled={disabled}
        aria-label={ariaLabel}
        className="oc-track-volume w-20"
        style={{ ["--oc-track-accent" as string]: accentColor }}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value) / STEP_VOLUME_PERCENT_MAX);
        }}
      />
      <span className="w-8 text-right font-[var(--oc-mono)] text-[9px] text-white/50">{percent}%</span>
    </div>
  );
}
