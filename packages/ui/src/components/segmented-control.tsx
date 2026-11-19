import { cn, type StyledContainerProps, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  SegmentedControl as SegmentedControlPart,
  SegmentedControlIndicator,
  SegmentedControlItem as SegmentedControlItemPart,
} from "@ui-sdk/react/segmented-control";

function SegmentedControl({ className, children, ...props }: StyledContainerProps<typeof SegmentedControlPart>) {
  return (
    <SegmentedControlPart
      className={cn(
        "relative inline-flex h-9 items-center rounded-control border border-line-strong bg-surface-sunken p-0.5",
        className,
      )}
      {...props}
    >
      <SegmentedControlIndicator className="absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-[4px] bg-ink shadow-[0_0_10px_color-mix(in_srgb,var(--ink)_35%,transparent)] transition-[left,width] duration-150 ease-out" />
      {children}
    </SegmentedControlPart>
  );
}

function SegmentedControlItem({ className, ...props }: StyledProps<typeof SegmentedControlItemPart>) {
  return (
    <SegmentedControlItemPart
      className={cn(
        "relative z-[1] inline-flex h-full min-w-8 cursor-pointer items-center justify-center rounded-[4px] px-2 text-xs font-semibold text-ink-muted transition-colors hover:text-ink data-checked:text-surface-0 data-disabled:cursor-not-allowed data-disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedControl, SegmentedControlItem };
