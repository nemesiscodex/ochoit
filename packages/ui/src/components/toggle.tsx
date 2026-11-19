import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import { Toggle as TogglePart, ToggleGroup as ToggleGroupPart, ToggleIcon } from "@ui-sdk/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border text-[13px] font-medium whitespace-nowrap transition-colors duration-100 select-none data-disabled:cursor-not-allowed data-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-line bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink data-pressed:border-ink data-pressed:bg-ink data-pressed:text-surface-2",
        band: "border-band-edge bg-transparent text-band-muted hover:text-band-ink data-pressed:border-band-ink data-pressed:bg-band-ink data-pressed:text-band",
        signal:
          "border-line bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink data-pressed:border-signal data-pressed:bg-signal data-pressed:text-signal-ink",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        xs: "h-7 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
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
