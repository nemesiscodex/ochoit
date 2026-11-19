import { Button } from "@ochoit/ui/components/button";
import { Slider } from "@ochoit/ui/components/slider";
import { Toggle, ToggleGroup } from "@ochoit/ui/components/toggle";
import { cn } from "@ochoit/ui/lib/utils";
import { Minus, Plus, Power, X } from "lucide-react";
import { memo, type ComponentProps, type ReactNode } from "react";
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
import { clipTag } from "@/features/song/song-samples";
import { labelByTrackId, voiceColorByTrackId } from "@/components/sequencer-theme";
import { NotePicker } from "@/components/note-picker";

const STEP_VOLUME_PERCENT_MAX = 100;
const noiseModes = [
  { mode: "long", label: "Long" },
  { mode: "short", label: "Short" },
] as const satisfies readonly { mode: NoiseTrack["steps"][number]["mode"]; label: string }[];
const noisePeriodRange = { min: 0, max: 15 } as const;

// Takes the selected row's own track so an edit or drag on another row, or a drag preview, skips it.
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
  switch (track.kind) {
    case "pulse":
    case "triangle": {
      const trackId = track.id;

      return (
        <MelodicStepDetail
          engine={engine}
          onDeselect={onDeselect}
          onUpdate={(changes) => onEdit({ type: "update-step", trackId, stepIndex, changes })}
          stepDurationMs={stepDurationMs}
          stepIndex={stepIndex}
          track={track}
        />
      );
    }
    case "noise":
      return (
        <NoiseStepDetail
          engine={engine}
          onDeselect={onDeselect}
          onUpdate={(changes) => onEdit({ type: "update-step", trackId: "noise", stepIndex, changes })}
          stepIndex={stepIndex}
          track={track}
        />
      );
    case "sample":
      return (
        <SampleStepDetail
          engineMode={engineMode}
          engine={engine}
          onDeselect={onDeselect}
          onUpdate={(changes) => onEdit({ type: "update-step", trackId: "sample", stepIndex, changes })}
          samples={samples}
          stepIndex={stepIndex}
          track={track}
        />
      );
  }
});

