import { Input } from "@ochoit/ui/components/input";
import { Button } from "@ochoit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ochoit/ui/components/card";
import { cn } from "@ochoit/ui/lib/utils";
import {
  Activity,
  AudioWaveform,
  Gauge,
  Minus,
  Mic,
  Play,
  Plus,
  Save,
  Square,
} from "lucide-react";
import { useState } from "react";

import { useAudioEngine, type AudioBootstrapState } from "@/features/audio/use-audio-engine";
import {
  createDefaultSongDocument,
  getOrderedTracks,
  type SongDocument,
  type Track,
  type TrackId,
} from "@/features/song/song-document";
import {
  resolveSongBpmInput,
  resolveSongLoopLengthInput,
  SONG_BPM_RANGE,
  SONG_LOOP_LENGTH_RANGE,
  updateSongTransport,
} from "@/features/song/song-transport";

const waveformPreviewByTrackId: Record<TrackId, number[]> = {
  pulse1: [18, 18, 18, 7, 7, 18, 18, 18, 7, 7, 18, 18],
  pulse2: [16, 16, 8, 8, 16, 16, 8, 8, 16, 16, 8, 8],
  triangle: [4, 8, 12, 16, 20, 16, 12, 8, 4, 8, 12, 16],
  noise: [5, 16, 8, 20, 7, 14, 11, 19, 6, 17, 9, 15],
  sample: [3, 9, 18, 13, 7, 17, 10, 5, 14, 8, 12, 4],
};

const accentByTrackId: Record<TrackId, string> = {
  pulse1: "border-[#ffd166]/45 bg-[#ffd166]/10 text-[#ffd166]",
  pulse2: "border-[#8bd3ff]/45 bg-[#8bd3ff]/10 text-[#8bd3ff]",
  triangle: "border-[#7ae582]/45 bg-[#7ae582]/10 text-[#7ae582]",
  noise: "border-[#ff8c69]/45 bg-[#ff8c69]/10 text-[#ff8c69]",
  sample: "border-[#ff70a6]/45 bg-[#ff70a6]/10 text-[#ff70a6]",
};

const labelByTrackId: Record<TrackId, string> = {
  pulse1: "Pulse I",
  pulse2: "Pulse II",
  triangle: "Triangle",
  noise: "Noise",
  sample: "PCM",
};

