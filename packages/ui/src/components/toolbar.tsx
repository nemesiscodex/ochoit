import { buttonVariants } from "@ochoit/ui/components/button";
import { cn, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Toolbar as ToolbarPart,
  ToolbarButton as ToolbarButtonPart,
  ToolbarGroup as ToolbarGroupPart,
  ToolbarSeparator as ToolbarSeparatorPart,
} from "@ui-sdk/react/toolbar";
import type { VariantProps } from "class-variance-authority";

function Toolbar({ className, ...props }: StyledProps<typeof ToolbarPart>) {
  return <ToolbarPart className={cn("flex flex-wrap items-center gap-x-2 gap-y-2", className)} {...props} />;
}

type ToolbarButtonProps = StyledProps<typeof ToolbarButtonPart> & VariantProps<typeof buttonVariants>;

function ToolbarButton({ className, variant = "outline", size = "sm", ...props }: ToolbarButtonProps) {
  return <ToolbarButtonPart className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

function ToolbarGroup({ className, ...props }: StyledProps<typeof ToolbarGroupPart>) {
  return <ToolbarGroupPart className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

function ToolbarSeparator({ className, ...props }: StyledProps<typeof ToolbarSeparatorPart>) {
  return <ToolbarSeparatorPart className={cn("mx-1 h-6 w-px self-center bg-line", className)} {...props} />;
}

export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator, type ToolbarButtonProps };
