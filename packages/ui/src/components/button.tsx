import { cn } from "@ochoit/ui/lib/utils";
import { Button as ButtonPart } from "@ui-sdk/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,translate] duration-100 select-none active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-45 data-disabled:active:translate-y-0 data-pending:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-line-strong bg-surface-2 text-ink shadow-raised hover:bg-surface-1 aria-expanded:bg-surface-1 data-open:bg-surface-1",
        outline:
          "border-line-strong bg-transparent text-ink hover:bg-surface-2 aria-expanded:bg-surface-2 data-open:bg-surface-2",
        ghost:
          "border-transparent bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink aria-expanded:bg-surface-2 data-open:bg-surface-2",
        primary:
          "border-signal-edge bg-signal bg-linear-to-b from-[color-mix(in_srgb,var(--signal)_88%,white)] to-signal text-signal-ink shadow-raised hover:to-signal-hover",
        danger:
          "border-line-strong bg-transparent text-signal-text hover:border-signal-edge hover:bg-signal hover:text-signal-ink",
        band:
          "border-band-edge bg-linear-to-b from-band-raised to-band-raised-lo font-semibold text-band-ink shadow-raised hover:from-[color-mix(in_srgb,var(--band-raised)_88%,white)] aria-expanded:shadow-pressed data-open:shadow-pressed",
        screen:
          "border-screen-edge bg-screen-edge/10 text-screen-ink hover:bg-screen-edge/25 aria-expanded:bg-screen-edge/25 data-open:bg-screen-edge/25",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-[13px]",
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-4 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = Omit<ComponentProps<typeof ButtonPart>, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string };

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <ButtonPart type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants, type ButtonProps };
