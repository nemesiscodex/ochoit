import { Button } from "@ochoit/ui/components/button";
import { Slider } from "@ochoit/ui/components/slider";
import { Toggle } from "@ochoit/ui/components/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ochoit/ui/components/tooltip";
import { cn } from "@ochoit/ui/lib/utils";
import { Circle, FileText, Volume2, VolumeX } from "lucide-react";
import type { SongDocument, SongEdit, Track, TrackId } from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";
import { memo, useCallback } from "react";

import type { PlayheadStore } from "@/features/audio/playhead-store";
import { previewWaveformByTrackId } from "@/features/audio/waveform-data";
import type { RecordTrackId } from "@/features/sequencer/quantized-recorder";
import type { StepDrag } from "@/features/sequencer/step-drag";
import { TRACK_VOLUME_PERCENT_RANGE, toTrackVolumePercent } from "@/features/song/song-mixer";
import {
  labelByTrackId,
  voiceStyle,
  waveformGlowColorByTrackId,
  waveformLineColorByTrackId,
} from "@/components/sequencer-theme";
import { StepDetailPanel } from "@/components/step-detail-panel";
import { TrackWaveformCanvas } from "@/components/waveform-canvas";
import { laneColumnsClass } from "@/components/sequencer/grid-geometry";
import type { RowAction } from "@/components/sequencer/row-action";
import { CompactStepGrid } from "@/components/sequencer/step-grid";

export const VoiceLane = memo(function VoiceLane({
  dragState,
  engine,
  engineMode,
  isPlaying,
  isRecording,
  onEdit,
  onOpenArrangementEditor,
  onRowAction,
  playhead,
  recordTrackId,
  samples,
  selectedStepIndex,
  selectedStepIndexes,
  stepDurationMs,
  track,
}: {
  dragState: StepDrag | null;
  engine: AudioEngine | null;
  engineMode: SongDocument["meta"]["engineMode"];
  isPlaying: boolean;
  isRecording: boolean;
  onEdit: (edit: SongEdit) => void;
  onOpenArrangementEditor: (trackId: TrackId) => void;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  recordTrackId: RecordTrackId | null;
  samples: SongDocument["samples"];
  selectedStepIndex: number | null;
  selectedStepIndexes: readonly number[];
  stepDurationMs: number;
  track: Track;
}) {
  const deselect = useCallback(() => {
    onRowAction({ type: "deselect" });
  }, [onRowAction]);

  return (
    <div
      data-voice-lane={track.id}
      className={cn("grid py-[5px]", laneColumnsClass, isRecording && "bg-signal/5 inset-ring-2 inset-ring-signal")}
      style={voiceStyle(track.id)}
    >
      <LaneHead
        engine={engine}
        isRecording={isRecording}
        muted={track.muted}
        onEdit={onEdit}
        onOpenArrangementEditor={onOpenArrangementEditor}
        onRowAction={onRowAction}
        recordTrackId={recordTrackId}
        trackId={track.id}
        volume={track.volume}
      />
      <div className="flex min-w-0 flex-col py-1 max-lg:pt-1.5">
        <CompactStepGrid
          dragState={dragState}
          engineMode={engineMode}
          isPlaying={isPlaying}
          onRowAction={onRowAction}
          playhead={playhead}
          samples={samples}
          selectedStepIndexes={selectedStepIndexes}
          track={track}
        />
        {selectedStepIndex !== null ? (
          <StepDetailPanel
            engine={engine}
            engineMode={engineMode}
            onDeselect={deselect}
            onEdit={onEdit}
            samples={samples}
            stepDurationMs={stepDurationMs}
            stepIndex={selectedStepIndex}
            track={track}
          />
        ) : null}
      </div>
    </div>
  );
});

// Reads only the track's mixer fields, so step edits, selection and drags skip it.
const LaneHead = memo(function LaneHead({
  engine,
  isRecording,
  muted,
  onEdit,
  onOpenArrangementEditor,
  onRowAction,
  recordTrackId,
  trackId,
  volume,
}: {
  engine: AudioEngine | null;
  isRecording: boolean;
  muted: boolean;
  onEdit: (edit: SongEdit) => void;
  onOpenArrangementEditor: (trackId: TrackId) => void;
  onRowAction: (action: RowAction) => void;
  recordTrackId: RecordTrackId | null;
  trackId: TrackId;
  volume: number;
}) {
  const label = labelByTrackId[trackId];
  const volumePercent = toTrackVolumePercent(volume);

  return (
    <div className="flex min-w-0 flex-col gap-1 pt-1 lg:pr-3">
      <div className="flex items-center gap-[5px]">
        <h3 className="mr-auto min-w-0 truncate font-screen text-[27px] leading-[0.9] font-normal text-(--voice) [text-shadow:0_0_9px_color-mix(in_srgb,var(--voice)_70%,transparent)]">
          {label}
        </h3>
        <Toggle
          variant="screen"
          size="icon-xs"
          className="h-[26px] w-7"
          aria-label={`${muted ? "Unmute" : "Mute"} ${label}`}
          pressed={muted}
          onPressedChange={() => {
            onEdit({ type: "toggle-track-mute", trackId });
          }}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </Toggle>
        {recordTrackId !== null ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  variant="signal"
                  size="icon-xs"
                  className="h-[26px] w-7"
                  aria-label={`${isRecording ? "Stop recording" : "Record"} ${label}`}
                  pressed={isRecording}
                  onPressedChange={() => {
                    onRowAction({ type: "toggle-recording", trackId: recordTrackId });
                  }}
                />
              }
            >
              <Circle aria-hidden="true" className={cn(isRecording && "fill-current")} />
            </TooltipTrigger>
            <TooltipContent side="top">
              {isRecording ? `Stop recording ${label}` : `Record ${label} from step 1 with the keyboard`}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="graticule relative h-10 overflow-hidden rounded-[4px] lg:h-auto lg:max-h-16 lg:min-h-5 lg:flex-1">
        <TrackWaveformCanvas
          ariaLabel={`${label} waveform`}
          className="absolute inset-x-0 top-1 h-[calc(100%-0.5rem)]"
          engine={engine}
          fallbackWaveform={previewWaveformByTrackId[trackId]}
          glowColor={waveformGlowColorByTrackId[trackId]}
          lineColor={waveformLineColorByTrackId[trackId]}
          trackId={trackId}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", muted && "opacity-60")}>
          <Slider
            look="glow"
            accent="var(--voice)"
            className="min-w-12 flex-1"
            label={`${label} volume`}
            min={TRACK_VOLUME_PERCENT_RANGE.min}
            max={TRACK_VOLUME_PERCENT_RANGE.max}
            step={TRACK_VOLUME_PERCENT_RANGE.step}
            value={volumePercent}
            onValueChange={(next) => {
              onEdit({ type: "set-track-volume", trackId, volume: next / TRACK_VOLUME_PERCENT_RANGE.max });
            }}
          />
          <span className="w-9 shrink-0 font-mono text-[12px] leading-none font-semibold text-ink-muted">{volumePercent}%</span>
        </div>
        <Button
          variant="screen"
          size="xs"
          className="h-[26px] text-[13px]"
          aria-label={`Edit ${label} arrangement as text`}
          onClick={() => {
            onOpenArrangementEditor(trackId);
          }}
        >
          <FileText aria-hidden="true" />
          Edit as text
        </Button>
      </div>
    </div>
  );
});
