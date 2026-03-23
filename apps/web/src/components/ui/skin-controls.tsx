import { Button as ClassicButton } from "@ochoit/ui/components/button";
import { Input as ClassicInput } from "@ochoit/ui/components/input";
import {
  Tooltip as ClassicTooltip,
  TooltipContent as ClassicTooltipContent,
  TooltipProvider as ClassicTooltipProvider,
  TooltipTrigger as ClassicTooltipTrigger,
} from "@ochoit/ui/components/tooltip";
import { cn } from "@ochoit/ui/lib/utils";
import { Button as RetroButton } from "@ochoit/ui/components/ui/8bitcn/button";
import { Input as RetroInput } from "@ochoit/ui/components/ui/8bitcn/input";
import { Slider as RetroSlider } from "@ochoit/ui/components/ui/8bitcn/slider";
import { Textarea as RetroTextarea } from "@ochoit/ui/components/ui/8bitcn/textarea";
import {
  Tooltip as RetroTooltip,
  TooltipContent as RetroTooltipContent,
  TooltipProvider as RetroTooltipProvider,
  TooltipTrigger as RetroTooltipTrigger,
} from "@ochoit/ui/components/ui/8bitcn/tooltip";
import { forwardRef, type ComponentProps } from "react";

import { useIsRetroSkin } from "@/features/ui/skin-runtime";

type SkinButtonProps = ComponentProps<typeof ClassicButton>;

export const SkinButton = forwardRef<HTMLButtonElement, SkinButtonProps>(function SkinButton(
  { className, ...props },
  ref,
) {
  const isRetro = useIsRetroSkin();

  if (isRetro) {
    return <RetroButton ref={ref} className={cn("retro", className)} {...props} />;
  }

  return <ClassicButton ref={ref} className={className} {...props} />;
});

type SkinInputProps = ComponentProps<typeof ClassicInput>;

export function SkinInput({ className, ...props }: SkinInputProps) {
  const isRetro = useIsRetroSkin();

  if (isRetro) {
    return <RetroInput className={cn("retro", className)} {...props} />;
  }

  return <ClassicInput className={className} {...props} />;
}

type SkinTextareaProps = ComponentProps<"textarea">;

export function SkinTextarea({ className, ...props }: SkinTextareaProps) {
  const isRetro = useIsRetroSkin();

  if (isRetro) {
    return <RetroTextarea className={cn("retro", className)} {...props} />;
  }

  return <textarea className={className} {...props} />;
}

type SkinTooltipRootProps = ComponentProps<typeof ClassicTooltip>;
type SkinTooltipTriggerProps = ComponentProps<typeof ClassicTooltipTrigger>;
type SkinTooltipContentProps = ComponentProps<typeof ClassicTooltipContent>;
type SkinTooltipProviderProps = ComponentProps<typeof ClassicTooltipProvider>;

export function SkinTooltipProvider(props: SkinTooltipProviderProps) {
  const isRetro = useIsRetroSkin();

  return isRetro ? <RetroTooltipProvider {...props} /> : <ClassicTooltipProvider {...props} />;
}

export function SkinTooltip(props: SkinTooltipRootProps) {
  const isRetro = useIsRetroSkin();

  return isRetro ? <RetroTooltip {...props} /> : <ClassicTooltip {...props} />;
}

export function SkinTooltipTrigger(props: SkinTooltipTriggerProps) {
  const isRetro = useIsRetroSkin();

  return isRetro ? <RetroTooltipTrigger {...props} /> : <ClassicTooltipTrigger {...props} />;
}

export function SkinTooltipContent({ className, ...props }: SkinTooltipContentProps) {
  const isRetro = useIsRetroSkin();

  return isRetro ? (
    <RetroTooltipContent className={cn("retro", className)} {...props} />
  ) : (
    <ClassicTooltipContent className={className} {...props} />
  );
}

type SkinSliderProps = {
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  style?: ComponentProps<"input">["style"];
  step?: number;
  value: number;
};

export function SkinSlider({
  className,
  disabled,
  id,
  max,
  min,
  onValueChange,
  style,
  step,
  value,
  ...props
}: SkinSliderProps) {
  const isRetro = useIsRetroSkin();
  const normalizedMax = max > min ? max : min + 1;
  const normalizedValue = Math.max(min, Math.min(value, normalizedMax));

  if (isRetro) {
    return (
      <RetroSlider
        className={cn("retro", className)}
        disabled={disabled}
        id={id}
        max={normalizedMax}
        min={min}
        style={style}
        value={[normalizedValue]}
        onValueChange={(values) => {
          const nextValue = Array.isArray(values) ? values[0] : values;

          if (nextValue !== undefined) {
            onValueChange(Math.min(nextValue, max));
          }
        }}
        {...props}
      />
    );
  }

  return (
    <input
      className={className}
      disabled={disabled}
      id={id}
      max={max}
      min={min}
      style={style}
      step={step}
      type="range"
      value={normalizedValue}
      onChange={(event) => {
        onValueChange(Number(event.currentTarget.value));
      }}
      {...props}
    />
  );
}
