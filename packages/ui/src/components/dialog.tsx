import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent as DialogContentPart,
  DialogDescription as DialogDescriptionPart,
  DialogTitle as DialogTitlePart,
  DialogTrigger,
} from "@ui-sdk/react/dialog";

// The content sits in the browser's top layer; its ::backdrop dims the page.
function DialogContent({ className, ...props }: StyledProps<typeof DialogContentPart>) {
  return (
    <DialogContentPart
      className={cn(
        "inset-0 m-auto h-fit flex max-h-[min(44rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-panel border border-line bg-surface-1 p-0 text-ink shadow-pop",
        "backdrop:bg-scrim backdrop:backdrop-blur-[2px]",
        "transition-[opacity,translate] duration-150 ease-out data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:translate-y-2 data-ending-style:opacity-0",
        "data-[presentation=sheet]:mb-0 data-[presentation=sheet]:w-full data-[presentation=sheet]:max-w-none data-[presentation=sheet]:rounded-b-none",
        className,
      )}
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-3", className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken/60 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: StyledProps<typeof DialogTitlePart>) {
  return <DialogTitlePart className={cn("font-screen text-[28px] leading-none font-normal", className)} {...props} />;
}

function DialogDescription({ className, ...props }: StyledProps<typeof DialogDescriptionPart>) {
  return <DialogDescriptionPart className={cn("mt-1 text-sm text-ink-muted", className)} {...props} />;
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
