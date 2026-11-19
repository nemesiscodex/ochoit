import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Slider as SliderRoot,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider";
import type { CSSProperties } from "react";

type SliderProps = Omit<
  StyledProps<typeof SliderRoot>,
  "value" | "defaultValue" | "onValueChange" | "onValueCommit" | "style"
> & {
  style?: CSSProperties;
  value: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  label: string;
  accent?: string;
  // "fader" is the ribbed cap on the case; "glow" is the lit bar used on the screen.
  look?: "fader" | "glow";
};

function Slider({
  className,
  value,
  onValueChange,
  onValueCommit,
  label,
  accent = "var(--ink)",
  look = "fader",
  style,
  ...props
}: SliderProps) {
  const accentStyle: CSSProperties & { "--slider-accent": string } = { ...style, "--slider-accent": accent };

  return (
    <SliderRoot
      value={value}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] ?? value) : next)}
      onValueCommit={onValueCommit ? (next) => onValueCommit(Array.isArray(next) ? (next[0] ?? value) : next) : undefined}
      className={cn("group/slider w-full data-disabled:opacity-45", className)}
      style={accentStyle}
      {...props}
    >
      <SliderControl className="flex h-6 w-full cursor-pointer items-center touch-none group-data-disabled/slider:cursor-not-allowed">
        <SliderTrack
          className={cn(
            "relative w-full rounded-full",
            look === "fader"
              ? "h-1.5 bg-surface-sunken shadow-[inset_0_1px_2px_rgb(0_0_0/0.8),0_0_0_1px_var(--line-strong)]"
              : "h-1 bg-line-strong shadow-[0_0_6px_color-mix(in_srgb,var(--slider-accent)_40%,transparent)]",
          )}
        >
          <SliderIndicator className="h-full rounded-full bg-(--slider-accent)" />
          <SliderThumb
            aria-label={label}
            className={cn(
              "top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[scale] duration-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-dragging:scale-110",
              look === "fader"
                ? "fader-cap h-5 w-3.5 rounded-[3px]"
                : "h-4 w-2 rounded-[2px] bg-white shadow-[0_0_6px_var(--slider-accent)]",
            )}
          />
        </SliderTrack>
      </SliderControl>
    </SliderRoot>
  );
}

export { Slider, type SliderProps };
