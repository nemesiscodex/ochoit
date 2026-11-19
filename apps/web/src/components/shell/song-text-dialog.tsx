import { Button } from "@ochoit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ochoit/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@ochoit/ui/components/field";
import { Textarea } from "@ochoit/ui/components/input";

import { DialogCloseButton } from "@/components/shell/dialog-close-button";

export type SongTextEditor = {
  draft: string;
  error: string | null;
};

export function SongTextDialog({
  editor,
  open,
  onApply,
  onChangeDraft,
  onClose,
  onClosed,
  onCopy,
}: {
  editor: SongTextEditor | null;
  open: boolean;
  onApply: () => void;
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onClosed: () => void;
  onCopy: () => Promise<void>;
}) {
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
      <DialogContent initialFocus="textarea" className="w-[min(56rem,calc(100vw-2rem))]">
        <DialogHeader>
          <div>
            <DialogTitle>Edit song as text</DialogTitle>
            <DialogDescription>
              This is the whole song as text, the same data a share link carries. Copy it, or paste edited text and
              replace the current song with it.
            </DialogDescription>
          </div>
          <DialogCloseButton />
        </DialogHeader>
        {editor === null ? null : (
          <>
            <DialogBody>
              <Field invalid={editor.error === null ? undefined : true}>
                <FieldLabel>Song text</FieldLabel>
                <Textarea
                  value={editor.draft}
                  spellCheck={false}
                  className="h-[min(22rem,50dvh)] resize-none"
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
              <Button variant="outline" onClick={onCopy}>
                Copy text
              </Button>
              <Button onClick={onApply}>Replace song</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
