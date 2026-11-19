import { Field, FieldDescription, FieldLabel } from "@ochoit/ui/components/field";
import { Input } from "@ochoit/ui/components/input";
import { SegmentedControl, SegmentedControlItem } from "@ochoit/ui/components/segmented-control";
import { memo } from "react";
import { type SongDocument, type SongEdit } from "ochoit-lib";

import { type AudioBootstrapState } from "@/features/audio/use-audio-engine";
import { type EngineMode, formatEngineModeLabel, getPcmModeLabel, getPcmModeSummary } from "@/features/song/pcm-mode";

const engineModes = ["inspired", "authentic"] as const satisfies readonly EngineMode[];

type SongMetaProps = {
  author: string;
  bpm: number;
  engineMode: SongDocument["meta"]["engineMode"];
  engineState: AudioBootstrapState;
  loopLength: number;
  name: string;
  onEdit: (edit: SongEdit) => void;
  trackCount: number;
};

export const SongMeta = memo(function SongMeta({ author, engineMode, name, onEdit }: SongMetaProps) {
  return (
    <div className="@container">
      <div className="grid items-start gap-4 @2xl:grid-cols-2 @2xl:gap-x-8">
        <Field>
          <FieldLabel>Song name</FieldLabel>
          <Input
            name="song-name"
            autoComplete="off"
            maxLength={80}
            value={name}
            onChange={(event) => {
              onEdit({ type: "set-song-name", name: event.currentTarget.value });
            }}
          />
        </Field>
        <Field>
          <FieldLabel>Author</FieldLabel>
          <Input
            name="song-author"
            autoComplete="off"
            maxLength={80}
            value={author}
            onChange={(event) => {
              onEdit({ type: "set-song-author", author: event.currentTarget.value });
            }}
          />
        </Field>
        <EngineModeField engineMode={engineMode} onEdit={onEdit} />
      </div>
    </div>
  );
});

function EngineModeField({ engineMode, onEdit }: Pick<SongMetaProps, "engineMode" | "onEdit">) {
  return (
    <Field>
      <FieldLabel>Engine mode</FieldLabel>
      <SegmentedControl
        className="w-full"
        value={engineMode}
        onValueChange={(value) => {
          const nextMode = engineModes.find((mode) => mode === value);

          if (nextMode !== undefined) {
            onEdit({ type: "set-engine-mode", engineMode: nextMode });
          }
        }}
      >
        {engineModes.map((mode) => (
          <SegmentedControlItem key={mode} value={mode} className="flex-1 text-[13px]">
            {formatEngineModeLabel(mode)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <FieldDescription className="text-[13px] leading-relaxed text-ink-muted">
        <span className="block font-semibold text-ink">{getPcmModeLabel(engineMode)}</span>
        {getPcmModeSummary(engineMode)}
      </FieldDescription>
    </Field>
  );
}
