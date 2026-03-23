import BorderGlow from "@ochoit/ui/components/BorderGlow";
import { cn } from "@ochoit/ui/lib/utils";
import { Card, CardContent, CardHeader } from "@ochoit/ui/components/ui/8bitcn/card";
import { Badge } from "@ochoit/ui/components/ui/8bitcn/badge";
import { Separator } from "@ochoit/ui/components/ui/8bitcn/separator";
import { Download, Link, Mic, Pause, Play, Sparkles, Square, Trash2, Upload, Volume2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  SkinButton as Button,
  SkinInput as Input,
  SkinSlider,
  SkinTextarea,
  SkinTooltip as Tooltip,
  SkinTooltipContent as TooltipContent,
  SkinTooltipTrigger as TooltipTrigger,
} from "@/components/ui/skin-controls";
import { useWorkstationState } from "@/components/use-workstation-state";
import { type Skin } from "@/features/ui/skin-config";
import { SkinRuntimeProvider, useActiveSkin } from "@/features/ui/skin-runtime";
import { useSkinSearch } from "@/features/ui/use-skin-search";
import { SequencerMatrix } from "@/components/sequencer-matrix";
import { NotePicker } from "@/components/note-picker";
import { labelByTrackId, waveformGlowColorByTrackId, waveformLineColorByTrackId } from "@/components/sequencer-theme";
import { WaveformCanvas, useWaveformCanvasVariant } from "@/components/waveform-canvas";
import {
  createWaveformFromPcm,
  type SampleRecorderPermissionState,
  type SampleRecorderStatus,
} from "@/features/audio/sample-recorder";
import { type AudioBootstrapState } from "@/features/audio/use-audio-engine";
import {
  SONG_MAX_SAMPLE_COUNT,
  type SongDocument,
} from "@/features/song/song-document";
import {
  type EngineMode,
  formatEngineModeLabel,
  getPcmModeLabel,
  getPcmModeSummary,
  getSampleArrangementHelperCopy,
} from "@/features/song/pcm-mode";
import { songExamples, type SongExample } from "@/features/song/song-examples";
import {
  TRACK_VOLUME_PERCENT_RANGE,
  toTrackVolumePercent,
} from "@/features/song/song-mixer";
import {
  type MelodicTrackId,
  type TriggerTrackId,
  noiseTriggerPresets,
} from "@/features/song/song-pattern";
import {
  getTrimmedFrameCount,
  getTrimmedSamplePcm,
} from "@/features/song/song-samples";
import {
  resolveSongBpmInput,
  resolveSongLoopLengthInput,
  SONG_BPM_RANGE,
  SONG_LOOP_LENGTH_RANGE,
} from "@/features/song/song-transport";



type WorkstationShellProps = {
  initialSong?: SongDocument;
  skin?: Skin;
};

export function WorkstationShell({ initialSong, skin }: WorkstationShellProps) {
  if (skin !== undefined) {
    return (
      <SkinRuntimeProvider skin={skin}>
        {skin === "8bitcn" ? (
          <RetroWorkstationView initialSong={initialSong} />
        ) : (
          <ClassicWorkstationView initialSong={initialSong} />
        )}
      </SkinRuntimeProvider>
    );
  }

  return <ConnectedWorkstationShell initialSong={initialSong} />;
}

function ConnectedWorkstationShell({ initialSong }: Pick<WorkstationShellProps, "initialSong">) {
  const { normalizedSearch } = useSkinSearch();

  return normalizedSearch.skin === "8bitcn" ? (
    <RetroWorkstationView initialSong={initialSong} />
  ) : (
    <ClassicWorkstationView initialSong={initialSong} />
  );
}

