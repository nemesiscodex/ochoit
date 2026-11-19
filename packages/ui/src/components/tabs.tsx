import { cn, type StyledContainerProps, type StyledProps } from "@ochoit/ui/lib/utils";
import {
  Tabs as TabsPart,
  TabsIndicator,
  TabsList as TabsListPart,
  TabsPanel as TabsPanelPart,
  TabsTab as TabsTabPart,
} from "@ui-sdk/react/tabs";

function Tabs({ className, ...props }: StyledProps<typeof TabsPart>) {
  return <TabsPart className={cn("flex min-h-0 flex-col", className)} {...props} />;
}

function TabsList({ className, children, ...props }: StyledContainerProps<typeof TabsListPart>) {
  return (
    <TabsListPart className={cn("relative flex items-stretch gap-5 border-b border-line px-4 pt-1", className)} {...props}>
      {children}
      <TabsIndicator className="absolute bottom-[-1px] left-(--active-tab-left) h-[3px] w-(--active-tab-width) bg-ink transition-[left,width] duration-150 ease-out" />
    </TabsListPart>
  );
}

function TabsTab({ className, ...props }: StyledProps<typeof TabsTabPart>) {
  return (
    <TabsTabPart
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-1.5 font-screen text-[23px] leading-none text-ink-muted transition-colors hover:text-ink data-selected:text-ink data-disabled:cursor-not-allowed data-disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: StyledProps<typeof TabsPanelPart>) {
  return <TabsPanelPart className={cn("min-h-0 flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsPanel, TabsTab };
