import { Button, buttonVariants } from "@ochoit/ui/components/button";
import { Field, FieldLabel } from "@ochoit/ui/components/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ochoit/ui/components/menu";
import { NumberField } from "@ochoit/ui/components/number-field";
import { Slider } from "@ochoit/ui/components/slider";
import { Toggle, ToggleGroup, ToggleIcon } from "@ochoit/ui/components/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ochoit/ui/components/tooltip";
import { cn } from "@ochoit/ui/lib/utils";
import {
  ChevronDown,
  Download,
  FilePlus2,
  FileText,
  Github,
  Headphones,
  Import,
  Link,
  ListMusic,
  Play,
  Ruler,
  Square,
  Tv,
  Volume2,
} from "lucide-react";
import { SONG_BPM_RANGE, SONG_LOOP_LENGTH_RANGE, type SongEdit } from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";
import { memo, useId, useRef, useState, type ReactNode } from "react";

import type { AudioBootstrapState } from "@/features/audio/use-audio-engine";
import { TRACK_VOLUME_PERCENT_RANGE, toTrackVolumePercent } from "@/features/song/song-mixer";

const repositoryUrl = "https://github.com/nemesiscodex/ochoit";
const numberFormat = { useGrouping: false } satisfies Intl.NumberFormatOptions;

type ViewOption = "ruler" | "hover-preview" | "lo-fi";

type TransportBandProps = {
  bpm: number;
  loopLength: number;
  masterVolume: number;
  oldSpeakerMode: boolean;
  engineState: AudioBootstrapState;
  isPlaying: boolean;
  rulerVisible: boolean;
  hoverPreviewEnabled: boolean;
  onPlay: () => Promise<void>;
  onStop: () => void;
  onStartAudio: () => Promise<AudioEngine | null>;
  onEdit: (edit: SongEdit) => void;
  onRulerVisibleChange: (visible: boolean) => void;
  onHoverPreviewChange: (enabled: boolean) => void;
  onOpenExamples: () => void;
  onCopyShareLink: () => Promise<void>;
  onLoadSongFromLink: () => void;
  onOpenSongText: () => void;
  onDownloadWav: () => Promise<void>;
  onNewSong: () => void;
};

export const TransportBand = memo(function TransportBand(props: TransportBandProps) {
  return (
    <header className="bg-band text-band-ink">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/ochoit-logo.png" alt="" width={28} height={28} className="size-7 rounded-[5px] object-contain" />
          <h1 className="font-wide text-lg leading-none font-bold">Ochoit</h1>
        </div>
        <BandPlayback
          engineState={props.engineState}
          isPlaying={props.isPlaying}
          onPlay={props.onPlay}
          onStartAudio={props.onStartAudio}
          onStop={props.onStop}
        />
        <BandMix
          bpm={props.bpm}
          hoverPreviewEnabled={props.hoverPreviewEnabled}
          loopLength={props.loopLength}
          masterVolume={props.masterVolume}
          oldSpeakerMode={props.oldSpeakerMode}
          rulerVisible={props.rulerVisible}
          onEdit={props.onEdit}
          onHoverPreviewChange={props.onHoverPreviewChange}
          onRulerVisibleChange={props.onRulerVisibleChange}
        />
        <BandActions
          onCopyShareLink={props.onCopyShareLink}
          onDownloadWav={props.onDownloadWav}
          onLoadSongFromLink={props.onLoadSongFromLink}
          onNewSong={props.onNewSong}
          onOpenExamples={props.onOpenExamples}
          onOpenSongText={props.onOpenSongText}
        />
      </div>
    </header>
  );
});

function BandPlayback({
  engineState,
  isPlaying,
  onPlay,
  onStartAudio,
  onStop,
}: Pick<TransportBandProps, "engineState" | "isPlaying" | "onPlay" | "onStartAudio" | "onStop">) {
  const audioNoteId = useId();
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const audioReady = engineState === "running" || engineState === "suspended";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        ref={playButtonRef}
        variant={isPlaying ? "primary" : "band"}
        data-playing={isPlaying ? "" : undefined}
        onClick={() => {
          void onPlay();
        }}
      >
        <Play aria-hidden="true" className={cn(isPlaying && "fill-current")} />
        Play
      </Button>
      <Button
        variant="band"
        disabled={!isPlaying}
        focusableWhenDisabled
        onClick={() => {
          onStop();
        }}
      >
        <Square aria-hidden="true" />
        Stop
      </Button>
      {audioReady ? (
        <span className="ml-1 inline-flex items-center gap-1.5 text-[13px] text-band-muted">
          <Volume2 aria-hidden="true" className="size-4" />
          Audio on
        </span>
      ) : (
        <>
          <Button
            variant="primary"
            aria-describedby={audioNoteId}
            pendingAnnouncement="Starting audio"
            onClick={async () => {
              const engine = await onStartAudio();

              if (engine !== null) {
                playButtonRef.current?.focus();
              }
            }}
          >
            Start audio
          </Button>
          <p id={audioNoteId} className="max-w-[24ch] text-[13px] leading-snug text-band-muted">
            Browsers need one click before they play sound.
          </p>
        </>
      )}
    </div>
  );
}

function BandMix({
  bpm,
  hoverPreviewEnabled,
  loopLength,
  masterVolume,
  oldSpeakerMode,
  rulerVisible,
  onEdit,
  onHoverPreviewChange,
  onRulerVisibleChange,
}: Pick<
  TransportBandProps,
  | "bpm"
  | "hoverPreviewEnabled"
  | "loopLength"
  | "masterVolume"
  | "oldSpeakerMode"
  | "rulerVisible"
  | "onEdit"
  | "onHoverPreviewChange"
  | "onRulerVisibleChange"
>) {
  const masterPercent = toTrackVolumePercent(masterVolume);
  const viewOptions: ViewOption[] = [
    ...(rulerVisible ? (["ruler"] as const) : []),
    ...(hoverPreviewEnabled ? (["hover-preview"] as const) : []),
    ...(oldSpeakerMode ? (["lo-fi"] as const) : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <BandNumberField
        label="Tempo"
        value={bpm}
        min={SONG_BPM_RANGE.min}
        max={SONG_BPM_RANGE.max}
        step={1}
        onCommit={(nextBpm) => {
          onEdit({ type: "set-bpm", bpm: nextBpm });
        }}
      />
      <BandNumberField
        label="Steps"
        value={loopLength}
        min={SONG_LOOP_LENGTH_RANGE.min}
        max={SONG_LOOP_LENGTH_RANGE.max}
        step={SONG_LOOP_LENGTH_RANGE.step}
        onCommit={(nextLoopLength) => {
          onEdit({ type: "set-loop-length", loopLength: nextLoopLength });
        }}
      />
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="text-[13px] font-medium text-band-muted">
          Master
        </span>
        <Slider
          label="Master volume"
          className="w-24 [&_[data-slot=slider-track]]:bg-band-muted/45"
          accent="var(--band-ink)"
          thumbClassName="bg-band"
          value={masterPercent}
          min={TRACK_VOLUME_PERCENT_RANGE.min}
          max={TRACK_VOLUME_PERCENT_RANGE.max}
          step={TRACK_VOLUME_PERCENT_RANGE.step}
          onValueChange={(percent) => {
            onEdit({ type: "set-master-volume", volume: percent / 100 });
          }}
        />
        <span aria-hidden="true" className="w-9 text-right text-[13px] text-band-muted tabular-nums">
          {masterPercent}%
        </span>
      </div>
      <ToggleGroup
        multiple
        aria-label="Sequencer view and sound"
        value={viewOptions}
        onValueChange={(nextOptions) => {
          const next = new Set<string>(nextOptions);

          if (next.has("ruler") !== rulerVisible) onRulerVisibleChange(next.has("ruler"));
          if (next.has("hover-preview") !== hoverPreviewEnabled) onHoverPreviewChange(next.has("hover-preview"));
          if (next.has("lo-fi") !== oldSpeakerMode) onEdit({ type: "set-old-speaker-mode", enabled: next.has("lo-fi") });
        }}
      >
        <ViewToggle value="ruler" label="Sequencer ruler" tooltip="Show the step ruler and keyboard note labels" icon={<Ruler />}/>
        <ViewToggle
          value="hover-preview"
          label="Sequencer hover preview"
          tooltip="Play a step's sound when you point at it"
          icon={<Headphones />}
        />
        <ViewToggle
          value="lo-fi"
          label="Lo-fi speaker filter"
          tooltip="Sound like a small old TV speaker"
          icon={<Tv />}
        />
      </ToggleGroup>
    </div>
  );
}

function ViewToggle({
  value,
  label,
  tooltip,
  icon,
}: {
  value: ViewOption;
  label: string;
  tooltip: string;
  icon: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle value={value} variant="band" size="icon-sm" aria-label={label}>
            <ToggleIcon>{icon}</ToggleIcon>
          </Toggle>
        }
      />
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// Edits commit on Enter, blur or a released step key so a half-typed value never reaches the song.
function BandNumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);

  return (
    <Field className="flex-row items-center gap-2">
      <FieldLabel className="text-band-muted">{label}</FieldLabel>
      <NumberField
        label={label}
        tone="band"
        format={numberFormat}
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        onValueChange={setDraft}
        onValueCommit={(committed) => {
          setDraft(null);

          if (committed !== null) onCommit(committed);
        }}
      />
    </Field>
  );
}

function BandActions({
  onCopyShareLink,
  onDownloadWav,
  onLoadSongFromLink,
  onNewSong,
  onOpenExamples,
  onOpenSongText,
}: Pick<
  TransportBandProps,
  "onCopyShareLink" | "onDownloadWav" | "onLoadSongFromLink" | "onNewSong" | "onOpenExamples" | "onOpenSongText"
>) {
  return (
    <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
      <Button variant="band" size="sm" onClick={onOpenExamples}>
        <ListMusic aria-hidden="true" />
        <span className="max-sm:sr-only">Examples</span>
      </Button>
      <Menu>
        <MenuTrigger render={<Button variant="band" size="sm" />}>
          <Link aria-hidden="true" />
          <span className="max-sm:sr-only">Share</span>
          <ChevronDown aria-hidden="true" className="size-3.5 text-band-muted" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => onCopyShareLink()}>
            <Link aria-hidden="true" />
            Copy share link
          </MenuItem>
          <MenuItem onSelect={onLoadSongFromLink}>
            <Import aria-hidden="true" />
            Load song from link
          </MenuItem>
          <MenuItem onSelect={onOpenSongText}>
            <FileText aria-hidden="true" />
            Edit song as text
          </MenuItem>
        </MenuContent>
      </Menu>
      <Button variant="band" size="sm" pendingAnnouncement="Preparing WAV" onClick={onDownloadWav}>
        <Download aria-hidden="true" />
        <span className="max-sm:sr-only">Download WAV</span>
      </Button>
      <Button variant="band" size="sm" onClick={onNewSong}>
        <FilePlus2 aria-hidden="true" />
        <span className="max-sm:sr-only">New song</span>
      </Button>
      <a
        href={repositoryUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open GitHub repository"
        className={buttonVariants({ variant: "band", size: "icon-sm" })}
      >
        <Github aria-hidden="true" />
      </a>
    </div>
  );
}