export function ClassicWorkstationView({ initialSong }: Pick<WorkstationShellProps, "initialSong">) {
  const ws = useWorkstationState(initialSong);

  return (
    <main
      data-skin="classic"
      data-testid="classic-workstation-view"
      className="relative min-h-full overflow-auto bg-[var(--oc-bg)] text-[var(--oc-text)] oc-scanlines"
    >
      {/* Ambient gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-[8%] h-[340px] w-[420px] rounded-full bg-[var(--oc-pulse1)]/[0.04] blur-[100px]" />
        <div className="absolute top-[40px] right-[12%] h-[280px] w-[350px] rounded-full bg-[var(--oc-pulse2)]/[0.04] blur-[100px]" />
        <div className="absolute bottom-[20%] left-[30%] h-[200px] w-[300px] rounded-full bg-[var(--oc-triangle)]/[0.03] blur-[80px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-4 md:px-6 lg:px-8">
        {/* ── Transport + Controls Bar ── */}
        <section className={cn("flex flex-col gap-2.5", ws.showAudioGate ? "relative z-30" : undefined)}>
          {/* Row 1: Transport Strip — the "hardware panel" */}
          <TransportStrip
            song={ws.song}
            engineState={ws.engineState}
            startTransport={ws.startTransport}
            stopTransport={ws.stopTransport}
            isPlaying={ws.isPlaying}
            onMasterVolumeChange={ws.setMasterSongVolume}
            onOldSpeakerModeChange={ws.setOldSpeakerMode}
            onBpmChange={ws.updateBpm}
            onLoopLengthChange={ws.updateLoopLength}
          />

          {/* Row 2: Actions Bar — distinct from transport */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.04] bg-[var(--oc-surface)]/60 px-3 py-2 backdrop-blur-sm">
            {/* Primary: Audio gate */}
            <AudioInitButton
              engineState={ws.engineState}
              audioReady={ws.audioReady}
              initializeAudio={ws.initializeAudio}
              showAudioGate={ws.showAudioGate}
            />

            <div className="oc-action-divider hidden sm:block" aria-hidden="true" />

            {/* Featured: Examples — the star of the show */}
            <BorderGlow
              animated={ws.showExamplesGlow}
              backgroundColor="rgba(13, 15, 24, 0.85)"
              borderRadius={8}
              glowRadius={16}
              glowIntensity={0.9}
              edgeSensitivity={20}
              coneSpread={30}
              fillOpacity={0.35}
              glowColor="263 90 76"
              colors={["#a78bfa", "#5cb8ff", "#ff5ea0"]}
            >
              <Button
                variant="outline"
                className="h-10 rounded-lg border-0 bg-transparent px-4 font-[var(--oc-mono)] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--oc-accent)]/80 hover:bg-[var(--oc-accent)]/10 hover:text-[var(--oc-accent)]"
                aria-label="Open examples"
                onClick={() => {
                  ws.setShowExamplesGlow(false);
                  ws.openExamplesDialog();
                }}
              >
                <Sparkles className="mr-1.5 size-3.5" />
                Examples
              </Button>
            </BorderGlow>

            <div className="oc-action-divider hidden sm:block" aria-hidden="true" />

            {/* Utility cluster: DSL, WAV, Share, Load */}
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      className="h-9 rounded-md border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] px-2.5 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text-dim)]"
                      aria-label="Edit share DSL"
                      onClick={ws.openShareDslEditor}
                    />
                  }
                >
                  DSL
                </TooltipTrigger>
                <TooltipContent side="bottom">Edit song as text DSL</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      className="h-9 rounded-md border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] px-2.5 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text-dim)]"
                      aria-label="Download arrangement as WAV file"
                      disabled={ws.isExportingWav}
                      onClick={() => {
                        void ws.saveArrangementAsWav();
                      }}
                    />
                  }
                >
                  <Download className="mr-1 size-3" />
                  <span className="hidden sm:inline">{ws.isExportingWav ? "Saving…" : "WAV"}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download as WAV file</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text-dim)]"
                      aria-label="Copy shareable link to clipboard"
                      onClick={() => {
                        void ws.copyShareLink();
                      }}
                    />
                  }
                >
                  <Link className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy shareable link</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text-dim)]"
                      aria-label="Load song from current URL"
                      onClick={() => {
                        ws.applySharedSongFromCurrentUrl("No shared song was found in the current link.");
                      }}
                    />
                  }
                >
                  <Upload className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Load song from URL</TooltipContent>
              </Tooltip>
            </div>

            {/* Spacer pushes destructive action to the end */}
            <div className="hidden flex-1 lg:block" />

            {/* Destructive: Clear */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-md border-[var(--oc-noise)]/15 bg-[var(--oc-noise)]/[0.04] px-2.5 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-noise)]/60 hover:border-[var(--oc-noise)]/30 hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
                    aria-label="Clear song"
                    onClick={ws.resetSong}
                  />
                }
              >
                <Trash2 className="mr-1 size-3" />
                <span className="hidden sm:inline">Clear</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reset song &amp; clear all data</TooltipContent>
            </Tooltip>
          </div>

          {ws.shareStatus !== null ? (
            <div
              className={cn(
                "rounded-md px-3 py-2 font-[var(--oc-mono)] text-xs",
                ws.shareStatus.tone === "error"
                  ? "border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] text-[var(--oc-noise)]"
                  : "border border-[var(--oc-play)]/25 bg-[var(--oc-play)]/10 text-[var(--oc-play)]",
              )}
            >
              {ws.shareStatus.message}
            </div>
          ) : null}

          {ws.errorMessage !== null ? (
            <div className="rounded-md border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] px-3 py-2 font-[var(--oc-mono)] text-xs text-[var(--oc-noise)]">
              {ws.errorMessage}
            </div>
          ) : null}
        </section>

        {/* ── Grid: Sequencer (left) + Sample Deck (right) ── */}
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          {/* Sequencer Matrix */}
          <div className="min-w-0">
            <SequencerMatrix
              defaultSampleId={ws.deckSample?.id ?? null}
              engine={ws.engine}
              onOpenMelodicTrackEditor={ws.openMelodicTrackEditor}
              onOpenTriggerTrackEditor={ws.openTriggerTrackEditor}
              onToggleTrackMute={ws.toggleTrackMute}
              onUpdateTrackVolume={ws.setTrackVolume}
              onUpdateMelodicStep={ws.updateMelodicStep}
              onUpdateNoiseStep={ws.updateNoiseStep}
              onUpdateSampleStep={ws.updateSampleStep}
              song={ws.song}
              playbackState={ws.transportState.playbackState}
              nextStep={ws.transportState.nextStep}
            />
          </div>

          {/* Sample Deck Sidebar */}
          <aside className="flex flex-col gap-3">
            <SampleDeck
              engineMode={ws.song.meta.engineMode}
              samples={ws.song.samples}
              sample={ws.deckSample}
              selectedSampleId={ws.deckSample?.id ?? null}
              recorderErrorMessage={ws.recorderErrorMessage}
              recorderPermissionState={ws.recorderPermissionState}
              recorderStatus={ws.recorderStatus}
              recordingDurationMs={ws.recordingDurationMs}
              onDeleteSample={ws.deleteDeckSample}
              onApplyTrim={ws.applyDeckSampleTrim}
              onPreviewSample={ws.previewDeckSample}
              onMoveTrimWindow={ws.moveDeckSampleTrimWindow}
              onResizeTrimWindow={ws.resizeDeckSampleTrimWindow}
              onSetSampleBaseNote={ws.updateDeckSampleBaseNote}
              onSelectSample={ws.selectDeckSample}
              onStartRecording={ws.startRecording}
              onStopRecording={ws.stopRecording}
            />
            <SongMeta
              engineState={ws.engineState}
              onUpdateEngineMode={ws.updateEngineMode}
              onUpdateSongAuthor={ws.updateSongAuthor}
              onUpdateSongName={ws.updateSongName}
              song={ws.song}
              trackCount={ws.tracks.length}
            />
          </aside>
        </section>
      </div>

      {ws.showAudioGate ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 bg-[#04050b]/72 backdrop-blur-[4px] backdrop-saturate-125"
        />
      ) : null}

      {ws.arrangementEditor !== null ? (
        <TrackArrangementEditor
          engineMode={ws.song.meta.engineMode}
          trackId={ws.arrangementEditor.trackId}
          loopLength={ws.song.transport.loopLength}
          draft={ws.arrangementEditor.draft}
          error={ws.arrangementEditor.error}
          samples={ws.song.samples}
          onChangeDraft={ws.updateArrangementDraft}
          onClose={ws.closeMelodicTrackEditor}
          onApply={ws.applyArrangement}
        />
      ) : null}
      {ws.shareDslEditor !== null ? (
        <ShareDslEditor
          draft={ws.shareDslEditor.draft}
          error={ws.shareDslEditor.error}
          onApply={ws.applyShareDsl}
          onChangeDraft={ws.updateShareDslDraft}
          onClose={ws.closeShareDslEditor}
          onCopy={ws.copyShareDsl}
        />
      ) : null}
      {ws.examplesOpen ? (
        <ExamplesDialog examples={songExamples} onClose={ws.closeExamplesDialog} onLoadExample={ws.loadSongExample} />
      ) : null}
    </main>
  );
}

