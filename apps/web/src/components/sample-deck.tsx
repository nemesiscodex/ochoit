import { Button } from "@ochoit/ui/components/button";
import { NumberField } from "@ochoit/ui/components/number-field";
import { Slider } from "@ochoit/ui/components/slider";
import { cn } from "@ochoit/ui/lib/utils";
import { Check, Mic, Play, Square, Trash2 } from "lucide-react";
import { memo, useMemo } from "react";
import { SONG_MAX_SAMPLE_COUNT, type SongDocument } from "ochoit-lib";

import { NotePicker } from "@/components/note-picker";
import { WaveformCanvas } from "@/components/waveform-canvas";
import {
  createWaveformFromPcm,
  SAMPLE_RECORDING_MAX_DURATION_MS,
  type SampleRecorderPermissionState,
  type SampleRecorderStatus,
} from "@/features/audio/sample-recorder";
import { clipTag, getTrimmedFrameCount, getTrimmedSamplePcm } from "@/features/song/song-samples";

type SampleAsset = SongDocument["samples"][number];

type SampleDeckProps = {
  engineMode: SongDocument["meta"]["engineMode"];
  samples: SongDocument["samples"];
  sample: SampleAsset | null;
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

type RecorderMessage = { tone: "status" | "error"; text: string };

const maxRecordingLabel = formatSeconds(SAMPLE_RECORDING_MAX_DURATION_MS);
const maxRecordingSentence = `${SAMPLE_RECORDING_MAX_DURATION_MS / 1000} seconds`;

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

  return (
    <div className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @2xl:gap-8">
        <div className="flex flex-col gap-6">
          <RecordControl
            canRecord={recorderPermissionState !== "unsupported" && !isBusy && (isRecording || !sampleLimitReached)}
            isRecording={isRecording}
            message={getRecorderMessage({
              errorMessage: recorderErrorMessage,
              permissionState: recorderPermissionState,
              recordingDurationMs,
              status: recorderStatus,
            })}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
          />
          <ClipList
            samples={samples}
            selectedSampleId={selectedSampleId}
            onDeleteSample={onDeleteSample}
            onSelectSample={onSelectSample}
          />
        </div>
        {sample === null ? null : (
          <SampleEditor
            engineMode={engineMode}
            sample={sample}
            isBusy={isBusy}
            isRecording={isRecording}
            onApplyTrim={onApplyTrim}
            onMoveTrimWindow={onMoveTrimWindow}
            onPreviewSample={onPreviewSample}
            onResizeTrimWindow={onResizeTrimWindow}
            onSetSampleBaseNote={onSetSampleBaseNote}
          />
        )}
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

function RecordControl({
  canRecord,
  isRecording,
  message,
  onStartRecording,
  onStopRecording,
}: {
  canRecord: boolean;
  isRecording: boolean;
  message: RecorderMessage;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5">
      <Button
        variant="primary"
        disabled={!canRecord}
        onClick={() => {
          if (isRecording) {
            onStopRecording();
            return;
          }

          void onStartRecording();
        }}
      >
        {isRecording ? <Square aria-hidden="true" className="fill-current" /> : <Mic aria-hidden="true" />}
        {isRecording ? "Stop recording" : "Record"}
      </Button>
      <p aria-live="polite" className="text-[13px] leading-snug text-ink-muted tabular-nums">
        {message.tone === "status" ? message.text : null}
      </p>
      {message.tone === "error" ? (
        <p role="alert" className="text-[13px] leading-snug font-medium text-signal-text">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function ClipList({
  samples,
  selectedSampleId,
  onDeleteSample,
  onSelectSample,
}: {
  samples: SongDocument["samples"];
  selectedSampleId: string | null;
  onDeleteSample: (sampleId: string) => void;
  onSelectSample: (sampleId: string) => void;
}) {
  const clipRows = useMemo(
    () =>
      samples
        .map((entry, index) => ({
          entry,
          tag: clipTag(index),
          waveform: createWaveformFromPcm(getTrimmedSamplePcm(entry), 48),
          durationMs: getDurationMs(entry, getTrimmedFrameCount(entry)),
        }))
        .reverse(),
    [samples],
  );

  return (
    <section aria-labelledby="sample-deck-clips" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sample-deck-clips" className="font-screen text-[24px] leading-none font-normal text-ink">
          Clips
        </h2>
        <span className="font-screen text-[20px] leading-none text-ink-muted">
          {samples.length} of {SONG_MAX_SAMPLE_COUNT}
        </span>
      </div>
      {samples.length >= SONG_MAX_SAMPLE_COUNT ? (
        <div className="rounded-control border border-line bg-surface-sunken px-3 py-2 text-[13px] leading-snug text-ink-muted">
          <p className="font-medium text-ink">{`Clip limit reached (${samples.length}/${SONG_MAX_SAMPLE_COUNT})`}</p>
          <p>
            Delete a clip before recording another one. Share links also cap embedded samples at{" "}
            {SONG_MAX_SAMPLE_COUNT}.
          </p>
        </div>
      ) : null}
      {clipRows.length === 0 ? (
        <p className="rounded-panel bg-surface-sunken px-4 py-5 text-[13px] leading-relaxed text-ink-muted">
          Record a sound to add your first clip. A song holds up to {SONG_MAX_SAMPLE_COUNT} clips for the PCM voice.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {clipRows.map(({ entry, tag, waveform, durationMs }) => {
            const isSelected = entry.id === selectedSampleId;

            return (
              <li
                key={entry.id}
                className={cn(
                  "flex items-center gap-1 rounded-[8px] border pr-1 transition-colors",
                  isSelected ? "border-ink bg-surface-2" : "border-transparent hover:bg-surface-2",
                )}
              >
                <Button
                  variant="ghost"
                  aria-label={`Load sample ${entry.name}`}
                  aria-pressed={isSelected}
                  className="h-auto min-w-0 flex-1 justify-start gap-2.5 border-0 p-1 text-left hover:bg-transparent active:translate-y-0"
                  onClick={() => {
                    onSelectSample(entry.id);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="glass-well block h-8 w-[76px] shrink-0 overflow-hidden rounded-[6px] p-0.5 ring-1 ring-black/80"
                  >
                    <WaveformCanvas
                      ariaLabel={`${entry.name} waveform`}
                      samples={waveform}
                      className="block h-full w-full"
                      {...pcmTraceColors}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 font-mono text-[13px] leading-none font-semibold">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="shrink-0 text-ink-muted">{tag}</span>
                      <span className="truncate text-ink" title={entry.name}>
                        {entry.name}
                      </span>
                    </span>
                    <span className="text-[12px] text-ink-muted">{formatSeconds(durationMs)}</span>
                  </span>
                  {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0 text-ink" /> : null}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete sample ${entry.name}`}
                  data-agent-confirm={`Deletes the clip ${entry.name} and clears its PCM steps`}
                  className="hover:text-signal-text"
                  onClick={() => {
                    onDeleteSample(entry.id);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SampleEditor({
  engineMode,
  sample,
  isBusy,
  isRecording,
  onApplyTrim,
  onMoveTrimWindow,
  onPreviewSample,
  onResizeTrimWindow,
  onSetSampleBaseNote,
}: {
  engineMode: SongDocument["meta"]["engineMode"];
  sample: SampleAsset;
  isBusy: boolean;
  isRecording: boolean;
  onApplyTrim: () => void;
  onMoveTrimWindow: (startFrame: number) => void;
  onPreviewSample: () => Promise<void>;
  onResizeTrimWindow: (frameCount: number) => void;
  onSetSampleBaseNote: (baseNote: string) => void;
}) {
  const waveform = useMemo(() => createWaveformFromPcm(sample.pcm), [sample.pcm]);
  const trimmedFrameCount = getTrimmedFrameCount(sample);
  const { startFrame, endFrame } = sample.trim;
  const hasPendingTrim = startFrame > 0 || endFrame < sample.frameCount;
  const windowStartPercent = sample.frameCount <= 0 ? 0 : (startFrame / sample.frameCount) * 100;
  const windowEndPercent = sample.frameCount <= 0 ? 100 : (endFrame / sample.frameCount) * 100;

  return (
    <section aria-labelledby="sample-deck-editor" className="flex flex-col gap-5 border-t border-line pt-5 @2xl:border-t-0 @2xl:border-l @2xl:pt-0 @2xl:pl-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2
            id="sample-deck-editor"
            title={sample.name}
            className="line-clamp-2 font-screen text-[24px] leading-[0.95] font-normal [overflow-wrap:anywhere] text-ink"
          >
            {sample.name}
          </h2>
          <span className="shrink-0 font-screen text-[20px] leading-none text-ink-muted">
            {formatSeconds(getDurationMs(sample, trimmedFrameCount))}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isBusy || isRecording}
          onClick={() => {
            void onPreviewSample();
          }}
        >
          <Play aria-hidden="true" />
          Preview clip
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-screen text-[24px] leading-none font-normal text-ink">Trim</h3>
        <div>
          <div className="glass-well relative h-[78px] overflow-hidden rounded-[6px] py-[3px] ring-1 ring-black/80">
            <WaveformCanvas
              ariaLabel={`${sample.name} waveform, frames ${startFrame} to ${endFrame} play`}
              samples={waveform}
              className="block h-full w-full"
              {...pcmTraceColors}
            />
            {windowStartPercent > 0 ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 border-r-2 border-beam bg-glass/70"
                style={{ width: `${windowStartPercent}%` }}
              />
            ) : null}
            {windowEndPercent < 100 ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 border-l-2 border-beam bg-glass/70"
                style={{ width: `${100 - windowEndPercent}%` }}
              />
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted tabular-nums">
            {`Frames ${formatFrames(startFrame)} to ${formatFrames(endFrame)} of ${formatFrames(sample.frameCount)}`}
          </p>
        </div>
        <SampleTrimControl
          disabled={isRecording}
          label="Start"
          sliderLabel="Trim start"
          max={Math.max(0, sample.frameCount - trimmedFrameCount)}
          onChange={onMoveTrimWindow}
          value={startFrame}
        />
        <SampleTrimControl
          disabled={isRecording}
          label="Length"
          sliderLabel="Trim length"
          max={sample.frameCount}
          onChange={onResizeTrimWindow}
          value={trimmedFrameCount}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-snug text-ink-muted">
            {hasPendingTrim ? "Keeps only the highlighted part. This can't be undone." : "The whole clip plays."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!hasPendingTrim || isRecording || isBusy}
            data-agent-confirm={`Cuts ${sample.name} down to frames ${startFrame} to ${endFrame} for good`}
            onClick={onApplyTrim}
          >
            Apply trim
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-screen text-[24px] leading-none font-normal text-ink">Pitch</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">Base note</span>
          <div className="w-24">
            <NotePicker
              accentColor="var(--voice-sample)"
              ariaLabel="Sample base note"
              disabled={isRecording}
              selectedNote={sample.baseNote}
              onSelectNote={(note) => {
                onSetSampleBaseNote(note);
              }}
            />
          </div>
          {sample.detectedBaseNote === null ? (
            <span className="text-xs text-ink-muted">No stable note detected</span>
          ) : sample.detectedBaseNote === sample.baseNote ? (
            <span className="text-xs text-ink-muted">Matches the suggested note</span>
          ) : (
            <Button
              variant="outline"
              size="xs"
              disabled={isRecording}
              onClick={() => {
                onSetSampleBaseNote(sample.detectedBaseNote ?? sample.baseNote);
              }}
            >
              Use suggested {sample.detectedBaseNote}
            </Button>
          )}
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          {engineMode === "inspired"
            ? "PCM steps transpose the clip from this note."
            : "Authentic mode plays the clip as a one-shot trigger, so the base note only applies in Inspired mode."}
        </p>
      </div>
    </section>
  );
}

function SampleTrimControl({
  disabled,
  label,
  sliderLabel,
  max,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  sliderLabel: string;
  max: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const clampedValue = Math.max(0, Math.min(value, max));
  const isFixed = max <= 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <span className="flex items-center gap-2 text-[13px] text-ink-muted">
          <NumberField
            label={`${label} in frames`}
            min={0}
            max={max}
            step={1}
            disabled={disabled || isFixed}
            value={clampedValue}
            onValueChange={onChange}
            inputClassName="w-16"
          />
          frames
        </span>
      </div>
      <Slider
        className="px-2"
        label={sliderLabel}
        min={0}
        max={Math.max(1, max)}
        step={1}
        disabled={disabled || isFixed}
        value={clampedValue}
        onValueChange={onChange}
      />
    </div>
  );
}

function getRecorderMessage({
  errorMessage,
  permissionState,
  recordingDurationMs,
  status,
}: {
  errorMessage: string | null;
  permissionState: SampleRecorderPermissionState;
  recordingDurationMs: number;
  status: SampleRecorderStatus;
}): RecorderMessage {
  if (permissionState === "unsupported") {
    return { tone: "error", text: "This browser can't record from a microphone. Try a current Chrome, Firefox or Safari." };
  }

  switch (status) {
    case "requesting-permission":
      return { tone: "status", text: "Allow microphone access in the browser prompt to start recording." };
    case "recording":
      return {
        tone: "status",
        text: `Recording ${formatSeconds(recordingDurationMs)} of ${maxRecordingLabel}. It stops by itself at the limit.`,
      };
    case "processing":
      return { tone: "status", text: "Saving the clip…" };
    case "error":
      return { tone: "error", text: errorMessage ?? "Recording failed. Check your microphone and try again." };
  }

  if (permissionState === "denied") {
    return {
      tone: "error",
      text: "Microphone access is blocked. Allow it in your browser's site settings, then press Record.",
    };
  }

  return permissionState === "granted"
    ? { tone: "status", text: `Records up to ${maxRecordingSentence} from your microphone.` }
    : {
        tone: "status",
        text: `Records up to ${maxRecordingSentence} from your microphone. Your browser asks for access first.`,
      };
}

const pcmTraceColors = { glowColor: "var(--voice-sample)", lineColor: "var(--trace-sample)" };

function getDurationMs(sample: SampleAsset, frameCount: number) {
  return sample.sampleRate <= 0 ? 0 : Math.round((frameCount / sample.sampleRate) * 1000);
}

const frameFormat = new Intl.NumberFormat("en-US");

function formatFrames(frameCount: number) {
  return frameFormat.format(frameCount);
}

function formatSeconds(durationMs: number) {
  return `${(Math.max(0, durationMs) / 1000).toFixed(2)}s`;
}