export function WorkstationShell() {
  const [song, setSong] = useState(() => createDefaultSongDocument());
  const tracks = getOrderedTracks(song);
  const { engineState, errorMessage, initializeAudio, startTransport, stopTransport, transportState } =
    useAudioEngine(song);
  const audioReady = engineState === "running" || engineState === "suspended";

  return (
    <main className="min-h-full overflow-auto bg-[#050816] text-white">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,209,102,0.16),_transparent_28%),radial-gradient(circle_at_85%_12%,_rgba(74,222,255,0.14),_transparent_24%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0))]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />

        <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-5 md:px-6 lg:px-8">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <Card className="border-white/10 bg-[#091022]/85 backdrop-blur">
              <CardHeader className="gap-4 border-b border-white/10 pb-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-cyan-200/80">
                      8-Bit Music System / NES-Inspired
                    </p>
                    <div className="space-y-2">
                      <h1 className="font-mono text-3xl uppercase tracking-[0.2em] text-white md:text-4xl">
                        Ochoit Workstation
                      </h1>
                      <p className="max-w-3xl text-sm text-slate-300">
                        A five-voice browser sequencer with pulse, triangle, noise, and PCM lanes.
                        Pulse voice 1 and the transport are live, while the editor rows are still being
                        connected to real sequencing data.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-300 sm:grid-cols-4">
                    <Metric label="Mode" value={song.meta.engineMode} />
                    <Metric label="Tempo" value={`${song.transport.bpm} bpm`} />
                    <Metric label="Loop" value={`${song.transport.loopLength} steps`} />
                    <Metric label="Voices" value={`${tracks.length}`} />
                    <Metric label="Audio" value={engineState} />
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <TransportStrip
                    song={song}
                    engineState={engineState}
                    startTransport={startTransport}
                    stopTransport={stopTransport}
                    playbackState={transportState.playbackState}
                    onBpmChange={(nextBpm) => {
                      setSong((currentSong) => updateSongTransport(currentSong, { bpm: nextBpm }));
                    }}
                    onLoopLengthChange={(nextLoopLength) => {
                      setSong((currentSong) => updateSongTransport(currentSong, { loopLength: nextLoopLength }));
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                      <Save className="size-4" />
                      Save
                    </Button>
                    <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                      Load
                    </Button>
                    <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                      Export
                    </Button>
                    <Button
                        className="bg-[#ffd166] text-[#091022] hover:bg-[#ffe09b]"
                        onClick={() => {
                          void initializeAudio();
                      }}
                    >
                      {engineState === "initializing" ? "Booting..." : audioReady ? "Resume Audio" : "Start Audio"}
                    </Button>
                  </div>
                </div>

                {errorMessage !== null ? (
                  <div className="rounded-none border border-[#ff8c69]/45 bg-[#ff8c69]/10 px-3 py-2 text-sm text-[#ffd8cb]">
                    {errorMessage}
                  </div>
                ) : null}
              </CardHeader>
            </Card>

            <div className="grid gap-4">
              <Card className="border-white/10 bg-[#091022]/85 backdrop-blur">
                <CardHeader className="border-b border-white/10 pb-4">
                  <CardTitle className="font-mono text-xs uppercase tracking-[0.28em] text-white/85">
                    Sample Deck
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-300">
                  <div className="rounded-none border border-dashed border-[#ff70a6]/45 bg-[#ff70a6]/6 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#ff70a6]">
                          Voice 5 Input
                        </p>
                        <p className="mt-1 text-slate-300">Record 1-2 seconds, trim, then trigger it on the PCM lane.</p>
                      </div>
                      <Mic className="size-5 text-[#ff70a6]" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="bg-[#ff70a6] text-[#091022] hover:bg-[#ff98be]">Record</Button>
                      <Button
                        variant="outline"
                        className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        Preview
                      </Button>
                    </div>
                    <div className="mt-4 rounded-none border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.22em] text-white/65">
                        <span>Trim Window</span>
                        <span>{song.samples[0]?.name ?? "No Sample"}</span>
                      </div>
                      <div className="flex h-14 items-end gap-1">
                        {waveformPreviewByTrackId.sample.map((height, index) => (
                          <span
                            key={`${index}-pcm`}
                            className="flex-1 bg-[#ff70a6]/65"
                            style={{ height: `${height * 2.2}px` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <SidebarPanel
                      icon={AudioWaveform}
                      title="Storage Format"
                      body="Versioned JSON document with song metadata, transport state, fixed tracks, and serialized mono PCM sample data."
                    />
                    <SidebarPanel
                      icon={Gauge}
                      title="Next Engine Step"
                      body="Route analyser taps per voice so each row can replace the placeholder waveform with live capture."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-[#091022]/85 backdrop-blur">
                <CardHeader className="border-b border-white/10 pb-4">
                  <CardTitle className="font-mono text-xs uppercase tracking-[0.28em] text-white/85">
                    Screen Architecture
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-slate-300">
                  <ArchitectureItem title="Top strip" description="Transport, session status, save/load, and audio initialization." />
                  <ArchitectureItem title="Main editor" description="Five stacked voice rows with waveform preview, per-track controls, and the 16-step grid." />
                  <ArchitectureItem title="Right rail" description="PCM recorder, trim area, file format notes, and implementation milestones." />
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">
                  Sequencer Matrix
                </p>
                <h2 className="mt-1 font-mono text-xl uppercase tracking-[0.18em] text-white">
                  One Row Per Voice
                </h2>
              </div>
              <div className="rounded-none border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-white/70">
                Waveform canvas, row controls, and step grid live here
              </div>
            </div>

            <div className="grid gap-3">
              {tracks.map((track, index) => (
                <VoiceRow
                  key={track.id}
                  barNumber={index + 1}
                  song={song}
                  track={track}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function TransportStrip({
  song,
  engineState,
  startTransport,
  stopTransport,
  playbackState,
  onBpmChange,
  onLoopLengthChange,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  startTransport: () => Promise<void>;
  stopTransport: () => void;
  playbackState: "stopped" | "playing";
  onBpmChange: (value: number) => void;
  onLoopLengthChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3 rounded-none border border-white/10 bg-black/20 p-3 lg:grid-cols-[auto_minmax(0,220px)_minmax(0,220px)_minmax(0,1fr)] lg:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="bg-[#7ae582] text-[#091022] hover:bg-[#a7f0af]"
          onClick={() => {
            void startTransport();
          }}
        >
          <Play className="size-4" />
          {playbackState === "playing" ? "Playing" : "Play Pattern"}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          disabled={playbackState !== "playing"}
          onClick={() => {
            stopTransport();
          }}
        >
          <Square className="size-4" />
          Stop
        </Button>
      </div>

      <TransportField
        label="BPM"
        value={song.transport.bpm}
        min={SONG_BPM_RANGE.min}
        max={SONG_BPM_RANGE.max}
        step={1}
        accentClassName="border-[#ffd166]/40 bg-[#ffd166]/8 text-[#ffd166]"
        valueSuffix="beats/min"
        onChange={onBpmChange}
        parseValue={(rawValue) => resolveSongBpmInput(rawValue, song.transport.bpm)}
      />

      <TransportField
        label="Loop Length"
        value={song.transport.loopLength}
        min={SONG_LOOP_LENGTH_RANGE.min}
        max={SONG_LOOP_LENGTH_RANGE.max}
        step={SONG_LOOP_LENGTH_RANGE.step}
        accentClassName="border-[#8bd3ff]/40 bg-[#8bd3ff]/8 text-[#8bd3ff]"
        valueSuffix="steps"
        onChange={onLoopLengthChange}
        parseValue={(rawValue) => resolveSongLoopLengthInput(rawValue, song.transport.loopLength)}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <TransportChip label="Steps / Beat" value={`${song.transport.stepsPerBeat}`} />
        <TransportChip label="Audio" value={engineState} />
        <TransportChip label="Playback" value={playbackState} />
      </div>
    </div>
  );
}

function TransportField({
  label,
  value,
  min,
  max,
  step,
  valueSuffix,
  accentClassName,
  onChange,
  parseValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueSuffix: string;
  accentClassName: string;
  onChange: (value: number) => void;
  parseValue: (rawValue: string) => number;
}) {
  const inputId = `transport-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={cn("rounded-none border p-2", accentClassName)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/80">
          {label}
        </label>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
          {min}-{max}
        </span>
      </div>

      <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-none border-white/10 bg-black/25 px-0 text-white hover:bg-white/10"
          aria-label={`Decrease ${label}`}
          onClick={() => {
            onChange(value - step);
          }}
        >
          <Minus className="size-4" />
        </Button>

        <div className="rounded-none border border-white/10 bg-[#050816]/85 px-2 py-2">
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            className="h-7 border-0 bg-transparent px-0 text-center font-mono text-base uppercase tracking-[0.18em] text-white focus-visible:ring-0"
            onChange={(event) => {
              onChange(parseValue(event.currentTarget.value));
            }}
          />
          <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            {valueSuffix}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-none border-white/10 bg-black/25 px-0 text-white hover:bg-white/10"
          aria-label={`Increase ${label}`}
          onClick={() => {
            onChange(value + step);
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function VoiceRow({
  barNumber,
  song,
  track,
}: {
  barNumber: number;
  song: SongDocument;
  track: Track;
}) {
  const accentClassName = accentByTrackId[track.id];
  const waveformHeights = waveformPreviewByTrackId[track.id];

  return (
    <Card className="border-white/10 bg-[#091022]/85 backdrop-blur">
      <CardContent className="grid gap-3 px-0 py-0 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="border-b border-white/10 p-4 lg:border-r lg:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/60">
                Row {barNumber.toString().padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-mono text-lg uppercase tracking-[0.16em] text-white">
                {labelByTrackId[track.id]}
              </h3>
            </div>
            <span className={cn("rounded-none border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em]", accentClassName)}>
              {track.kind}
            </span>
          </div>

          <p className="mt-3 text-sm text-slate-300">{getTrackSummary(track)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {getTrackControls(track).map((control) => (
              <span
                key={control}
                className={cn(
                  "rounded-none border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em]",
                  accentClassName,
                )}
              >
                {control}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] uppercase tracking-[0.2em] text-white/65">
            <MiniStat label="Track Vol" value={`${Math.round(track.volume * 100)}%`} />
            <MiniStat label="Muted" value={track.muted ? "yes" : "no"} />
            <MiniStat label="Sample" value={track.id === "sample" ? `${song.samples.length}` : "n/a"} />
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-none border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-white/65">
                <span>Waveform</span>
                <Activity className="size-4 text-cyan-200" />
              </div>
              <div className="flex h-20 items-center gap-1">
                {waveformHeights.map((height, index) => (
                  <span
                    key={`${track.id}-wave-${index}`}
                    className={cn("flex-1 rounded-none", accentClassName)}
                    style={{ height: `${height * 2}px` }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-none border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-white/65">
                <span>Step Grid</span>
                <span>{song.transport.loopLength} steps</span>
              </div>
              <div className="grid grid-cols-8 gap-2 md:grid-cols-16">
                {track.steps.map((step, index) => (
                  <div
                    key={`${track.id}-step-${index}`}
                    className={cn(
                      "rounded-none border px-2 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
                      step.enabled
                        ? `${accentClassName} shadow-[0_0_0_1px_rgba(255,255,255,0.03)]`
                        : "border-white/10 bg-white/5 text-white/35",
                    )}
                  >
                    <div className="mb-2 text-[9px] text-white/45">{index + 1}</div>
                    <div className="text-white">{getStepLabel(track, index)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SidebarPanel({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof AudioWaveform;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-none border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-white/75">
        <Icon className="size-4 text-cyan-200" />
        <span>{title}</span>
      </div>
      <p className="text-sm text-slate-300">{body}</p>
    </div>
  );
}

function ArchitectureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-none border border-white/10 bg-black/20 p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">{title}</p>
      <p className="mt-2 text-slate-300">{description}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border border-white/10 bg-black/20 px-3 py-2">
      <div className="font-mono text-[10px] tracking-[0.22em] text-white/50 uppercase">{label}</div>
      <div className="mt-1 font-mono text-sm uppercase tracking-[0.18em] text-white">{value}</div>
    </div>
  );
}

function TransportChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border border-white/10 bg-white/5 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className="mt-1 font-mono text-sm uppercase tracking-[0.16em] text-white">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border border-white/10 bg-black/20 px-2 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/80">{value}</div>
    </div>
  );
}

function getTrackSummary(track: Track) {
  switch (track.kind) {
    case "pulse":
      return "Pulse lanes carry the lead and harmony phrases, with duty-cycle shaping called out in the row controls.";
    case "triangle":
      return "Triangle anchors the low-end pattern and stays note-driven for bass movement.";
    case "noise":
      return "Noise acts as the percussion lane, using discrete hits and period changes instead of pitched notes.";
    case "sample":
      return "PCM handles short recorded sounds from the sample deck, trimmed and triggered on the grid.";
  }
}

function getTrackControls(track: Track) {
  switch (track.kind) {
    case "pulse":
      return [`duty ${getPulseDutyLabel(track)}`, "note grid", "volume"];
    case "triangle":
      return ["note grid", "bass lane", "volume"];
    case "noise":
      return ["noise mode", "period index", "hit grid"];
    case "sample":
      return ["recorded sample", "trim preview", "trigger grid"];
  }
}

function getStepLabel(track: Track, index: number) {
  switch (track.kind) {
    case "pulse": {
      const step = track.steps[index];
      return step.enabled ? step.note : "--";
    }
    case "triangle": {
      const step = track.steps[index];
      return step.enabled ? step.note : "--";
    }
    case "noise": {
      const step = track.steps[index];
      if (!step.enabled) {
        return "--";
      }

      return step.mode === "short" ? "sn" : "nz";
    }
    case "sample": {
      const step = track.steps[index];
      if (!step.enabled) {
        return "--";
      }

      return step.sampleId === null ? "pcm" : "hit";
    }
  }
}

function getPulseDutyLabel(track: Extract<Track, { kind: "pulse" }>) {
  const pulseStep = track.steps.find((step) => step.enabled);

  if (pulseStep === undefined) {
    return "50%";
  }

  return `${pulseStep.duty * 100}%`;
}