export function RetroWorkstationView({ initialSong }: Pick<WorkstationShellProps, "initialSong">) {
  const ws = useWorkstationState(initialSong);

  return (
    <main
      data-skin="8bitcn"
      data-testid="retro-workstation-view"
      className="retro relative min-h-full bg-background text-foreground"
    >
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6 lg:px-8">
        {/* ── Transport + Controls ── */}
        <Card className={cn("overflow-visible", ws.showAudioGate ? "relative z-30" : undefined)}>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* Playback controls */}
              <div className="flex items-center gap-1.5">
                <Button
                  className={cn(
                    "h-10 px-5 text-xs font-semibold uppercase tracking-wider",
                    ws.isPlaying
                      ? "bg-[var(--oc-play)]/25 text-[var(--oc-play)] hover:bg-[var(--oc-play)]/35"
                      : "bg-[var(--oc-play)] text-[var(--oc-bg)] hover:bg-[var(--oc-play)]/90",
                  )}
                  onClick={() => {
                    void ws.startTransport();
                  }}
                >
                  {ws.isPlaying ? <Pause className="mr-1.5 size-3.5" /> : <Play className="mr-1.5 size-3.5" />}
                  {ws.isPlaying ? "Playing" : "Play"}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-3 text-xs uppercase tracking-wider"
                  disabled={!ws.isPlaying}
                  onClick={() => {
                    ws.stopTransport();
                  }}
                >
                  <Square className="mr-1.5 size-3.5" />
                  Stop
                </Button>
              </div>

              <Separator orientation="vertical" className="hidden h-6 md:block" />

              {/* Tempo & length */}
              <div className="flex items-center gap-2">
                <TransportField
                  label="BPM"
                  value={ws.song.transport.bpm}
                  min={SONG_BPM_RANGE.min}
                  max={SONG_BPM_RANGE.max}
                  step={1}
                  onChange={ws.updateBpm}
                  parseValue={(rawValue) => resolveSongBpmInput(rawValue, ws.song.transport.bpm)}
                />
                <TransportField
                  label="Loop"
                  value={ws.song.transport.loopLength}
                  min={SONG_LOOP_LENGTH_RANGE.min}
                  max={SONG_LOOP_LENGTH_RANGE.max}
                  step={SONG_LOOP_LENGTH_RANGE.step}
                  onChange={ws.updateLoopLength}
                  parseValue={(rawValue) => resolveSongLoopLengthInput(rawValue, ws.song.transport.loopLength)}
                  suffix="st"
                />
              </div>

              <Separator orientation="vertical" className="hidden h-6 md:block" />

              {/* Master output */}
              <MasterVolumeField
                value={ws.song.mixer.masterVolume}
                oldSpeakerMode={ws.song.mixer.oldSpeakerMode}
                onChange={ws.setMasterSongVolume}
                onOldSpeakerModeChange={ws.setOldSpeakerMode}
              />

              <div className="hidden flex-1 lg:block" />

              {/* Status badges */}
              <div className="flex items-center gap-2">
                <Badge variant={ws.engineState === "running" ? "default" : "outline"}>
                  Audio: {ws.engineState}
                </Badge>
                <Badge variant={ws.isPlaying ? "default" : "outline"}>
                  {ws.isPlaying ? "Playing" : "Stopped"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <AudioInitButton
                engineState={ws.engineState}
                audioReady={ws.audioReady}
                initializeAudio={ws.initializeAudio}
                showAudioGate={ws.showAudioGate}
              />

              <Separator orientation="vertical" className="hidden h-5 sm:block" />

              <Button
                variant="outline"
                className="h-9 px-3 text-xs uppercase tracking-wider"
                aria-label="Open examples"
                onClick={() => {
                  ws.setShowExamplesGlow(false);
                  ws.openExamplesDialog();
                }}
              >
                <Sparkles className="mr-1.5 size-3.5" />
                Examples
              </Button>

              <Separator orientation="vertical" className="hidden h-5 sm:block" />

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  className="h-9 px-2.5 text-xs uppercase"
                  aria-label="Edit share DSL"
                  onClick={ws.openShareDslEditor}
                >
                  DSL
                </Button>
                <Button
                  variant="outline"
                  className="h-9 px-2.5 text-xs uppercase"
                  aria-label="Download arrangement as WAV file"
                  disabled={ws.isExportingWav}
                  onClick={() => {
                    void ws.saveArrangementAsWav();
                  }}
                >
                  <Download className="mr-1 size-3" />
                  <span className="hidden sm:inline">{ws.isExportingWav ? "Saving…" : "WAV"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label="Copy shareable link to clipboard"
                  onClick={() => {
                    void ws.copyShareLink();
                  }}
                >
                  <Link className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label="Load song from current URL"
                  onClick={() => {
                    ws.applySharedSongFromCurrentUrl("No shared song was found in the current link.");
                  }}
                >
                  <Upload className="size-3.5" />
                </Button>
              </div>

              <div className="hidden flex-1 lg:block" />

              <Button
                type="button"
                variant="destructive"
                className="h-9 px-2.5 text-xs uppercase"
                aria-label="Clear song"
                onClick={ws.resetSong}
              >
                <Trash2 className="mr-1 size-3" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {ws.shareStatus !== null ? (
          <Card size="sm" className={ws.shareStatus.tone === "error" ? "border-destructive" : "border-primary"}>
            <CardContent className="text-sm">
              {ws.shareStatus.message}
            </CardContent>
          </Card>
        ) : null}

        {ws.errorMessage !== null ? (
          <Card size="sm" className="border-destructive">
            <CardContent className="text-sm text-destructive">
              {ws.errorMessage}
            </CardContent>
          </Card>
        ) : null}

        {/* ── Grid: Sequencer (left) + Sample Deck (right) ── */}
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <SequencerMatrix
              defaultSampleId={ws.deckSample?.id ?? null}
              engine={ws.engine}
              onOpenMelodicTrackEditor={ws.openMelodicTrackEditor}
              onOpenTriggerTrackEditor={ws.openTriggerTrackEditor}
              onToggleTrackMute={ws.toggleTrackMute}
              onUpdateTrackVolume={ws.setTrackVolume}
              onUpdateMelodicStep={ws.updateMelodicStep}
              onUpdateNoiseStep={ws.updateNoiseStep}
              onUpdateSampleStep={ws.updateSampleStep}
              song={ws.song}
              playbackState={ws.transportState.playbackState}
              nextStep={ws.transportState.nextStep}
            />
          </div>

          <aside className="flex flex-col gap-3">
            <SampleDeck
              engineMode={ws.song.meta.engineMode}
              samples={ws.song.samples}
              sample={ws.deckSample}
              selectedSampleId={ws.deckSample?.id ?? null}
              recorderErrorMessage={ws.recorderErrorMessage}
              recorderPermissionState={ws.recorderPermissionState}
              recorderStatus={ws.recorderStatus}
              recordingDurationMs={ws.recordingDurationMs}
              onDeleteSample={ws.deleteDeckSample}
              onApplyTrim={ws.applyDeckSampleTrim}
              onPreviewSample={ws.previewDeckSample}
              onMoveTrimWindow={ws.moveDeckSampleTrimWindow}
              onResizeTrimWindow={ws.resizeDeckSampleTrimWindow}
              onSetSampleBaseNote={ws.updateDeckSampleBaseNote}
              onSelectSample={ws.selectDeckSample}
              onStartRecording={ws.startRecording}
              onStopRecording={ws.stopRecording}
            />
            <SongMeta
              engineState={ws.engineState}
              onUpdateEngineMode={ws.updateEngineMode}
              onUpdateSongAuthor={ws.updateSongAuthor}
              onUpdateSongName={ws.updateSongName}
              song={ws.song}
              trackCount={ws.tracks.length}
            />
          </aside>
        </section>
      </div>

      {ws.showAudioGate ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 bg-background/80 backdrop-blur-[4px]"
        />
      ) : null}

      {ws.arrangementEditor !== null ? (
        <TrackArrangementEditor
          engineMode={ws.song.meta.engineMode}
          trackId={ws.arrangementEditor.trackId}
          loopLength={ws.song.transport.loopLength}
          draft={ws.arrangementEditor.draft}
          error={ws.arrangementEditor.error}
          samples={ws.song.samples}
          onChangeDraft={ws.updateArrangementDraft}
          onClose={ws.closeMelodicTrackEditor}
          onApply={ws.applyArrangement}
        />
      ) : null}
      {ws.shareDslEditor !== null ? (
        <ShareDslEditor
          draft={ws.shareDslEditor.draft}
          error={ws.shareDslEditor.error}
          onApply={ws.applyShareDsl}
          onChangeDraft={ws.updateShareDslDraft}
          onClose={ws.closeShareDslEditor}
          onCopy={ws.copyShareDsl}
        />
      ) : null}
      {ws.examplesOpen ? (
        <ExamplesDialog examples={songExamples} onClose={ws.closeExamplesDialog} onLoadExample={ws.loadSongExample} />
      ) : null}
    </main>
  );
}

