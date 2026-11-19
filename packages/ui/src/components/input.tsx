import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import { Input as InputPart } from "@ui-sdk/react/input";
import { Textarea as TextareaPart } from "@ui-sdk/react/textarea";

const fieldSurface =
  "w-full min-w-0 rounded-control border border-line-strong bg-surface-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-signal";

function Input({ className, ...props }: StyledProps<typeof InputPart>) {
  return <InputPart className={cn(fieldSurface, "h-9 px-2.5", className)} {...props} />;
}

function Textarea({ className, ...props }: StyledProps<typeof TextareaPart>) {
  return (
    <TextareaPart
      className={cn(fieldSurface, "min-h-24 px-3 py-2 font-mono text-[13px] leading-relaxed", className)}
      {...props}
    />
  );
}

export { Input, Textarea, fieldSurface };
