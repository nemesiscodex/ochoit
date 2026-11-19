import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input";
import { Minus, Plus } from "lucide-react";

type NumberFieldProps = Omit<StyledProps<typeof NumberInput>, "value" | "defaultValue" | "onValueChange"> & {
  value: number;
  onValueChange: (value: number) => void;
  label: string;
  steppers?: boolean;
  tone?: "surface" | "band";
  inputClassName?: string;
};

function NumberField({
  className,
  value,
  onValueChange,
  label,
  steppers = false,
  tone = "surface",
  inputClassName,
  ...props
}: NumberFieldProps) {
  const stepperClass = cn(
    "inline-flex h-full w-7 shrink-0 cursor-pointer items-center justify-center transition-colors data-disabled:cursor-not-allowed data-disabled:opacity-40 [&_svg]:size-3.5",
    tone === "band" ? "text-band-muted hover:text-band-ink" : "text-ink-faint hover:text-ink",
  );

  return (
    <NumberInput
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      className={cn("inline-flex", className)}
      {...props}
    >
      <NumberInputGroup
        className={cn(
          "inline-flex h-9 items-stretch overflow-hidden rounded-control border transition-colors focus-within:border-focus",
          tone === "band" ? "border-band-raised bg-band-raised" : "border-line-strong bg-surface-2",
        )}
      >
        {steppers ? (
          <NumberInputDecrement aria-label={`Decrease ${label}`} className={stepperClass}>
            <Minus />
          </NumberInputDecrement>
        ) : null}
        <NumberInputControl
          aria-label={label}
          className={cn(
            "w-12 min-w-0 bg-transparent text-center text-sm font-semibold tabular-nums outline-none",
            tone === "band" ? "text-band-ink" : "text-ink",
            inputClassName,
          )}
        />
        {steppers ? (
          <NumberInputIncrement aria-label={`Increase ${label}`} className={stepperClass}>
            <Plus />
          </NumberInputIncrement>
        ) : null}
      </NumberInputGroup>
    </NumberInput>
  );
}

export { NumberField, type NumberFieldProps };