/* ─────────── Transport Strip ─────────── */

function TransportStrip({
  song,
  engineState,
  startTransport,
  stopTransport,
  isPlaying,
  onMasterVolumeChange,
  onOldSpeakerModeChange,
  onBpmChange,
  onLoopLengthChange,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  startTransport: () => Promise<void>;
  stopTransport: () => void;
  isPlaying: boolean;
  onMasterVolumeChange: (value: number) => void;
  onOldSpeakerModeChange: (enabled: boolean) => void;
  onBpmChange: (value: number) => void;
  onLoopLengthChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--oc-panel-border)] bg-gradient-to-b from-[var(--oc-surface-raised)] to-[var(--oc-surface)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_2px_8px_rgba(0,0,0,0.3)]">
      {/* ── Playback controls ── */}
      <div className="flex items-center gap-1.5">
        <Button
          className={cn(
            "oc-btn-play h-10 rounded-lg px-5 font-[var(--oc-mono)] text-xs font-semibold uppercase tracking-[0.12em]",
            isPlaying
              ? "bg-[var(--oc-play)]/20 text-[var(--oc-play)] hover:bg-[var(--oc-play)]/30"
              : "bg-[var(--oc-play)] text-[var(--oc-bg)] shadow-[0_0_12px_rgba(61,220,132,0.2)] hover:bg-[var(--oc-play)]/90 hover:shadow-[0_0_20px_rgba(61,220,132,0.35)]",
          )}
          onClick={() => {
            void startTransport();
          }}
        >
          {isPlaying ? <Pause className="mr-1.5 size-3.5" /> : <Play className="mr-1.5 size-3.5" />}
          {isPlaying ? "Playing" : "Play"}
        </Button>
        <Button
          variant="outline"
          className="oc-btn-stop h-10 rounded-lg border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] px-3 font-[var(--oc-mono)] text-xs uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
          disabled={!isPlaying}
          onClick={() => {
            stopTransport();
          }}
        >
          <Square className="mr-1.5 size-3.5" />
          Stop
        </Button>
      </div>

      {/* ── Separator ── */}
      <div className="oc-action-divider hidden md:block" aria-hidden="true" />

      {/* ── Tempo & length dials ── */}
      <div className="flex items-center gap-2">
        <TransportField
          label="BPM"
          value={song.transport.bpm}
          min={SONG_BPM_RANGE.min}
          max={SONG_BPM_RANGE.max}
          step={1}
          onChange={onBpmChange}
          parseValue={(rawValue) => resolveSongBpmInput(rawValue, song.transport.bpm)}
        />
        <TransportField
          label="Loop"
          value={song.transport.loopLength}
          min={SONG_LOOP_LENGTH_RANGE.min}
          max={SONG_LOOP_LENGTH_RANGE.max}
          step={SONG_LOOP_LENGTH_RANGE.step}
          onChange={onLoopLengthChange}
          parseValue={(rawValue) => resolveSongLoopLengthInput(rawValue, song.transport.loopLength)}
          suffix="st"
        />
      </div>

      {/* ── Separator ── */}
      <div className="oc-action-divider hidden md:block" aria-hidden="true" />

      {/* ── Master output ── */}
      <MasterVolumeField
        value={song.mixer.masterVolume}
        oldSpeakerMode={song.mixer.oldSpeakerMode}
        onChange={onMasterVolumeChange}
        onOldSpeakerModeChange={onOldSpeakerModeChange}
      />

      {/* ── Spacer ── */}
      <div className="hidden flex-1 lg:block" />

      {/* ── Status LEDs ── */}
      <div className="flex items-center gap-2">
        <StatusChip label="Audio" value={engineState} active={engineState === "running"} />
        <StatusChip label="Playback" value={isPlaying ? "playing" : "stopped"} active={isPlaying} />
      </div>
    </div>
  );
}

