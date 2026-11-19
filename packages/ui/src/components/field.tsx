import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Field as FieldPart,
  FieldDescription as FieldDescriptionPart,
  FieldError as FieldErrorPart,
  FieldLabel as FieldLabelPart,
} from "@ui-sdk/react/field";

function Field({ className, ...props }: StyledProps<typeof FieldPart>) {
  return <FieldPart className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function FieldLabel({ className, ...props }: StyledProps<typeof FieldLabelPart>) {
  return <FieldLabelPart className={cn("text-[13px] font-medium text-ink-muted", className)} {...props} />;
}

function FieldDescription({ className, ...props }: StyledProps<typeof FieldDescriptionPart>) {
  return <FieldDescriptionPart className={cn("text-xs leading-snug text-ink-faint", className)} {...props} />;
}

function FieldError({ className, ...props }: StyledProps<typeof FieldErrorPart>) {
  return <FieldErrorPart className={cn("text-xs font-medium text-signal", className)} {...props} />;
}

export { Field, FieldDescription, FieldError, FieldLabel };
