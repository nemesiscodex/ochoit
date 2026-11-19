import { Button, buttonVariants } from "@ochoit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ochoit/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@ochoit/ui/components/field";
import { Textarea } from "@ochoit/ui/components/input";
import { SegmentedControl, SegmentedControlItem } from "@ochoit/ui/components/segmented-control";
import { type ArrangementTextFormat, noiseTriggerPresets, type SongDocument, type TrackId } from "ochoit-lib";

import { labelByTrackId } from "@/components/sequencer-theme";
import { DialogCloseButton } from "@/components/shell/dialog-close-button";
import { getSampleArrangementHelperCopy } from "@/features/song/pcm-mode";

export type ArrangementEditor = {
  trackId: TrackId;
  draft: string;
  error: string | null;
  textFormat: ArrangementTextFormat;
};

const swatchClassByTrackId: Record<TrackId, string> = {
  pulse1: "bg-voice-pulse1",
  pulse2: "bg-voice-pulse2",
  triangle: "bg-voice-triangle",
  noise: "bg-voice-noise",
  sample: "bg-voice-sample",
};

export function reformatArrangementDraft(draft: string, textFormat: ArrangementTextFormat) {
  const entries = draft
    .split(/\r?\n|,/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return entries.join(textFormat === "compact" ? ", " : "\n");
}

function getFormatHelp(
  trackId: TrackId,
  loopLength: number,
  engineMode: SongDocument["meta"]["engineMode"],
  samples: SongDocument["samples"],
) {
  switch (trackId) {
    case "noise":
      return `Use the format 1: short P3 or 1: long P12. Preset aliases (${noiseTriggerPresets.map((preset) => preset.id).join(", ")}) are also accepted on paste. Steps above ${loopLength} are ignored when you apply.`;
    case "sample":
      return getSampleArrangementHelperCopy(engineMode, loopLength, samples[0]?.id ?? "mic-001");
    case "pulse1":
    case "pulse2":
      return `Use the format 1: E4 @25% or 1-4: E4 @12.5% for sustained notes. The duty suffix is optional and defaults to 50%. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`;
    case "triangle":
      return `Use the format 1: E4 or 1-4: E4 for sustained notes. Notes are case-insensitive. Steps above ${loopLength} are ignored when you apply.`;
  }
}

export function ArrangementDialog({
  editor,
  engineMode,
  loopLength,
  open,
  samples,
  onApply,
  onChangeDraft,
  onChangeTextFormat,
  onClose,
  onClosed,
}: {
  editor: ArrangementEditor | null;
  engineMode: SongDocument["meta"]["engineMode"];
  loopLength: number;
  open: boolean;
  samples: SongDocument["samples"];
  onApply: () => void;
  onChangeDraft: (draft: string) => void;
  onChangeTextFormat: (textFormat: ArrangementTextFormat) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const trackLabel = editor === null ? "" : labelByTrackId[editor.trackId];
  const usesTriggers = editor?.trackId === "noise" || editor?.trackId === "sample";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClosed();
      }}
    >
      <DialogContent initialFocus="textarea" className="w-[min(44rem,calc(100vw-2rem))]">
        {editor === null ? null : (
          <>
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2">
                  <span aria-hidden="true" className={`size-3 shrink-0 rounded-[3px] ${swatchClassByTrackId[editor.trackId]}`} />
                  Edit {trackLabel} as text
                </DialogTitle>
                <DialogDescription className="text-pretty">
                  Put commas or new lines between entries. Compact keeps everything on one line for quick edits or
                  copy/paste. {getFormatHelp(editor.trackId, loopLength, engineMode, samples)}
                </DialogDescription>
              </div>
              <DialogCloseButton />
            </DialogHeader>
            <DialogBody className="flex flex-col gap-3">
              <SegmentedControl
                aria-label="Text format"
                className="self-start"
                value={editor.textFormat}
                onValueChange={(textFormat) => {
                  if (textFormat === "compact" || textFormat === "multiline") onChangeTextFormat(textFormat);
                }}
              >
                <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
                <SegmentedControlItem value="multiline">Lines</SegmentedControlItem>
              </SegmentedControl>
              <Field invalid={editor.error === null ? undefined : true}>
                <FieldLabel>
                  {trackLabel} {usesTriggers ? "trigger text" : "arrangement text"}
                </FieldLabel>
                <Textarea
                  value={editor.draft}
                  spellCheck={false}
                  className="min-h-[min(22rem,45dvh)] resize-y text-sm leading-6"
                  onChange={(event) => {
                    onChangeDraft(event.currentTarget.value);
                  }}
                />
                {editor.error === null ? null : (
                  <FieldError match role="alert">
                    {editor.error}
                  </FieldError>
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <DialogClose className={buttonVariants({ variant: "outline" })}>Cancel</DialogClose>
              <Button onClick={onApply}>Apply arrangement</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