function MasterVolumeField({
  value,
  oldSpeakerMode,
  onChange,
  onOldSpeakerModeChange,
}: {
  value: number;
  oldSpeakerMode: boolean;
  onChange: (value: number) => void;
  onOldSpeakerModeChange: (enabled: boolean) => void;
}) {
  const percentValue = toTrackVolumePercent(value);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-3 py-1.5">
      <label
        htmlFor="transport-master-volume"
        className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--oc-text-faint)]"
      >
        Master
      </label>
      <SkinSlider
        aria-label="Global Volume"
        className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-[var(--oc-panel-border)] accent-[var(--oc-play)]"
        id="transport-master-volume"
        max={TRACK_VOLUME_PERCENT_RANGE.max}
        min={TRACK_VOLUME_PERCENT_RANGE.min}
        step={TRACK_VOLUME_PERCENT_RANGE.step}
        value={percentValue}
        onValueChange={(nextValue) => {
          onChange(nextValue / 100);
        }}
      />
      <span className="w-8 text-right font-[var(--oc-mono)] text-[9px] tabular-nums text-[var(--oc-text-faint)]">{percentValue}%</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              aria-label="Lo-fi speaker filter"
              aria-pressed={oldSpeakerMode}
              className={cn(
                "h-7 rounded-md border px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]",
                oldSpeakerMode
                  ? "border-[var(--oc-noise)]/35 bg-[var(--oc-noise)]/12 text-[var(--oc-noise)] hover:bg-[var(--oc-noise)]/18"
                  : "border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text-dim)]",
              )}
              onClick={() => {
                onOldSpeakerModeChange(!oldSpeakerMode);
              }}
            />
          }
        >
          <Volume2 className="mr-1 size-3" />
          Lo-fi
        </TooltipTrigger>
        <TooltipContent side="bottom">Simulates a tinny old TV speaker with low-pass filtering</TooltipContent>
      </Tooltip>
    </div>
  );
}

/* ─────────── Transport Field ─────────── */

