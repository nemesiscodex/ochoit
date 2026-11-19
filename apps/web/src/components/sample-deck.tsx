import { Input } from "@ochoit/ui/components/input";
import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { Mic, Square, Trash2 } from "lucide-react";
import { memo, useMemo } from "react";
import { SONG_MAX_SAMPLE_COUNT, type SongDocument } from "ochoit-lib";

import { NotePicker } from "@/components/note-picker";
import { waveformGlowColorByTrackId, waveformLineColorByTrackId } from "@/components/sequencer-theme";
import { WaveformCanvas } from "@/components/waveform-canvas";
import {
  createWaveformFromPcm,
  type SampleRecorderPermissionState,
  type SampleRecorderStatus,
} from "@/features/audio/sample-recorder";
import { getTrimmedFrameCount, getTrimmedSamplePcm } from "@/features/song/song-samples";

type SampleDeckProps = {
  engineMode: SongDocument["meta"]["engineMode"];
  samples: SongDocument["samples"];
  sample: SongDocument["samples"][number] | null;
  selectedSampleId: string | null;
  recorderErrorMessage: string | null;
  recorderPermissionState: SampleRecorderPermissionState;
  recorderStatus: SampleRecorderStatus;
  recordingDurationMs: number;
  onDeleteSample: (sampleId: string) => void;
  onApplyTrim: () => void;
  onPreviewSample: () => Promise<void>;
  onMoveTrimWindow: (startFrame: number) => void;
  onResizeTrimWindow: (frameCount: number) => void;
  onSetSampleBaseNote: (baseNote: string) => void;
  onSelectSample: (sampleId: string) => void;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
};

