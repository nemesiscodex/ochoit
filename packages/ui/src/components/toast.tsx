import { cn } from "@ochoit/ui/lib/utils";
import { Toast, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

// The region needs browser layout APIs, so it mounts after hydration.
function Toaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <ToastRegion side="bottom" align="end" className="fixed right-4 bottom-4 z-[300] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {() => (
        <Toast
          className={cn(
            "relative flex items-start gap-3 rounded-panel border border-band-raised bg-band py-3 pr-10 pl-4 text-band-ink shadow-pop",
            "transition-[opacity,translate] duration-200 ease-out data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:opacity-0",
            "data-[type=error]:border-signal",
          )}
        >
          <div className="min-w-0">
            <ToastTitle className="text-sm font-semibold" />
            <ToastDescription className="mt-0.5 text-[13px] text-band-muted" />
          </div>
          <ToastClose
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-[4px] text-band-muted hover:bg-band-raised hover:text-band-ink"
          >
            <X className="size-3.5" />
          </ToastClose>
        </Toast>
      )}
    </ToastRegion>
  );
}

export { Toaster, toast };
