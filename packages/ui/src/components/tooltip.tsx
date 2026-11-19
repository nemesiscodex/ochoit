import { cn } from "@ochoit/ui/lib/utils";
import {
  Tooltip as TooltipRoot,
  TooltipContent as TooltipContentPart,
  TooltipShortcut,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip";
import type { ComponentProps } from "react";

function Tooltip({ delay = 450, ...props }: ComponentProps<typeof TooltipRoot>) {
  return <TooltipRoot delay={delay} {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: Omit<ComponentProps<typeof TooltipContentPart>, "className"> & { className?: string }) {
  return (
    <TooltipContentPart
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "z-50 max-w-64 rounded-control bg-band px-2.5 py-1.5 text-xs leading-snug text-band-ink shadow-pop",
        "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0",
        "[&_[data-slot=tooltip-shortcut]]:ml-2 [&_[data-slot=tooltip-shortcut]]:text-band-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger };
