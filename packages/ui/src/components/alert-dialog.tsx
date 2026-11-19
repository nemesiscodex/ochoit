import { buttonVariants } from "@ochoit/ui/components/button";
import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  AlertDialog,
  AlertDialogClose as AlertDialogClosePart,
  AlertDialogContent as AlertDialogContentPart,
  AlertDialogDescription as AlertDialogDescriptionPart,
  AlertDialogTitle as AlertDialogTitlePart,
  AlertDialogTrigger,
  createConfirm,
} from "@ui-sdk/react/alert-dialog";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

type AlertDialogContentProps<Payload> = Omit<ComponentProps<typeof AlertDialogContentPart<Payload>>, "className"> & {
  className?: string;
};

// Like DialogContent, it sits in the browser's top layer and its ::backdrop dims the page.
function AlertDialogContent<Payload = unknown>({ className, ...props }: AlertDialogContentProps<Payload>) {
  return (
    <AlertDialogContentPart<Payload>
      className={cn(
        "inset-0 m-auto h-fit flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 text-ink shadow-pop",
        "backdrop:bg-scrim backdrop:backdrop-blur-[2px]",
        "transition-[opacity,translate] duration-150 ease-out data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:translate-y-2 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: StyledProps<typeof AlertDialogTitlePart>) {
  return (
    <AlertDialogTitlePart className={cn("font-screen text-[28px] leading-none font-normal text-pretty", className)} {...props} />
  );
}

function AlertDialogDescription({ className, ...props }: StyledProps<typeof AlertDialogDescriptionPart>) {
  return <AlertDialogDescriptionPart className={cn("text-sm text-ink-muted text-pretty", className)} {...props} />;
}

function AlertDialogActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2", className)} {...props} />;
}

type AlertDialogCloseProps = StyledProps<typeof AlertDialogClosePart> & VariantProps<typeof buttonVariants>;

function AlertDialogClose({ className, variant = "outline", size, ...props }: AlertDialogCloseProps) {
  return <AlertDialogClosePart className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  createConfirm,
};