function TransportField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  parseValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  parseValue: (rawValue: string) => number;
}) {
  const inputId = `transport-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const [draft, setDraft] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const commitValue = useCallback(() => {
    const resolved = parseValue(draft);
    onChange(resolved);
    setDraft(String(resolved));
  }, [draft, onChange, parseValue]);

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-2.5 py-1.5">
      <label
        htmlFor={inputId}
        className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--oc-text-faint)]"
      >
        {label}
      </label>
      <Input
        id={inputId}
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={label === "Loop" ? "Loop Length" : label}
        aria-valuemin={min}
        aria-valuemax={max}
        className="h-7 w-14 border-0 bg-transparent px-0 text-center font-[var(--oc-mono)] text-sm font-semibold tabular-nums text-[var(--oc-text)] focus-visible:ring-0"
        onFocus={(event) => {
          setIsFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => {
          setIsFocused(false);
          commitValue();
        }}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            const next = Math.min(max, value + step);
            onChange(next);
            setDraft(String(next));
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            const next = Math.max(min, value - step);
            onChange(next);
            setDraft(String(next));
          }
        }}
      />
      {suffix ? (
        <span className="font-[var(--oc-mono)] text-[9px] uppercase text-[var(--oc-text-faint)]">{suffix}</span>
      ) : null}
    </div>
  );
}

/* ─────────── Audio Init Button ─────────── */

function AudioInitButton({
  engineState,
  audioReady,
  initializeAudio,
  showAudioGate,
}: {
  engineState: AudioBootstrapState;
  audioReady: boolean;
  initializeAudio: () => Promise<unknown>;
  showAudioGate: boolean;
}) {
  const activeSkin = useActiveSkin();
  const isRetro = activeSkin === "8bitcn";
  const promptId = "audio-init-prompt";
  const showRetryCopy = engineState === "error";

  return (
    <div className="relative flex items-center">
      <Button
        aria-describedby={showAudioGate ? promptId : undefined}
        className={cn(
          "h-10 rounded-md px-4 font-[var(--oc-mono)] text-xs font-semibold uppercase tracking-[0.1em] transition-all",
          audioReady
            ? "bg-[var(--oc-accent)]/15 text-[var(--oc-accent)] hover:bg-[var(--oc-accent)]/25"
            : "bg-[var(--oc-accent)] text-[var(--oc-bg)] hover:bg-[var(--oc-accent)]/90",
          showAudioGate
            ? "oc-audio-init-hotspot h-12 rounded-lg border border-[var(--oc-accent)]/70 px-5 text-sm shadow-[0_0_0_1px_rgba(167,139,250,0.25),0_18px_40px_rgba(10,10,18,0.55)]"
            : undefined,
        )}
        onClick={() => {
          void initializeAudio();
        }}
      >
        <Zap className={cn("mr-1.5 size-3.5", showAudioGate ? "size-4" : undefined)} />
        {engineState === "initializing" ? "Booting…" : audioReady ? "Audio On" : "Start Audio"}
      </Button>

      {showAudioGate ? (
        <div
          id={promptId}
          data-skin-variant={activeSkin}
          className={cn(
            "oc-audio-gate absolute top-full left-0 mt-3",
            isRetro ? "w-[min(19rem,calc(100vw-2rem))] rounded-[18px] p-3.5" : "w-[min(24rem,calc(100vw-2rem))] rounded-2xl p-4",
          )}
        >
          <div
            data-skin-variant={activeSkin}
            className="oc-audio-gate-caret absolute top-0 left-6 h-4 w-4 -translate-y-1/2 rotate-45"
          />
          <div className="mb-2 flex items-center gap-2">
            <span
              className={cn(
                "border px-2 py-1 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-accent)]",
                isRetro
                  ? "rounded-[20px] border-[color-mix(in_srgb,var(--oc-accent)_35%,white_12%)] bg-[color-mix(in_srgb,var(--oc-accent)_16%,white_70%)]"
                  : "rounded-full border-[var(--oc-accent)]/35 bg-[color-mix(in_srgb,var(--oc-accent)_14%,transparent)]",
              )}
            >
              First step
            </span>
            <span className="font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--oc-text-faint)]">
              Browser audio unlock
            </span>
          </div>
          {isRetro ? (
            <>
              <p className="font-[var(--oc-display)] text-[1.05rem] leading-[1.6] text-[var(--oc-text)]">
                Click <span className="text-[var(--oc-accent)]">Start Audio</span>
              </p>
              <p className="mt-2 max-w-[24ch] font-[var(--oc-mono)] text-[10px] leading-6 text-[var(--oc-text-dim)]">
                Unlock playback, sample preview, and recording with one browser tap.
              </p>
            </>
          ) : (
            <>
              <p className="font-[var(--oc-display)] text-xl leading-tight text-[var(--oc-text)]">
                Click <span className="text-[var(--oc-accent)]">Start Audio</span> before using the sequencer.
              </p>
              <p className="mt-2 max-w-[32ch] font-[var(--oc-mono)] text-[11px] leading-5 text-[var(--oc-text-dim)]">
                Your browser blocks sound until you interact once. This unlocks playback, sample preview, and recording.
              </p>
            </>
          )}
          {showRetryCopy ? (
            <p className="mt-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--oc-noise)]">
              Audio did not start. Click again to retry.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────── Status Chip ─────────── */

function StatusChip({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-2 py-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          active
            ? "bg-[var(--oc-play)] shadow-[0_0_4px_rgba(61,220,132,0.6)]"
            : "bg-[var(--oc-text-ghost)]",
        )}
        aria-hidden="true"
      />
      <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--oc-text-faint)]">{label}</span>
      <span className="font-[var(--oc-mono)] text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--oc-text-dim)]">
        {value}
      </span>
    </div>
  );
}

/* ─────────── Sample Deck ─────────── */

function SampleDeck({
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
}: {
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
}) {
  const isRecording = recorderStatus === "recording";
  const isBusy = recorderStatus === "requesting-permission" || recorderStatus === "processing";
  const sampleLimitReached = samples.length >= SONG_MAX_SAMPLE_COUNT;
  const trimmedPcm = sample === null ? [] : getTrimmedSamplePcm(sample);
  const waveform = createWaveformFromPcm(trimmedPcm);
  const trimmedFrameCount = sample === null ? 0 : getTrimmedFrameCount(sample);
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
            ? recorderErrorMessage ?? "Recorder error"
            : sampleLimitReached
              ? `Clip limit reached (${samples.length}/${SONG_MAX_SAMPLE_COUNT})`
            : sample === null
              ? "Ready to capture"
              : `Latest clip ${formatSampleDurationLabel(sampleDurationMs)}`;
  const permissionLabel = getPermissionLabel(recorderPermissionState);
  const waveformVariant = useWaveformCanvasVariant();

  return (
    <div className="rounded-lg border border-[var(--oc-sample)]/20 bg-[var(--oc-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-sample)]">
          Sample Deck
        </h2>
        <Mic className="size-4 text-[var(--oc-sample)]/60" />
      </div>

      <p className="mb-3 font-[var(--oc-mono)] text-[10px] text-[var(--oc-text-faint)]">
        Capture up to 2s from the microphone. Store up to {SONG_MAX_SAMPLE_COUNT} clips, then trim and swap
        between them from the deck.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-8 rounded-md bg-[var(--oc-sample)] font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--oc-bg)] hover:bg-[var(--oc-sample)]/85"
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
          className="h-8 rounded-md border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
          disabled={sample === null || isBusy || isRecording}
          onClick={() => {
            void onPreviewSample();
          }}
        >
          Preview
        </Button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em]">
        <div className="rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-2.5 py-2 text-[var(--oc-text-muted)]">
          <span className="block text-[var(--oc-text-ghost)]">Mic</span>
          <span className="mt-1 block text-[var(--oc-text-dim)]">{permissionLabel}</span>
        </div>
        <div className="rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-2.5 py-2 text-[var(--oc-text-muted)]">
          <span className="block text-[var(--oc-text-ghost)]">Recorder</span>
          <span className="mt-1 block text-[var(--oc-text-dim)]">{statusLabel}</span>
        </div>
      </div>
      {sampleLimitReached ? (
        <div className="mb-3 rounded-md border border-[var(--oc-noise)]/25 bg-[var(--oc-noise)]/[0.06] px-2.5 py-2 font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-noise)]">
          Delete a clip before recording another one. Share links also cap embedded samples at {SONG_MAX_SAMPLE_COUNT}.
        </div>
      ) : null}

      <div className="rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-[var(--oc-text-faint)]">
          <span>Trim</span>
          <span>{sample?.name ?? "No Sample"}</span>
        </div>
        <div className="oc-waveform-wrap rounded-sm">
          <WaveformCanvas
            ariaLabel="PCM trim preview waveform"
            samples={waveform}
            className="h-12 w-full"
            variant={waveformVariant}
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
            className="h-8 rounded-md border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            disabled={!hasPendingTrim || isRecording || isBusy}
            onClick={onApplyTrim}
          >
            Apply Trim
          </Button>
        </div>
        <div className="mt-3 grid gap-2 rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] p-2.5">
          <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--oc-text-faint)]">
            <span>Pitch Map</span>
            <span>{engineMode === "inspired" ? "Chromatic" : "Trigger"}</span>
          </div>
          {sample === null ? (
            <div className="font-[var(--oc-mono)] text-[10px] text-[var(--oc-text-faint)]">Load a sample to assign its base note.</div>
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
                <span className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-[var(--oc-text-faint)]">
                  Base note
                </span>
                {sample.detectedBaseNote !== null ? (
                  <Button
                    className="rounded-sm border border-[var(--oc-sample)]/20 bg-[var(--oc-sample)]/10 px-2 py-1 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-sample)] transition hover:bg-[var(--oc-sample)]/18"
                    onClick={() => {
                      onSetSampleBaseNote(sample.detectedBaseNote ?? sample.baseNote);
                    }}
                  >
                    Suggested {sample.detectedBaseNote}
                  </Button>
                ) : (
                  <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-[var(--oc-text-ghost)]">
                    No stable note detected
                  </span>
                )}
              </div>
              <p className="font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-text-muted)]">
                Inspired mode transposes from this base note. Authentic mode still plays the clip as a one-shot trigger.
              </p>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--oc-text-faint)]">
          <span>
            {sample === null
              ? "No clip loaded"
              : `${sample.trim.startFrame}-${sample.trim.endFrame} · ${trimmedFrameCount} / ${sample.frameCount} fr`}
          </span>
          <span>{sample === null ? "0.00s" : formatSampleDurationLabel(sampleDurationMs)}</span>
        </div>
      </div>

      <div className="rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] p-2.5">
        <div className="mb-2 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-[var(--oc-text-faint)]">
          <span>Recorded Clips</span>
          <span>{samples.length}</span>
        </div>
        <div className="grid gap-2">
          {samples.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-3 py-4 text-center font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--oc-text-ghost)]">
              Record something to build your PCM clip list.
            </div>
          ) : (
            [...samples].reverse().map((entry) => {
              const waveform = createWaveformFromPcm(getTrimmedSamplePcm(entry), 48);
              const isSelected = entry.id === selectedSampleId;
              const trimmedDurationMs =
                entry.sampleRate <= 0 ? 0 : Math.round((getTrimmedFrameCount(entry) / entry.sampleRate) * 1000);

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border p-2 transition-colors",
                    isSelected
                      ? "border-[var(--oc-sample)]/50 bg-[var(--oc-sample)]/10"
                      : "border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)]",
                  )}
                >
                  <Button
                    aria-label={`Load sample ${entry.name}`}
                    className="min-w-0 justify-start border-0 bg-transparent px-0 py-0 text-left shadow-none ring-0 hover:bg-transparent"
                    onClick={() => {
                      onSelectSample(entry.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--oc-text)]">
                        {entry.name}
                      </span>
                      {isSelected ? (
                        <span className="rounded-sm bg-[var(--oc-sample)]/18 px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-sample)]">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-[var(--oc-text-faint)]">
                      {entry.id} · {formatSampleDurationLabel(trimmedDurationMs)}
                    </div>
                    <div className="mt-2 rounded-sm border border-[var(--oc-panel-border)] bg-[var(--oc-bg)]/80">
                      <WaveformCanvas
                        ariaLabel={`${entry.name} waveform`}
                        samples={waveform}
                        className="h-8 w-full"
                        variant={waveformVariant}
                        glowColor={waveformGlowColorByTrackId.sample}
                        lineColor={waveformLineColorByTrackId.sample}
                      />
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Delete sample ${entry.name}`}
                    className="size-8 self-start border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:bg-[var(--oc-noise)]/10 hover:text-[var(--oc-noise)]"
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
      <div className="flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--oc-text-faint)]">
        <label htmlFor={labelId}>{label}</label>
        <span>{value} fr</span>
      </div>
      <SkinSlider
        aria-label={`Sample trim ${label.toLowerCase()}`}
        disabled={disabled}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--oc-panel-border)] accent-[var(--oc-sample)] disabled:cursor-not-allowed disabled:opacity-40"
        id={labelId}
        max={max}
        min={min}
        step={1}
        value={Math.max(min, Math.min(value, max))}
        onValueChange={(nextValue) => {
          onChange(nextValue);
        }}
      />
      <Input
        aria-label={`Sample trim ${label.toLowerCase()} frame`}
        type="number"
        min={min}
        max={max}
        step={1}
        value={Math.max(min, Math.min(value, max))}
        disabled={disabled}
        className="h-7 border-[var(--oc-panel-border)] bg-[var(--oc-input-bg)] px-2 font-[var(--oc-mono)] text-[10px] text-[var(--oc-text)]"
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



