import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import { Toggle as TogglePart, ToggleGroup as ToggleGroupPart, ToggleIcon } from "@ui-sdk/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border text-[13px] font-medium whitespace-nowrap transition-[color,background-color,border-color,scale] duration-100 ease-snap select-none active:scale-[0.97] data-disabled:cursor-not-allowed data-disabled:opacity-45 data-disabled:active:scale-100 pointer-coarse:min-h-[44px] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-line-strong bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink data-pressed:border-ink data-pressed:bg-ink data-pressed:text-surface-0",
        band: "border-band-edge bg-linear-to-b from-band-raised to-band-raised-lo text-band-muted shadow-raised hover:text-band-ink data-pressed:translate-y-px data-pressed:from-surface-sunken data-pressed:to-band-raised-lo data-pressed:text-beam data-pressed:shadow-pressed data-pressed:[&_svg]:drop-shadow-[0_0_4px_rgb(200_225_255/0.8)]",
        signal:
          "border-line-strong bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink data-pressed:border-signal-edge data-pressed:bg-signal data-pressed:text-signal-ink",
        screen:
          "border-screen-edge bg-screen-edge/10 text-screen-ink hover:bg-screen-edge/25 data-pressed:border-screen-ink data-pressed:bg-screen-ink data-pressed:text-glass data-pressed:shadow-[0_0_10px_rgb(170_205_255/0.45)]",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        xs: "h-7 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-9 pointer-coarse:min-w-[44px]",
        "icon-sm": "size-8 pointer-coarse:min-w-[44px]",
        "icon-xs": "size-7 pointer-coarse:min-w-[44px] [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ToggleProps = StyledProps<typeof TogglePart> & VariantProps<typeof toggleVariants>;

function Toggle({ className, variant, size, ...props }: ToggleProps) {
  return <TogglePart className={cn(toggleVariants({ variant, size }), className)} {...props} />;
}

function ToggleGroup({ className, ...props }: StyledProps<typeof ToggleGroupPart>) {
  return <ToggleGroupPart className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Toggle, ToggleGroup, ToggleIcon, toggleVariants, type ToggleProps };
