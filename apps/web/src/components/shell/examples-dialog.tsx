import { Button } from "@ochoit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ochoit/ui/components/dialog";

import { DialogCloseButton } from "@/components/shell/dialog-close-button";
import type { SongExample } from "@/features/song/song-examples";

export function ExamplesDialog({
  examples,
  open,
  onClose,
  onClosed,
  onLoadExample,
}: {
  examples: readonly SongExample[];
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  onLoadExample: (exampleId: string) => void;
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
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>Examples</DialogTitle>
            <DialogDescription>Loading an example replaces the current song and clears the song link.</DialogDescription>
          </div>
          <DialogCloseButton />
        </DialogHeader>
        <DialogBody>
          <ul className="grid gap-3">
            {examples.map((example) => (
              <li
                key={example.id}
                className="flex flex-col gap-3 rounded-panel border border-line bg-surface-2 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="font-screen text-[24px] leading-none font-normal text-pretty">{example.name}</h3>
                  <p className="mt-1 text-[13px] text-ink-muted">by {example.author}</p>
                  <p className="mt-2 max-w-[60ch] text-sm text-pretty text-ink-muted">{example.summary}</p>
                </div>
                <Button
                  className="self-start"
                  aria-label={`Load example ${example.name}`}
                  onClick={() => {
                    onLoadExample(example.id);
                  }}
                >
                  Load
                </Button>
              </li>
            ))}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