function MelodicStepDetail({
  engine,
  onDeselect,
  onUpdate,
  stepDurationMs,
  stepIndex,
  track,
}: {
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: MelodicStepUpdates) => void;
  stepDurationMs: number;
  stepIndex: number;
  track: PulseTrack | TriangleTrack;
}) {
  const step = track.steps[stepIndex];
  const stepName = `${labelByTrackId[track.id]} step ${stepIndex + 1}`;
  const melodicState = getMelodicStepState(track, stepIndex);
  const maxLength = melodicState.kind === "start" ? getMelodicTrackMaxLength(track, stepIndex) : 1;
  const pulseStep = track.kind === "pulse" ? track.steps[stepIndex] : null;
  const previewDurationMs = stepDurationMs * Math.max(step.length, 1);

  return (
    <DetailPanelFrame
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={() => onUpdate({ enabled: !step.enabled })}
      stepIndex={stepIndex}
      track={track}
    >
      <DetailField label="Note">
        <NotePicker
          accentColor={voiceColorByTrackId[track.id]}
          ariaLabel={`${stepName} note`}
          disabled={!step.enabled}
          selectedNote={step.note}
          onHoverNote={(note) => {
            engine?.previewNote(track.id, note, previewDurationMs, pulseStep?.duty ?? 0.5, step.volume);
          }}
          onSelectNote={(note) => {
            onUpdate({ note });
          }}
        />
      </DetailField>

      {pulseStep !== null ? (
        <DetailField label="Duty">
          <ChoiceGroup
            aria-label={`${stepName} duty cycle`}
            disabled={!step.enabled}
            value={String(pulseStep.duty)}
            onChoose={(value) => {
              onUpdate({ duty: Number(value) as PulseTrack["steps"][number]["duty"] });
            }}
          >
            {pulseDutyOptions.map((duty) => (
              <ChoiceToggle
                key={duty}
                value={String(duty)}
                aria-label={`Set duty ${formatPulseDutyLabel(duty)}`}
                onMouseEnter={() => {
                  engine?.previewNote(track.id, step.note as NoteValue, previewDurationMs, duty, step.volume);
                }}
              >
                {formatPulseDutyLabel(duty)}
              </ChoiceToggle>
            ))}
          </ChoiceGroup>
        </DetailField>
      ) : null}

      <DetailField label="Length">
        <div className="flex items-center gap-1">
          <Button
            variant="screen"
            size="icon-sm"
            aria-label={`Shorten ${stepName} duration`}
            disabled={!step.enabled || step.length <= 1}
            onClick={() => {
              onUpdate({ length: step.length - 1 });
            }}
          >
            <Minus aria-hidden="true" />
          </Button>
          <output
            aria-label={`${stepName} duration`}
            className="min-w-12 text-center font-mono text-[13px] leading-none font-semibold"
          >
            {step.enabled ? `${step.length} st` : "--"}
          </output>
          <Button
            variant="screen"
            size="icon-sm"
            aria-label={`Extend ${stepName} duration`}
            disabled={!step.enabled || step.length >= maxLength}
            onClick={() => {
              onUpdate({ length: step.length + 1 });
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </DetailField>

      <StepVolumeField
        disabled={!step.enabled}
        label={`${stepName} volume`}
        value={step.volume}
        onChange={(volume) => {
          onUpdate({ volume });
        }}
      />
    </DetailPanelFrame>
  );
}

function NoiseStepDetail({
  engine,
  onDeselect,
  onUpdate,
  stepIndex,
  track,
}: {
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: NoiseStepUpdates) => void;
  stepIndex: number;
  track: NoiseTrack;
}) {
  const step = track.steps[stepIndex];
  const stepName = `${labelByTrackId[track.id]} step ${stepIndex + 1}`;
  const currentPreset = getNoiseTriggerPresetForStep(step);

  return (
    <DetailPanelFrame
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={() => onUpdate({ enabled: !step.enabled })}
      stepIndex={stepIndex}
      track={track}
    >
      <DetailField label="Trigger">
        <ChoiceGroup
          aria-label={`${stepName} trigger`}
          className="flex-wrap"
          disabled={!step.enabled}
          value={currentPreset?.id ?? null}
          onChoose={(presetId) => {
            const preset = noiseTriggerPresets.find((entry) => entry.id === presetId);

            if (preset !== undefined) {
              onUpdate({ enabled: true, presetId: preset.id });
            }
          }}
        >
          {noiseTriggerPresets.map((preset) => (
            <ChoiceToggle
              key={preset.id}
              value={preset.id}
              aria-label={`Select noise trigger ${preset.label}`}
              onMouseEnter={() => {
                engine?.previewNoiseTrigger(preset.id);
              }}
            >
              {preset.label}
            </ChoiceToggle>
          ))}
        </ChoiceGroup>
      </DetailField>

      <DetailField label="Mode">
        <ChoiceGroup
          aria-label={`${stepName} noise mode`}
          disabled={!step.enabled}
          value={step.mode}
          onChoose={(value) => {
            const choice = noiseModes.find((entry) => entry.mode === value);

            if (choice !== undefined) {
              onUpdate({ mode: choice.mode });
            }
          }}
        >
          {noiseModes.map(({ mode, label }) => (
            <ChoiceToggle
              key={mode}
              value={mode}
              aria-label={`Set noise mode ${mode}`}
              onMouseEnter={() => {
                engine?.previewNoiseConfig(mode, step.periodIndex);
              }}
            >
              {label}
            </ChoiceToggle>
          ))}
        </ChoiceGroup>
      </DetailField>

      <DetailField label="Period">
        <div className="flex items-center gap-3">
          <Slider
            look="glow"
            accent="var(--voice)"
            className="w-28"
            disabled={!step.enabled}
            label={`${stepName} noise period`}
            min={noisePeriodRange.min}
            max={noisePeriodRange.max}
            step={1}
            value={step.periodIndex}
            onValueChange={(periodIndex) => {
              engine?.previewNoiseConfig(step.mode, periodIndex);
              onUpdate({ periodIndex });
            }}
          />
          <output aria-label={`${stepName} noise settings`} className="min-w-16 font-mono text-[13px] leading-none font-semibold">
            {formatNoiseConfigLabel(step.mode, step.periodIndex)}
          </output>
        </div>
      </DetailField>

      <StepVolumeField
        disabled={!step.enabled}
        label={`${stepName} volume`}
        value={step.volume}
        onChange={(volume) => {
          onUpdate({ volume });
        }}
      />
    </DetailPanelFrame>
  );
}

function SampleStepDetail({
  engineMode,
  engine,
  onDeselect,
  onUpdate,
  samples,
  stepIndex,
  track,
}: {
  engineMode: EngineMode;
  engine: AudioEngine | null;
  onDeselect: () => void;
  onUpdate: (updates: SampleStepUpdates) => void;
  samples: SongDocument["samples"];
  stepIndex: number;
  track: SampleTrack;
}) {
  const step = track.steps[stepIndex];
  const stepName = `${labelByTrackId[track.id]} step ${stepIndex + 1}`;
  const selectedSample = step.sampleId === null ? null : samples.find((s) => s.id === step.sampleId) ?? null;
  const previewSampleAtNote = (sampleId: string, baseNote: NoteValue, targetNote: NoteValue) => {
    engine?.previewSampleNote?.(sampleId, baseNote, targetNote);

    if (typeof engine?.previewSampleNote !== "function") {
      engine?.previewSampleTrigger(sampleId, getFrequencyForNote(targetNote) / getFrequencyForNote(baseNote));
    }
  };

  return (
    <DetailPanelFrame
      enabled={step.enabled}
      onClose={onDeselect}
      onToggleEnabled={() => onUpdate({ enabled: !step.enabled })}
      stepIndex={stepIndex}
      track={track}
    >
      {samples.length === 0 ? (
        <p className="text-sm text-ink-muted">Record a sample to assign triggers.</p>
      ) : (
        <>
          <DetailField label="Sample">
            <ChoiceGroup
              aria-label={`${stepName} trigger`}
              className="flex-wrap"
              disabled={!step.enabled}
              value={step.sampleId}
              onChoose={(sampleId) => {
                onUpdate({ sampleId });
              }}
            >
              {samples.map((sample, index) => (
                <ChoiceToggle
                  key={sample.id}
                  value={sample.id}
                  aria-label={`Assign ${sample.name}`}
                  className="max-w-40"
                  onMouseEnter={() => {
                    if (engineMode === "inspired") {
                      previewSampleAtNote(sample.id, sample.baseNote as NoteValue, step.note as NoteValue);
                      return;
                    }

                    engine?.previewSampleTrigger(sample.id, step.playbackRate);
                  }}
                >
                  <span className="shrink-0 opacity-80">{clipTag(index)}</span>
                  <span className="truncate">{sample.name}</span>
                </ChoiceToggle>
              ))}
            </ChoiceGroup>
          </DetailField>

          {engineMode === "inspired" ? (
            <DetailField label="Note">
              <NotePicker
                accentColor={voiceColorByTrackId[track.id]}
                ariaLabel={`${stepName} note`}
                disabled={!step.enabled || selectedSample === null}
                selectedNote={step.note}
                onHoverNote={(note) => {
                  if (selectedSample !== null) {
                    previewSampleAtNote(selectedSample.id, selectedSample.baseNote as NoteValue, note);
                  }
                }}
                onSelectNote={(note) => {
                  onUpdate({ note });
                }}
              />
            </DetailField>
          ) : (
            <DetailField label="DPCM rate">
              <ChoiceGroup
                aria-label={`${stepName} playback rate`}
                className="flex-wrap"
                disabled={!step.enabled}
                value={String(step.playbackRate)}
                onChoose={(value) => {
                  const rate = sampleDpcmRateOptions.find((option) => String(option) === value);

                  if (rate !== undefined) {
                    onUpdate({ playbackRate: rate });
                  }
                }}
              >
                {sampleDpcmRateOptions.map((rate) => (
                  <ChoiceToggle
                    key={rate}
                    value={String(rate)}
                    aria-label={`Set rate ${formatPlaybackRateLabel(rate)}`}
                    onMouseEnter={() => {
                      if (step.sampleId !== null) {
                        engine?.previewSampleTrigger(step.sampleId, rate);
                      }
                    }}
                  >
                    {formatPlaybackRateLabel(rate)}
                  </ChoiceToggle>
                ))}
              </ChoiceGroup>
            </DetailField>
          )}

          <StepVolumeField
            disabled={!step.enabled}
            label={`${stepName} volume`}
                value={step.volume}
            onChange={(volume) => {
              onUpdate({ volume });
            }}
          />

          {selectedSample !== null ? (
            <p className="self-end pb-1.5 text-xs text-ink-muted">
              {engineMode === "inspired"
                ? `${selectedSample.name} ${selectedSample.baseNote} → ${step.note}`
                : `${selectedSample.name} at ${formatPlaybackRateLabel(step.playbackRate)}`}
            </p>
          ) : null}
        </>
      )}
    </DetailPanelFrame>
  );
}

function DetailPanelFrame({
  children,
  enabled,
  onClose,
  onToggleEnabled,
  stepIndex,
  track,
}: {
  children: ReactNode;
  enabled: boolean;
  onClose: () => void;
  onToggleEnabled: () => void;
  stepIndex: number;
  track: Track;
}) {
  const trackLabel = labelByTrackId[track.id];

  return (
    <section
      aria-label={`${trackLabel} step ${stepIndex + 1} editor`}
      className="mt-2 rounded-[8px] border border-(--voice)/60 bg-glass/85 p-3 shadow-[0_0_18px_-6px_color-mix(in_srgb,var(--voice)_50%,transparent)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-screen text-[24px] leading-none text-(--voice) [text-shadow:0_0_8px_color-mix(in_srgb,var(--voice)_60%,transparent)]">
            Step {stepIndex + 1}
          </span>
          <span className="truncate text-[13.5px] text-ink-muted">{trackLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="screen"
            size="xs"
            aria-label={`${enabled ? "Disable" : "Enable"} ${trackLabel} step ${stepIndex + 1}`}
            onClick={onToggleEnabled}
          >
            <Power aria-hidden="true" />
            {enabled ? "Disable" : "Enable"}
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Close step editor" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      {!enabled ? (
        <p className="mb-3 text-sm text-ink-muted">Empty step selected. Press Enter to create a note or trigger here.</p>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">{children}</div>
    </section>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

// One pressed toggle at a time, styled as a segmented row; a toggle group keeps the button role the shell relies on.
function ChoiceGroup({
  className,
  onChoose,
  value,
  ...props
}: Omit<ComponentProps<typeof ToggleGroup>, "value" | "onValueChange" | "defaultValue"> & {
  value: string | null;
  onChoose: (value: string) => void;
}) {
  return (
    <ToggleGroup
      deselectable={false}
      value={value === null ? [] : [value]}
      onValueChange={(next) => {
        const chosen = next[0];

        if (typeof chosen === "string") {
          onChoose(chosen);
        }
      }}
      className={cn(
        "max-w-full gap-0.5 rounded-[5px] border border-screen-edge p-0.5 data-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

function ChoiceToggle({ className, ...props }: ComponentProps<typeof Toggle>) {
  return (
    <Toggle
      size="xs"
      className={cn(
        "rounded-[3px] border-transparent text-[13px] text-screen-muted hover:bg-screen-edge/20 hover:text-screen-ink data-pressed:bg-screen-ink data-pressed:text-glass data-pressed:shadow-[0_0_10px_rgb(170_205_255/0.45)]",
        className,
      )}
      {...props}
    />
  );
}

function StepVolumeField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (volume: number) => void;
  value: number;
}) {
  const percent = Math.round(value * STEP_VOLUME_PERCENT_MAX);

  return (
    <DetailField label="Volume">
      <div className="flex items-center gap-3">
        <Slider
          look="glow"
          accent="var(--voice)"
          className="w-28"
          disabled={disabled}
          label={label}
          min={0}
          max={STEP_VOLUME_PERCENT_MAX}
          step={1}
          value={percent}
          onValueChange={(next) => {
            onChange(next / STEP_VOLUME_PERCENT_MAX);
          }}
        />
        <span className="w-10 text-right font-mono text-[12px] leading-none font-semibold text-ink-muted">{percent}%</span>
      </div>
    </DetailField>
  );
}
