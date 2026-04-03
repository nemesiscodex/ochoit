import { cn } from "@ochoit/ui/lib/utils";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  formatPlaybackRateLabel,
  formatNoiseConfigLabel,
  formatPulseDutyLabel,
  getNoiseTriggerPresetById,
  noiseTriggerPresets,
  pulseDutyOptions,
  sampleDpcmRateOptions,
  type NoiseTrack,
  type NoiseTriggerPresetId,
  type PulseDutyValue,
  type SerializedSampleAsset,
} from "ochoit-lib";

type PanelPosition = {
  top: number;
  left: number;
};

type PickerFrameProps = {
  accentColor: string;
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  panelPosition: PanelPosition;
  panelWidth: number;
  title: string;
  valueLabel: string;
};

export type NoiseTriggerPickerProps = {
  ariaLabel: string;
  accentColor: string;
  disabled?: boolean;
  selectedPresetId: NoiseTriggerPresetId | null;
  onHoverPreset?: (presetId: NoiseTriggerPresetId) => void;
  onSelectPreset: (presetId: NoiseTriggerPresetId) => void;
};

export type SampleTriggerPickerProps = {
  ariaLabel: string;
  accentColor: string;
  disabled?: boolean;
  playbackRate: number;
  samples: readonly SerializedSampleAsset[];
  selectedSampleId: string | null;
  onHoverTrigger?: (trigger: { sampleId: string; playbackRate: number }) => void;
  onSelectTrigger: (trigger: { sampleId: string; playbackRate: number }) => void;
};

export type NoiseConfigPickerProps = {
  ariaLabel: string;
  accentColor: string;
  disabled?: boolean;
  selectedMode: NoiseTrack["steps"][number]["mode"];
  selectedPeriodIndex: NoiseTrack["steps"][number]["periodIndex"];
  onHoverConfig?: (config: Pick<NoiseTrack["steps"][number], "mode" | "periodIndex">) => void;
  onSelectConfig: (config: Pick<NoiseTrack["steps"][number], "mode" | "periodIndex">) => void;
};

export type PulseDutyPickerProps = {
  ariaLabel: string;
  accentColor: string;
  disabled?: boolean;
  selectedDuty: PulseDutyValue;
  onHoverDuty?: (duty: PulseDutyValue) => void;
  onSelectDuty: (duty: PulseDutyValue) => void;
};

const noisePanelDimensions = {
  width: 420,
  height: 292,
} as const;

const samplePanelDimensions = {
  width: 520,
  height: 356,
} as const;

const pulseDutyPanelDimensions = {
  width: 360,
  height: 168,
} as const;

const noiseConfigPanelDimensions = {
  width: 420,
  height: 312,
} as const;

const noiseModes = ["long", "short"] as const satisfies readonly NoiseTrack["steps"][number]["mode"][];
const noisePeriodOptions = Array.from({ length: 16 }, (_, index) => index);

