import { Button, buttonVariants } from "@ochoit/ui/components/button";
import { Field, FieldLabel } from "@ochoit/ui/components/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ochoit/ui/components/menu";
import { NumberField } from "@ochoit/ui/components/number-field";
import { Slider } from "@ochoit/ui/components/slider";
import { Toggle, ToggleGroup } from "@ochoit/ui/components/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ochoit/ui/components/tooltip";
import { cn } from "@ochoit/ui/lib/utils";
import {
  ChevronDown,
  Download,
  FilePlus2,
  FileText,
  Github,
  Import,
  Link,
  ListMusic,
  Play,
  Square,
  Volume2,
} from "lucide-react";
import { SONG_BPM_RANGE, SONG_LOOP_LENGTH_RANGE, type SongEdit } from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";
import { memo, useEffect, useId, useRef, useState } from "react";

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
    <header className="border-b border-black/60 bg-band bg-linear-to-b from-surface-2 to-band pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-band-ink shadow-[0_1px_0_rgb(255_255_255/0.05)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2.5 px-3 py-2.5 md:px-4 xl:gap-x-2.5">
        <div className="flex items-center gap-2 max-md:flex-1">
          <span aria-hidden="true" className="flex h-[22px] gap-0.5">
            {brandStripeClasses.map((stripeClass) => (
              <i key={stripeClass} className={cn("w-[3px] rounded-[1px]", stripeClass)} />
            ))}
          </span>
          <h1 className="font-wordmark text-[17px] leading-none font-bold tracking-[0.02em]">Ochoit</h1>
        </div>
        <BandPlayback
          engineState={props.engineState}
          isPlaying={props.isPlaying}
          onPlay={props.onPlay}
          onStartAudio={props.onStartAudio}
          onStop={props.onStop}
        />
        <ExamplesButton engineState={props.engineState} onOpenExamples={props.onOpenExamples} />
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
  const audioReady = isAudioReady(engineState);

  return (
    <div className="flex flex-wrap items-center gap-1 max-sm:order-1 max-sm:basis-full">
      <Button
        ref={playButtonRef}
        variant="go"
        className={cn("px-4", isPlaying && "translate-y-px shadow-pressed")}
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
        <span className="ml-1 inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-band-muted">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-beam shadow-[0_0_0_2px_#0d0c0f,0_0_8px_2px_rgb(210_230_255/0.75)]"
          />
          Audio on
        </span>
      ) : (
        <>
          <Button
            variant="band"
            size="sm"
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

function isAudioReady(engineState: AudioBootstrapState) {
  return engineState === "running" || engineState === "suspended";
}

const examplesNudgeMs = 3600;

// Pulses once, the first time audio comes on, to point a newcomer at a song they can play straight away.
function useFirstAudioNudge(engineState: AudioBootstrapState) {
  const audioReady = isAudioReady(engineState);
  const [nudging, setNudging] = useState(false);
  const wasReady = useRef(audioReady);

  useEffect(() => {
    if (!audioReady || wasReady.current) {
      return;
    }

    wasReady.current = true;
    setNudging(true);
    const timer = window.setTimeout(() => {
      setNudging(false);
    }, examplesNudgeMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [audioReady]);

  return [nudging, () => setNudging(false)] as const;
}

function ExamplesButton({
  engineState,
  onOpenExamples,
}: Pick<TransportBandProps, "engineState" | "onOpenExamples">) {
  const [nudging, stopNudging] = useFirstAudioNudge(engineState);

  return (
    <Button
      variant="band"
      data-nudge={nudging || undefined}
      className={cn(
        "glass-well glow-text relative border-screen-edge from-transparent to-transparent px-2.5 text-screen-ink hover:border-screen-ink",
        "after:pointer-events-none after:absolute after:-inset-[3px] after:rounded-[8px] after:opacity-0 after:shadow-[0_0_0_2px_var(--screen-ink),0_0_18px_4px_rgb(170_205_255/0.55)] after:transition-opacity after:duration-300 after:ease-snap data-nudge:after:opacity-100",
      )}
      onClick={() => {
        stopNudging();
        onOpenExamples();
      }}
    >
      <ListMusic aria-hidden="true" />
      Examples
    </Button>
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

  // Below xl the mix group takes a row of its own, so the band breaks in planned places, not wherever it runs out.
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2.5 max-sm:order-2 md:max-xl:order-last md:max-xl:basis-full">
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
      <div className="flex items-center gap-2 max-md:min-w-36 max-md:flex-1">
        <Volume2 aria-hidden="true" className="size-4 text-band-muted" />
        <Slider
          label="Master volume"
          className="w-16 max-md:flex-1"
          accent="var(--band-ink)"
          value={masterPercent}
          min={TRACK_VOLUME_PERCENT_RANGE.min}
          max={TRACK_VOLUME_PERCENT_RANGE.max}
          step={TRACK_VOLUME_PERCENT_RANGE.step}
          onValueChange={(percent) => {
            onEdit({ type: "set-master-volume", volume: percent / 100 });
          }}
        />
        <span aria-hidden="true" className="w-8 font-mono text-[12px] font-semibold text-band-ink">
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
          text="Ruler"
          tooltip="Show the pattern header, step ruler and keyboard note labels"
        />
        <ViewToggle
          value="hover-preview"
          label="Sequencer hover preview"
          text="Preview"
          tooltip="Play a step's sound when you point at it"
        />
        <ViewToggle
          value="lo-fi"
          label="Lo-fi speaker filter"
          text="Lo-fi"
          tooltip="Sound like a small old TV speaker"
        />
      </ToggleGroup>
    </div>
  );
}

// The lit LED, not only the pressed shading, says the option is on.
function ViewToggle({
  value,
  label,
  text,
  tooltip,
}: {
  value: ViewOption;
  label: string;
  text: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle value={value} variant="band" size="sm" aria-label={label} className="group gap-1.5 px-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-band-raised-lo shadow-[inset_0_0_0_1px_var(--band-edge)] group-data-pressed:bg-beam group-data-pressed:shadow-[0_0_0_2px_#0d0c0f,0_0_8px_2px_rgb(210_230_255/0.75)]"
            />
            {text}
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
    <Field className="flex-row items-center gap-1">
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
  onOpenSongText,
}: Pick<
  TransportBandProps,
  "onCopyShareLink" | "onDownloadWav" | "onLoadSongFromLink" | "onNewSong" | "onOpenSongText"
>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-sm:order-3 md:ml-auto">
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
          <span className="max-[1440px]:sr-only">Download WAV</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Download WAV</TooltipContent>
      </Tooltip>
      <Tooltip type="label">
        <TooltipTrigger render={<Button variant="band" size="sm" onClick={onNewSong} />}>
          <FilePlus2 aria-hidden="true" />
          <span className="max-[1440px]:sr-only">New song</span>
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