/* ─────────── Song Metadata ─────────── */

function SongMeta({
  song,
  engineState,
  onUpdateEngineMode,
  onUpdateSongAuthor,
  onUpdateSongName,
  trackCount,
}: {
  song: SongDocument;
  engineState: AudioBootstrapState;
  onUpdateEngineMode: (engineMode: EngineMode) => void;
  onUpdateSongAuthor: (author: string) => void;
  onUpdateSongName: (name: string) => void;
  trackCount: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--oc-panel-border)] bg-[var(--oc-surface)] p-4">
      <h2 className="mb-3 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-text-muted)]">
        Song Info
      </h2>
      <div className="mb-3 grid gap-1.5">
        <label
          htmlFor="song-name"
          className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--oc-text-faint)]"
        >
          Song Name
        </label>
        <Input
          id="song-name"
          aria-label="Song Name"
          maxLength={80}
          value={song.meta.name}
          className="h-8 border-[var(--oc-panel-border)] bg-[var(--oc-input-bg)] px-2.5 font-[var(--oc-mono)] text-[11px] text-[var(--oc-text)] placeholder:text-[var(--oc-text-ghost)]"
          onChange={(event) => {
            onUpdateSongName(event.currentTarget.value);
          }}
        />
      </div>
      <div className="mb-3 grid gap-1.5">
        <label
          htmlFor="song-author"
          className="font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--oc-text-faint)]"
        >
          Author
        </label>
        <Input
          id="song-author"
          aria-label="Author"
          maxLength={80}
          value={song.meta.author}
          className="h-8 border-[var(--oc-panel-border)] bg-[var(--oc-input-bg)] px-2.5 font-[var(--oc-mono)] text-[11px] text-[var(--oc-text)] placeholder:text-[var(--oc-text-ghost)]"
          onChange={(event) => {
            onUpdateSongAuthor(event.currentTarget.value);
          }}
        />
      </div>
      <div className="grid gap-2 font-[var(--oc-mono)] text-[10px]">
        <MetaRow label="Author" value={song.meta.author} />
        <MetaRow label="Mode" value={formatEngineModeLabel(song.meta.engineMode)} />
        <MetaRow label="Tempo" value={`${song.transport.bpm} bpm`} />
        <MetaRow label="Loop" value={`${song.transport.loopLength} steps`} />
        <MetaRow label="Voices" value={`${trackCount}`} />
        <MetaRow label="Audio" value={engineState} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["authentic", "inspired"] as const).map((engineMode) => {
          const isSelected = song.meta.engineMode === engineMode;

          return (
            <Button
              key={engineMode}
              type="button"
              variant="outline"
              aria-pressed={isSelected}
              className={cn(
                "h-8 rounded-md border font-[var(--oc-mono)] text-[9px] font-semibold uppercase tracking-[0.16em] transition-all",
                isSelected
                  ? "border-[var(--oc-accent)]/45 bg-[var(--oc-accent)]/12 text-[var(--oc-text)]"
                  : "border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]",
              )}
              onClick={() => {
                onUpdateEngineMode(engineMode);
              }}
            >
              {formatEngineModeLabel(engineMode)}
            </Button>
          );
        })}
      </div>
      <div
        aria-label="PCM mode summary"
        className="mt-3 rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-3 py-2 font-[var(--oc-mono)]"
      >
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--oc-text-faint)]">
          {getPcmModeLabel(song.meta.engineMode)}
        </div>
        <p className="mt-1 text-[10px] leading-5 text-[var(--oc-text-muted)]">{getPcmModeSummary(song.meta.engineMode)}</p>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--oc-panel-border)] pb-1.5 last:border-0 last:pb-0">
      <span className="uppercase tracking-[0.18em] text-[var(--oc-text-faint)]">{label}</span>
      <span className="font-medium text-[var(--oc-text-dim)]">{value}</span>
    </div>
  );
}