export function NoiseTriggerPicker({
  ariaLabel,
  accentColor,
  disabled = false,
  selectedPresetId,
  onHoverPreset,
  onSelectPreset,
}: NoiseTriggerPickerProps) {
  const { closePicker, isOpen, openPicker, panelPosition, triggerRef } = useFloatingPicker(
    disabled,
    noisePanelDimensions.width,
    noisePanelDimensions.height,
  );
  const selectedPreset = selectedPresetId === null ? null : getNoiseTriggerPresetById(selectedPresetId);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={disabled}
        className={cn(
          "flex h-6 w-full items-center justify-center rounded-sm border border-white/[0.08] bg-[var(--oc-bg)] px-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] text-white transition-all",
          "hover:border-white/20 hover:bg-white/[0.04]",
          "focus-visible:border-white/30 focus-visible:outline-none",
          disabled && "cursor-not-allowed opacity-30",
          isOpen && "border-white/25 bg-white/[0.06]",
        )}
        onClick={openPicker}
      >
        {selectedPreset?.shortLabel ?? "pick"}
      </button>

      {isOpen ? (
        <PickerFrame
          accentColor={accentColor}
          ariaLabel="Noise trigger picker"
          panelPosition={panelPosition}
          panelWidth={noisePanelDimensions.width}
          title="Noise Trigger"
          valueLabel={selectedPreset?.label ?? "Select"}
          onClose={closePicker}
        >
          <div className="grid grid-cols-2 gap-2 p-3">
            {noiseTriggerPresets.map((preset) => {
              const isSelected = preset.id === selectedPresetId;

              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={`Select noise trigger ${preset.label}`}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left transition-all",
                    isSelected
                      ? "text-white shadow-sm"
                      : "border-white/[0.06] bg-white/[0.02] text-white/70 hover:border-white/[0.14] hover:bg-white/[0.05]",
                  )}
                  style={
                    isSelected
                      ? {
                          backgroundColor: `${accentColor}18`,
                          borderColor: accentColor,
                          boxShadow: `0 0 12px ${accentColor}22`,
                        }
                      : undefined
                  }
                  onClick={() => {
                    onSelectPreset(preset.id);
                    closePicker();
                  }}
                  onMouseEnter={() => {
                    onHoverPreset?.(preset.id);
                  }}
                >
                  <div className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.14em]">
                    {preset.label}
                  </div>
                  <div className="mt-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/40">
                    <span>{preset.mode}</span>
                    <span>P{preset.periodIndex}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </PickerFrame>
      ) : null}
    </>
  );
}