export const SampleDeck = memo(function SampleDeck({
  engineMode,
  samples,
  sample,
  selectedSampleId,
  recorderErrorMessage,
  recorderPermissionState,
  recorderStatus,
  recordingDurationMs,
  onDeleteSample,
  onApplyTrim,
  onPreviewSample,
  onMoveTrimWindow,
  onResizeTrimWindow,
  onSetSampleBaseNote,
  onSelectSample,
  onStartRecording,
  onStopRecording,
}: SampleDeckProps) {
  const isRecording = recorderStatus === "recording";
  const isBusy = recorderStatus === "requesting-permission" || recorderStatus === "processing";
  const sampleLimitReached = samples.length >= SONG_MAX_SAMPLE_COUNT;
  const trimmedPcm = useMemo(() => (sample === null ? [] : getTrimmedSamplePcm(sample)), [sample]);
  const waveform = useMemo(() => createWaveformFromPcm(trimmedPcm), [trimmedPcm]);
  const sampleClipPreviews = useMemo(
    () =>
      [...samples].reverse().map((entry) => ({
        entry,
        waveform: createWaveformFromPcm(getTrimmedSamplePcm(entry), 48),
        trimmedDurationMs:
          entry.sampleRate <= 0 ? 0 : Math.round((getTrimmedFrameCount(entry) / entry.sampleRate) * 1000),
      })),
    [samples],
  );
  const trimmedFrameCount = useMemo(() => (sample === null ? 0 : getTrimmedFrameCount(sample)), [sample]);
  const trimWindowMaxStart = sample === null ? 0 : Math.max(0, sample.frameCount - trimmedFrameCount);
  const hasPendingTrim = sample !== null && (sample.trim.startFrame > 0 || sample.trim.endFrame < sample.frameCount);
  const sampleDurationMs =
    sample === null || sample.sampleRate <= 0 ? 0 : Math.round((trimmedFrameCount / sample.sampleRate) * 1000);
  const statusLabel =
    recorderStatus === "recording"
      ? `Recording ${formatSampleDurationLabel(recordingDurationMs)}`
      : recorderStatus === "processing"
        ? "Rendering clip"
        : recorderStatus === "requesting-permission"
          ? "Requesting microphone access"
          : recorderStatus === "error"
            ? (recorderErrorMessage ?? "Recorder error")
            : sampleLimitReached
              ? `Clip limit reached (${samples.length}/${SONG_MAX_SAMPLE_COUNT})`
              : sample === null
                ? "Ready to capture"
                : `Latest clip ${formatSampleDurationLabel(sampleDurationMs)}`;
  const permissionLabel = getPermissionLabel(recorderPermissionState);

  return (
    <div className="rounded-lg border border-[var(--oc-sample)]/20 bg-[var(--oc-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-sample)]">
          Sample Deck
        </h2>
        <Mic className="size-4 text-[var(--oc-sample)]/60" />
      </div>

      <p className="mb-3 font-[var(--oc-mono)] text-[10px] text-white/35">
        Capture up to 2s from the microphone. Store up to {SONG_MAX_SAMPLE_COUNT} clips, then trim and swap between them
        from the deck.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-8 rounded-md bg-[var(--oc-sample)] font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#07080e] hover:bg-[var(--oc-sample)]/85"
          disabled={recorderPermissionState === "unsupported" || isBusy || (!isRecording && sampleLimitReached)}
          onClick={() => {
            if (isRecording) {
              onStopRecording();
              return;
            }

            void onStartRecording();
          }}
        >
          {isRecording ? <Square className="mr-1.5 size-3" /> : <Mic className="mr-1.5 size-3" />}
          {isRecording ? "Stop" : recorderStatus === "requesting-permission" ? "Allow Mic" : "Record"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.07] hover:text-white"
          disabled={sample === null || isBusy || isRecording}
          onClick={() => {
            void onPreviewSample();
          }}
        >
          Preview
        </Button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]">
        <div className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2 text-white/45">
          <span className="block text-white/25">Mic</span>
          <span className="mt-1 block text-white/65">{permissionLabel}</span>
        </div>
        <div className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2 text-white/45">
          <span className="block text-white/25">Recorder</span>
          <span className="mt-1 block text-white/65">{statusLabel}</span>
        </div>
      </div>
      {sampleLimitReached ? (
        <div className="mb-3 rounded-md border border-[var(--oc-noise)]/25 bg-[var(--oc-noise)]/[0.06] px-2.5 py-2 font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-noise)]">
          Delete a clip before recording another one. Share links also cap embedded samples at {SONG_MAX_SAMPLE_COUNT}.
        </div>
      ) : null}

      <div className="rounded-md border border-white/[0.06] bg-black/25 p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-white/35">
          <span>Trim</span>
          <span>{sample?.name ?? "No Sample"}</span>
        </div>
        <div className="oc-waveform-wrap rounded-sm">
          <WaveformCanvas
            ariaLabel="PCM trim preview waveform"
            samples={waveform}
            className="h-12 w-full"
            backgroundColor="rgba(7, 8, 14, 0.9)"
            glowColor={waveformGlowColorByTrackId.sample}
            lineColor={waveformLineColorByTrackId.sample}
          />
        </div>
        <div className="mt-3 grid gap-3">
          <SampleTrimControl
            disabled={sample === null || isRecording}
            label="Window"
            labelId="sample-trim-window"
            max={trimWindowMaxStart}
            onChange={onMoveTrimWindow}
            value={sample?.trim.startFrame ?? 0}
          />
          <SampleTrimControl
            disabled={sample === null || isRecording}
            label="Length"
            labelId="sample-trim-length"
            max={sample?.frameCount ?? 0}
            min={0}
            onChange={onResizeTrimWindow}
            value={trimmedFrameCount}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-white/60 hover:bg-white/[0.07] hover:text-white"
            disabled={!hasPendingTrim || isRecording || isBusy}
            onClick={onApplyTrim}
          >
            Apply Trim
          </Button>
        </div>
        <div className="mt-3 grid gap-2 rounded-md border border-white/[0.06] bg-black/20 p-2.5">
          <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/38">
            <span>Pitch Map</span>
            <span>{engineMode === "inspired" ? "Chromatic" : "Trigger"}</span>
          </div>
          {sample === null ? (
            <div className="font-[var(--oc-mono)] text-[10px] text-white/32">
              Load a sample to assign its base note.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[7rem]">
                  <NotePicker
                    accentColor={waveformLineColorByTrackId.sample}
                    ariaLabel="Sample base note"
                    disabled={isRecording}
                    selectedNote={sample.baseNote}
                    onSelectNote={(note) => {
                      onSetSampleBaseNote(note);
                    }}
                  />
                </div>
                <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/36">
                  Base note
                </span>
                {sample.detectedBaseNote !== null ? (
                  <button
                    type="button"
                    className="rounded-sm border border-[var(--oc-sample)]/20 bg-[var(--oc-sample)]/10 px-2 py-1 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-sample)] transition hover:bg-[var(--oc-sample)]/18"
                    onClick={() => {
                      onSetSampleBaseNote(sample.detectedBaseNote ?? sample.baseNote);
                    }}
                  >
                    Suggested {sample.detectedBaseNote}
                  </button>
                ) : (
                  <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/28">
                    No stable note detected
                  </span>
                )}
              </div>
              <p className="font-[var(--oc-mono)] text-[10px] leading-5 text-white/40">
                Inspired mode transposes from this base note. Authentic mode still plays the clip as a one-shot trigger.
              </p>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/35">
          <span>
            {sample === null
              ? "No clip loaded"
              : `${sample.trim.startFrame}-${sample.trim.endFrame} · ${trimmedFrameCount} / ${sample.frameCount} fr`}
          </span>
          <span>{sample === null ? "0.00s" : formatSampleDurationLabel(sampleDurationMs)}</span>
        </div>
      </div>

      <div className="rounded-md border border-white/[0.06] bg-black/25 p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-white/35">
          <span>Recorded Clips</span>
          <span>{samples.length}</span>
        </div>
        <div className="grid gap-2">
          {samples.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/[0.08] bg-black/20 px-3 py-4 text-center font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-white/28">
              Record something to build your PCM clip list.
            </div>
          ) : (
            sampleClipPreviews.map(({ entry, waveform, trimmedDurationMs }) => {
              const isSelected = entry.id === selectedSampleId;

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border p-2 transition-colors",
                    isSelected
                      ? "border-[var(--oc-sample)]/50 bg-[var(--oc-sample)]/10"
                      : "border-white/[0.06] bg-black/20",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Load sample ${entry.name}`}
                    className="min-w-0 text-left"
                    onClick={() => {
                      onSelectSample(entry.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        {entry.name}
                      </span>
                      {isSelected ? (
                        <span className="rounded-sm bg-[var(--oc-sample)]/18 px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-sample)]">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/34">
                      {entry.id} · {formatSampleDurationLabel(trimmedDurationMs)}
                    </div>
                    <div className="mt-2 rounded-sm border border-white/[0.05] bg-[#07080e]/80">
                      <WaveformCanvas
                        ariaLabel={`${entry.name} waveform`}
                        samples={waveform}
                        className="h-8 w-full"
                        backgroundColor="rgba(7, 8, 14, 0.82)"
                        glowColor={waveformGlowColorByTrackId.sample}
                        lineColor={waveformLineColorByTrackId.sample}
                      />
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Delete sample ${entry.name}`}
                    className="size-8 self-start border-white/[0.08] bg-white/[0.03] text-white/45 hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
                    onClick={() => {
                      onDeleteSample(entry.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}, areSampleDeckPropsEqual);

function areSampleDeckPropsEqual(previousProps: Readonly<SampleDeckProps>, nextProps: Readonly<SampleDeckProps>) {
  return (
    previousProps.engineMode === nextProps.engineMode &&
    previousProps.samples === nextProps.samples &&
    previousProps.sample === nextProps.sample &&
    previousProps.selectedSampleId === nextProps.selectedSampleId &&
    previousProps.recorderErrorMessage === nextProps.recorderErrorMessage &&
    previousProps.recorderPermissionState === nextProps.recorderPermissionState &&
    previousProps.recorderStatus === nextProps.recorderStatus &&
    previousProps.recordingDurationMs === nextProps.recordingDurationMs
  );
}

function SampleTrimControl({
  disabled,
  label,
  labelId,
  max,
  min = 0,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  labelId: string;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/38">
        <label htmlFor={labelId}>{label}</label>
        <span>{value} fr</span>
      </div>
      <input
        id={labelId}
        aria-label={`Sample trim ${label.toLowerCase()}`}
        type="range"
        min={min}
        max={max}
        step={1}
        value={String(Math.max(min, Math.min(value, max)))}
        disabled={disabled}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-[var(--oc-sample)] disabled:cursor-not-allowed disabled:opacity-40"
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
      <Input
        aria-label={`Sample trim ${label.toLowerCase()} frame`}
        type="number"
        min={min}
        max={max}
        step={1}
        value={String(Math.max(min, Math.min(value, max)))}
        disabled={disabled}
        className="h-7 border-white/[0.08] bg-black/30 px-2 font-[var(--oc-mono)] text-[10px] text-white"
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

function getPermissionLabel(permissionState: SampleRecorderPermissionState) {
  switch (permissionState) {
    case "granted":
      return "Granted";
    case "denied":
      return "Blocked";
    case "unsupported":
      return "Unsupported";
    default:
      return "Not asked";
  }
}

function formatSampleDurationLabel(durationMs: number) {
  return `${(Math.max(0, durationMs) / 1000).toFixed(2)}s`;
}
