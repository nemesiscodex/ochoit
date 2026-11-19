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
  const stepperClass =
    "inline-flex h-full w-7 shrink-0 cursor-pointer items-center justify-center text-screen-muted transition-colors hover:text-screen-ink data-disabled:cursor-not-allowed data-disabled:opacity-40 [&_svg]:size-3.5";

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
          "glass-well inline-flex h-8 items-stretch pointer-coarse:h-[44px] overflow-hidden rounded-control border transition-colors focus-within:border-focus",
          tone === "band" ? "border-band-edge" : "border-line-strong",
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
            "w-12 min-w-0 bg-transparent text-center font-mono text-[14px] leading-none font-semibold text-screen-ink outline-none",
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