export function SampleTriggerPicker({
  ariaLabel,
  accentColor,
  disabled = false,
  playbackRate,
  samples,
  selectedSampleId,
  onHoverTrigger,
  onSelectTrigger,
}: SampleTriggerPickerProps) {
  const pickerDisabled = disabled || samples.length === 0;
  const { closePicker, isOpen, openPicker, panelPosition, triggerRef } = useFloatingPicker(
    pickerDisabled,
    samplePanelDimensions.width,
    samplePanelDimensions.height,
  );
  const selectedSample = selectedSampleId === null ? null : samples.find((sample) => sample.id === selectedSampleId) ?? null;
  const valueLabel =
    selectedSample === null ? "Assign sample" : `${selectedSample.name} ${formatPlaybackRateLabel(playbackRate)}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={pickerDisabled}
        className={cn(
          "flex h-6 w-full items-center justify-center rounded-sm border border-white/[0.08] bg-[var(--oc-bg)] px-1 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] text-white transition-all",
          "hover:border-white/20 hover:bg-white/[0.04]",
          "focus-visible:border-white/30 focus-visible:outline-none",
          pickerDisabled && "cursor-not-allowed opacity-30",
          isOpen && "border-white/25 bg-white/[0.06]",
        )}
        onClick={openPicker}
      >
        <span className="max-w-full truncate">{selectedSample === null ? "assign" : valueLabel}</span>
      </button>

      {isOpen ? (
        <PickerFrame
          accentColor={accentColor}
          ariaLabel="PCM trigger picker"
          panelPosition={panelPosition}
          panelWidth={samplePanelDimensions.width}
          title="PCM Trigger"
          valueLabel={valueLabel}
          onClose={closePicker}
        >
          <div className="flex max-h-[296px] flex-col gap-2 overflow-auto p-3">
            {samples.map((sample) => {
              const isSelectedSample = sample.id === selectedSampleId;

              return (
                <div key={sample.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        {sample.name}
                      </div>
                      <div className="mt-1 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/35">
                        {sample.id} · {sample.source}
                      </div>
                    </div>
                    {isSelectedSample ? (
                      <span
                        className="rounded-sm px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: accentColor, backgroundColor: `${accentColor}15` }}
                      >
                        Selected
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {sampleDpcmRateOptions.map((rate) => {
                      const isSelectedRate = isSelectedSample && rate === playbackRate;

                      return (
                        <button
                          key={`${sample.id}-${rate}`}
                          type="button"
                          aria-label={`Assign ${sample.name} at ${formatPlaybackRateLabel(rate)}`}
                          className={cn(
                            "rounded-md border px-2 py-2 font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.12em] transition-all",
                            isSelectedRate
                              ? "text-white shadow-sm"
                              : "border-white/[0.06] bg-black/25 text-white/65 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white",
                          )}
                          style={
                            isSelectedRate
                              ? {
                                  backgroundColor: `${accentColor}18`,
                                  borderColor: accentColor,
                                  boxShadow: `0 0 12px ${accentColor}22`,
                                }
                              : undefined
                          }
                          onClick={() => {
                            onSelectTrigger({ sampleId: sample.id, playbackRate: rate });
                            closePicker();
                          }}
                          onMouseEnter={() => {
                            onHoverTrigger?.({ sampleId: sample.id, playbackRate: rate });
                          }}
                        >
                          {formatPlaybackRateLabel(rate)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </PickerFrame>
      ) : null}
    </>
  );
}

export function NoiseConfigPicker({
  ariaLabel,
  accentColor,
  disabled = false,
  selectedMode,
  selectedPeriodIndex,
  onHoverConfig,
  onSelectConfig,
}: NoiseConfigPickerProps) {
  const { closePicker, isOpen, openPicker, panelPosition, triggerRef } = useFloatingPicker(
    disabled,
    noiseConfigPanelDimensions.width,
    noiseConfigPanelDimensions.height,
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={disabled}
        className={cn(
          "flex h-4 w-full items-center justify-center rounded-sm border border-white/[0.08] bg-[var(--oc-bg)] px-1 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.12em] text-white/75 transition-all",
          "hover:border-white/20 hover:bg-white/[0.04] hover:text-white",
          "focus-visible:border-white/30 focus-visible:outline-none",
          disabled && "cursor-not-allowed opacity-30",
          isOpen && "border-white/25 bg-white/[0.06] text-white",
        )}
        onClick={openPicker}
      >
        {formatNoiseConfigLabel(selectedMode, selectedPeriodIndex)}
      </button>

      {isOpen ? (
        <PickerFrame
          accentColor={accentColor}
          ariaLabel="Noise config picker"
          panelPosition={panelPosition}
          panelWidth={noiseConfigPanelDimensions.width}
          title="Noise Rate / Mode"
          valueLabel={formatNoiseConfigLabel(selectedMode, selectedPeriodIndex)}
          onClose={closePicker}
        >
          <div className="flex max-h-[240px] flex-col gap-3 overflow-auto p-3">
            {noiseModes.map((mode) => (
              <div key={mode}>
                <div className="mb-2 flex items-center justify-between border-b border-white/[0.06] pb-1">
                  <span className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-white/32">
                    {mode} mode
                  </span>
                  <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">
                    {mode === "long" ? "top bank" : "bottom bank"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {noisePeriodOptions.map((periodIndex) => {
                    const isSelected = mode === selectedMode && periodIndex === selectedPeriodIndex;

                    return (
                      <button
                        key={`${mode}-${periodIndex}`}
                        type="button"
                        aria-label={`Select noise config ${formatNoiseConfigLabel(mode, periodIndex)}`}
                        className={cn(
                          "rounded-md border px-2 py-2 text-left transition-all",
                          isSelected
                            ? "text-white shadow-sm"
                            : "border-white/[0.06] bg-white/[0.02] text-white/70 hover:border-white/[0.14] hover:bg-white/[0.05]",
                        )}
                        style={
                          isSelected
                            ? {
                                backgroundColor: `${accentColor}18`,
                                borderColor: accentColor,
                                boxShadow: `0 0 12px ${accentColor}22`,
                              }
                            : undefined
                        }
                        onMouseEnter={() => {
                          onHoverConfig?.({ mode, periodIndex });
                        }}
                        onClick={() => {
                          onSelectConfig({ mode, periodIndex });
                          closePicker();
                        }}
                      >
                        <div className="font-[var(--oc-mono)] text-[12px] font-bold uppercase tracking-[0.08em] text-white">
                          P{periodIndex}
                        </div>
                        <div className="mt-1 font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/35">
                          {mode}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PickerFrame>
      ) : null}
    </>
  );
}

export function PulseDutyPicker({
  ariaLabel,
  accentColor,
  disabled = false,
  selectedDuty,
  onHoverDuty,
  onSelectDuty,
}: PulseDutyPickerProps) {
  const { closePicker, isOpen, openPicker, panelPosition, triggerRef } = useFloatingPicker(
    disabled,
    pulseDutyPanelDimensions.width,
    pulseDutyPanelDimensions.height,
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={disabled}
        className={cn(
          "flex h-4 w-full items-center justify-center rounded-sm border border-white/[0.08] bg-[var(--oc-bg)] px-1 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.12em] text-white/75 transition-all",
          "hover:border-white/20 hover:bg-white/[0.04] hover:text-white",
          "focus-visible:border-white/30 focus-visible:outline-none",
          disabled && "cursor-not-allowed opacity-30",
          isOpen && "border-white/25 bg-white/[0.06] text-white",
        )}
        onClick={openPicker}
      >
        {formatPulseDutyLabel(selectedDuty)}
      </button>

      {isOpen ? (
        <PickerFrame
          accentColor={accentColor}
          ariaLabel="Pulse duty picker"
          panelPosition={panelPosition}
          panelWidth={pulseDutyPanelDimensions.width}
          title="Pulse Duty"
          valueLabel={formatPulseDutyLabel(selectedDuty)}
          onClose={closePicker}
        >
          <div className="grid grid-cols-2 gap-2 p-3">
            {pulseDutyOptions.map((duty) => {
              const isSelected = duty === selectedDuty;

              return (
                <button
                  key={duty}
                  type="button"
                  aria-label={`Select pulse duty ${formatPulseDutyLabel(duty)}`}
                  className={cn(
                    "rounded-md border px-3 py-3 text-left transition-all",
                    isSelected
                      ? "text-white shadow-sm"
                      : "border-white/[0.06] bg-white/[0.02] text-white/70 hover:border-white/[0.14] hover:bg-white/[0.05]",
                  )}
                  style={
                    isSelected
                      ? {
                          backgroundColor: `${accentColor}18`,
                          borderColor: accentColor,
                          boxShadow: `0 0 12px ${accentColor}22`,
                        }
                      : undefined
                  }
                  onClick={() => {
                    onSelectDuty(duty);
                    closePicker();
                  }}
                  onMouseEnter={() => {
                    onHoverDuty?.(duty);
                  }}
                >
                  <div className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.14em]">
                    {formatPulseDutyLabel(duty)}
                  </div>
                  <div className="mt-1 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/35">
                    Pulse width
                  </div>
                </button>
              );
            })}
          </div>
        </PickerFrame>
      ) : null}
    </>
  );
}

function PickerFrame({
  accentColor,
  ariaLabel,
  children,
  onClose,
  panelPosition,
  panelWidth,
  title,
  valueLabel,
}: PickerFrameProps) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={ariaLabel}
        className="fixed z-[201] overflow-hidden rounded-lg border border-white/[0.1] bg-[#0a0c16] shadow-2xl shadow-black/60"
        style={{
          top: panelPosition.top,
          left: panelPosition.left,
          width: panelWidth,
        }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <span className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {title}
          </span>
          <span
            className="rounded-sm px-1.5 py-0.5 font-[var(--oc-mono)] text-[10px] font-bold uppercase"
            style={{ color: accentColor, backgroundColor: `${accentColor}15` }}
          >
            {valueLabel}
          </span>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

function useFloatingPicker(disabled: boolean, panelWidth: number, panelHeight: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePicker = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openPicker = useCallback(() => {
    if (disabled) {
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();

    if (rect === undefined) {
      return;
    }

    let top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - panelWidth / 2;

    if (left < 8) {
      left = 8;
    }

    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }

    if (top + panelHeight > window.innerHeight - 8) {
      top = rect.top - panelHeight - 6;
    }

    setPanelPosition({ top, left });
    setIsOpen(true);
  }, [disabled, panelHeight, panelWidth]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePicker();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, isOpen]);

  return {
    closePicker,
    isOpen,
    openPicker,
    panelPosition,
    triggerRef,
  };
}