function ShareDslEditor({
  draft,
  error,
  onApply,
  onChangeDraft,
  onClose,
  onCopy,
}: {
  draft: string;
  error: string | null;
  onApply: () => void;
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onCopy: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--oc-bg)]/72 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-xl border border-[var(--oc-panel-border)] bg-[var(--oc-surface)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--oc-mono)] text-sm font-semibold uppercase tracking-[0.18em] text-[var(--oc-text)]">
              Share DSL
            </h2>
            <p className="mt-2 max-w-3xl font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-text-muted)]">
              Full compact song DSL for share links. Copy it as plain text or paste an edited DSL and apply it to replace the current song.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] p-3">
          <label
            htmlFor="share-dsl-textarea"
            className="mb-2 block font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.18em] text-[var(--oc-text-faint)]"
          >
            Share DSL Text
          </label>
          <SkinTextarea
            id="share-dsl-textarea"
            aria-label="Share DSL text"
            value={draft}
            spellCheck={false}
            className="h-[360px] w-full resize-none rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-bg)] px-3 py-3 font-[var(--oc-mono)] text-[11px] leading-6 text-[var(--oc-text)] outline-none focus:border-[var(--oc-accent)]/45"
            onChange={(event) => {
              onChangeDraft(event.currentTarget.value);
            }}
          />
        </div>

        {error !== null ? (
          <div className="mt-4 rounded-md border border-[var(--oc-noise)]/30 bg-[var(--oc-noise)]/[0.06] px-3 py-2 font-[var(--oc-mono)] text-xs text-[var(--oc-noise)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            onClick={() => {
              void onCopy();
            }}
          >
            Copy DSL
          </Button>
          <Button
            type="button"
            className="bg-[var(--oc-accent)] px-4 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--oc-text)] hover:bg-[var(--oc-accent)]/85"
            onClick={onApply}
          >
            Apply DSL
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExamplesDialog({
  examples,
  onClose,
  onLoadExample,
}: {
  examples: readonly SongExample[];
  onClose: () => void;
  onLoadExample: (exampleId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--oc-bg)]/72 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-[var(--oc-panel-border)] bg-[var(--oc-surface)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--oc-mono)] text-sm font-semibold uppercase tracking-[0.18em] text-[var(--oc-text)]">
              Examples
            </h2>
            <p className="mt-2 max-w-2xl font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-text-muted)]">
              Load a built-in song into the editor. This replaces the current song and clears any stale share hash
              until you copy a new link.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] px-3 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          {examples.map((example) => (
            <div
              key={example.id}
              className="rounded-lg border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--oc-text-faint)]">
                    Built-in Example
                  </div>
                  <h3 className="mt-1 font-[var(--oc-display)] text-2xl leading-none text-[var(--oc-text)]">{example.name}</h3>
                  <div className="mt-2 font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--oc-accent)]">
                    by {example.author}
                  </div>
                  <p className="mt-3 max-w-[58ch] font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-text-muted)]">
                    {example.summary}
                  </p>
                </div>
                <Button
                  type="button"
                  className="shrink-0 bg-[var(--oc-accent)] px-4 font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--oc-text)] hover:bg-[var(--oc-accent)]/85"
                  aria-label={`Load example ${example.name}`}
                  onClick={() => {
                    onLoadExample(example.id);
                  }}
                >
                  Load Example
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackArrangementEditor({
  engineMode,
  trackId,
  loopLength,
  draft,
  error,
  samples,
  onChangeDraft,
  onClose,
  onApply,
}: {
  engineMode: SongDocument["meta"]["engineMode"];
  trackId: MelodicTrackId | TriggerTrackId;
  loopLength: number;
  draft: string;
  error: string | null;
  samples: SongDocument["samples"];
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const trackLabel = labelByTrackId[trackId];
  const accentColor = waveformLineColorByTrackId[trackId];
  const helperCopy =
    trackId === "noise"
      ? `One trigger per line in the format 1: short P3 or 1: long P12. Preset aliases (${noiseTriggerPresets.map((preset) => preset.id).join(", ")}) are also accepted on paste. Steps above ${loopLength} are ignored when you apply.`
      : trackId === "sample"
        ? getSampleArrangementHelperCopy(engineMode, loopLength, samples[0]?.id ?? "mic-001")
        : trackId === "pulse1" || trackId === "pulse2"
          ? `One pulse note per line in the format 1: E4 @25% or 1-4: E4 @12.5% for sustained notes. The duty suffix is optional and defaults to 50%. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`
          : `One note per line in the format 1: E4 or 1-4: E4 for sustained notes. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`;
  const editorTitle =
    trackId === "noise" ? "Noise Trigger Map" : trackId === "sample" ? "PCM Trigger Map" : "Voice Arrangement";
  const labelSuffix =
    trackId === "noise" ? "trigger text" : trackId === "sample" ? "trigger text" : "arrangement text";

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <Button
        aria-label="Close arrangement editor"
        className="absolute inset-0 h-auto w-auto border-0 bg-[var(--oc-bg)]/70 p-0 shadow-none ring-0 backdrop-blur-[2px] hover:bg-[var(--oc-bg)]/70"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--oc-panel-border)] bg-[var(--oc-surface)] p-5 shadow-2xl shadow-[var(--oc-bg)]/60">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oc-text-faint)]">
              {editorTitle}
            </p>
            <h2
              className="mt-1 font-[var(--oc-mono)] text-lg font-bold uppercase tracking-[0.1em]"
              style={{ color: accentColor }}
            >
              {trackLabel}
            </h2>
            <p className="mt-2 max-w-xl font-[var(--oc-mono)] text-[10px] leading-5 text-[var(--oc-text-muted)]">
              {helperCopy}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-md border border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <label
          htmlFor={`arrangement-${trackId}`}
          className="mb-2 block font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--oc-text-muted)]"
        >
          {trackLabel} {trackId === "noise" || trackId === "sample" ? "Trigger Text" : "Arrangement Text"}
        </label>
        <SkinTextarea
          id={`arrangement-${trackId}`}
          aria-label={`${trackLabel} ${labelSuffix}`}
          value={draft}
          autoFocus
          spellCheck={false}
          className="min-h-[360px] w-full rounded-xl border border-[var(--oc-panel-border)] bg-[var(--oc-panel-bg)] px-4 py-3 font-[var(--oc-mono)] text-sm leading-6 text-[var(--oc-text)] outline-none transition focus:border-[var(--oc-border-bright)]"
          onChange={(event) => {
            onChangeDraft(event.currentTarget.value);
          }}
        />

        {error !== null ? (
          <div className="mt-3 rounded-lg border border-[var(--oc-noise)]/35 bg-[var(--oc-noise)]/[0.08] px-3 py-2 font-[var(--oc-mono)] text-[10px] text-[var(--oc-noise)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-md border-[var(--oc-panel-border)] bg-[var(--oc-btn-subtle-bg)] font-[var(--oc-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--oc-text-muted)] hover:bg-[var(--oc-btn-subtle-hover)] hover:text-[var(--oc-text)]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md font-[var(--oc-mono)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--oc-bg)]"
            style={{ backgroundColor: accentColor }}
            onClick={onApply}
          >
            Apply Arrangement
          </Button>
        </div>
      </div>
    </div>
  );
}
