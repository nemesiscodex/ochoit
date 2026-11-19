import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Slider as SliderRoot,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider";
import type { CSSProperties } from "react";

type SliderProps = Omit<StyledProps<typeof SliderRoot>, "value" | "defaultValue" | "onValueChange" | "onValueCommit"> & {
  value: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  label: string;
  accent?: string;
  thumbClassName?: string;
};

function Slider({
  className,
  value,
  onValueChange,
  onValueCommit,
  label,
  accent = "var(--ink)",
  thumbClassName,
  style,
  ...props
}: SliderProps) {
  return (
    <SliderRoot
      value={value}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] ?? value) : next)}
      onValueCommit={onValueCommit ? (next) => onValueCommit(Array.isArray(next) ? (next[0] ?? value) : next) : undefined}
      className={cn("group/slider w-full data-disabled:opacity-45", className)}
      style={{ "--slider-accent": accent, ...style } as unknown as CSSProperties}
      {...props}
    >
      <SliderControl className="flex h-6 w-full cursor-pointer items-center touch-none group-data-disabled/slider:cursor-not-allowed">
        <SliderTrack className="relative h-1.5 w-full rounded-full bg-line">
          <SliderIndicator className="h-full rounded-full bg-(--slider-accent)" />
          <SliderThumb
            aria-label={label}
            className={cn(
              "top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--slider-accent) bg-surface-2 shadow-raised transition-[scale] duration-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-dragging:scale-110",
              thumbClassName,
            )}
          />
        </SliderTrack>
      </SliderControl>
    </SliderRoot>
  );
}

export { Slider, type SliderProps };
