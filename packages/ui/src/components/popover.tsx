import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Popover,
  PopoverClose,
  PopoverContent as PopoverContentPart,
  PopoverDescription as PopoverDescriptionPart,
  PopoverTitle as PopoverTitlePart,
  PopoverTrigger,
} from "@ui-sdk/react/popover";

function PopoverContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: StyledProps<typeof PopoverContentPart>) {
  return (
    <PopoverContentPart
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "max-h-(--available-height) max-w-[calc(100vw-1rem)] overflow-auto overscroll-contain rounded-panel border border-line-strong bg-surface-2 p-3 text-ink shadow-pop",
        "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: StyledProps<typeof PopoverTitlePart>) {
  return <PopoverTitlePart className={cn("font-screen text-[22px] leading-none font-normal", className)} {...props} />;
}

function PopoverDescription({ className, ...props }: StyledProps<typeof PopoverDescriptionPart>) {
  return <PopoverDescriptionPart className={cn("text-xs text-ink-muted", className)} {...props} />;
}

export { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger };
