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
} from "lucide-react";
import { SONG_BPM_RANGE, SONG_LOOP_LENGTH_RANGE, type SongEdit } from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";
import { memo, useId, useRef, useState, type ReactNode } from "react";

import type { AudioBootstrapState } from "@/features/audio/use-audio-engine";
import { TRACK_VOLUME_PERCENT_RANGE, toTrackVolumePercent } from "@/features/song/song-mixer";

const repositoryUrl = "https://github.com/nemesiscodex/ochoit";
const numberFormat = { useGrouping: false } satisfies Intl.NumberFormatOptions;
const brandStripeClasses = [
  "bg-voice-pulse1 shadow-[0_0_6px_var(--voice-pulse1)]",
  "bg-voice-pulse2 shadow-[0_0_6px_var(--voice-pulse2)]",
  "bg-voice-triangle shadow-[0_0_6px_var(--voice-triangle)]",
  "bg-voice-noise shadow-[0_0_6px_var(--voice-noise)]",
  "bg-voice-sample shadow-[0_0_6px_var(--voice-sample)]",
];

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
    <header className="border-b border-black/60 bg-band bg-linear-to-b from-surface-2 to-band text-band-ink shadow-[0_1px_0_rgb(255_255_255/0.05)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2 max-md:flex-1">
          <span aria-hidden="true" className="flex h-[22px] gap-0.5">
            {brandStripeClasses.map((stripeClass) => (
              <i key={stripeClass} className={cn("w-[3px] rounded-[1px]", stripeClass)} />
            ))}
          </span>
          <h1 className="font-wordmark text-[19px] leading-none font-bold tracking-[0.02em]">Ochoit</h1>
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
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        ref={playButtonRef}
        variant={isPlaying ? "primary" : "band"}
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
        <span className="ml-1 inline-flex items-center gap-2 text-sm whitespace-nowrap text-band-muted">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-beam shadow-[0_0_0_2px_#0d0c0f,0_0_8px_2px_rgb(210_230_255/0.75)]"
          />
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
          <p id={audioNoteId} className="sr-only">
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 md:border-l md:border-line md:pl-3">
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
      <div className="flex items-center gap-2.5 max-md:w-full">
        <span aria-hidden="true" className="text-[13.5px] text-band-muted">
          Master
        </span>
        <Slider
          label="Master volume"
          className="w-24 max-md:flex-1"
          accent="var(--band-ink)"
          value={masterPercent}
          min={TRACK_VOLUME_PERCENT_RANGE.min}
          max={TRACK_VOLUME_PERCENT_RANGE.max}
          step={TRACK_VOLUME_PERCENT_RANGE.step}
          onValueChange={(percent) => {
            onEdit({ type: "set-master-volume", volume: percent / 100 });
          }}
        />
        <span
          aria-hidden="true"
          className="glass-well glow-text inline-flex h-8 w-[52px] items-center justify-center rounded-control border border-band-edge font-screen text-[22px] leading-none"
        >
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
        <ViewToggle
          value="ruler"
          label="Sequencer ruler"
          tooltip="Show the step ruler and keyboard note labels"
          icon={<Ruler />}
        />
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
    <Field className="flex-row items-center gap-1.5">
      <FieldLabel className="text-[13.5px] font-normal text-band-muted">{label}</FieldLabel>
      <NumberField
        label={label}
        tone="band"
        format={numberFormat}
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        onKeyDown={(event) => {
          // Enter commits on keydown; its keypress would then press the first button of a confirm dialog the commit opens.
          if (event.key === "Enter") event.preventDefault();
        }}
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
    <div className="flex flex-wrap items-center gap-1.5 xl:ml-auto">
      <Button variant="band" size="sm" onClick={onOpenExamples}>
        <ListMusic aria-hidden="true" />
        Examples
      </Button>
      <Menu>
        <MenuTrigger render={<Button variant="band" size="sm" />}>
          <Link aria-hidden="true" />
          Share
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
      <Tooltip type="label">
        <TooltipTrigger
          render={<Button variant="band" size="sm" pendingAnnouncement="Preparing WAV" onClick={onDownloadWav} />}
        >
          <Download aria-hidden="true" />
          <span className="max-2xl:sr-only">Download WAV</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Download WAV</TooltipContent>
      </Tooltip>
      <Tooltip type="label">
        <TooltipTrigger render={<Button variant="band" size="sm" onClick={onNewSong} />}>
          <FilePlus2 aria-hidden="true" />
          <span className="max-2xl:sr-only">New song</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">New song</TooltipContent>
      </Tooltip>
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
