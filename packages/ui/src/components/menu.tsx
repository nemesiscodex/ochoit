import { cn, type StyledContainerProps, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Menu,
  MenuCheckboxItem as MenuCheckboxItemPart,
  MenuContent as MenuContentPart,
  MenuGroup,
  MenuGroupLabel as MenuGroupLabelPart,
  MenuItem as MenuItemPart,
  MenuItemIcon,
  MenuItemIndicator,
  MenuSeparator as MenuSeparatorPart,
  MenuShortcut as MenuShortcutPart,
  MenuTrigger,
} from "@ui-sdk/react/menu";
import { Check } from "lucide-react";

function MenuContent({ className, sideOffset = 6, ...props }: StyledProps<typeof MenuContentPart>) {
  return (
    <MenuContentPart
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-52 rounded-panel border border-line-strong bg-surface-2 p-1 text-sm text-ink shadow-pop",
        "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

const itemClass =
  "relative flex min-h-8 cursor-pointer pointer-coarse:min-h-[44px] items-center gap-2 rounded-[5px] px-2 py-1.5 outline-none select-none data-highlighted:bg-band-raised data-disabled:cursor-not-allowed data-disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";

function MenuItem({ className, ...props }: StyledProps<typeof MenuItemPart>) {
  return <MenuItemPart className={cn(itemClass, className)} {...props} />;
}

function MenuCheckboxItem({ className, children, ...props }: StyledContainerProps<typeof MenuCheckboxItemPart>) {
  return (
    <MenuCheckboxItemPart className={cn(itemClass, "pl-8", className)} {...props}>
      <MenuItemIndicator className="absolute left-2 inline-flex">
        <Check />
      </MenuItemIndicator>
      {children}
    </MenuCheckboxItemPart>
  );
}

function MenuSeparator({ className, ...props }: StyledProps<typeof MenuSeparatorPart>) {
  return <MenuSeparatorPart className={cn("mx-1 my-1 h-px bg-line", className)} {...props} />;
}

function MenuGroupLabel({ className, ...props }: StyledProps<typeof MenuGroupLabelPart>) {
  return <MenuGroupLabelPart className={cn("px-2 pt-1.5 pb-1 text-xs font-medium text-ink-faint", className)} {...props} />;
}

function MenuShortcut({ className, ...props }: StyledProps<typeof MenuShortcutPart>) {
  return <MenuShortcutPart className={cn("ml-auto pl-4 text-xs text-ink-faint", className)} {...props} />;
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
};
