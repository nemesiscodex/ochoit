import { cn } from "@ochoit/ui/lib/utils";
import { Toast, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const phoneQuery = "(max-width: 47.99rem)";

// On a phone a corner toast lands on the voice lanes, so it drops in at the top centre and keeps the Play row clear:
// below 640px it covers the brand row above Play, from 640px it sits under the first row, which holds Play.
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia(phoneQuery);
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isPhone;
}

// The region needs browser layout APIs, so it mounts after hydration.
function Toaster() {
  const [mounted, setMounted] = useState(false);
  const isPhone = useIsPhone();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <ToastRegion
      side={isPhone ? "top" : "bottom"}
      align={isPhone ? "center" : "end"}
      className={cn(
        "fixed z-50 w-[min(22rem,calc(100vw-2rem))]",
        isPhone
          ? "top-[calc(8px+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 sm:top-[calc(62px+env(safe-area-inset-top))]"
          : "right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))]",
      )}
    >
      {() => (
        <Toast
          render={(props, state) => (
            <li {...props} inert={state.leaving || (!state.expanded && state.index > 0) || undefined} />
          )}
          className="flex items-start gap-3 rounded-panel border border-band-edge bg-band py-3 pr-10 pl-4 text-band-ink shadow-pop data-[type=error]:border-signal"
        >
          <div className="min-w-0">
            <ToastTitle className="text-sm font-semibold" />
            <ToastDescription className="mt-0.5 text-[13px] text-band-muted" />
          </div>
          <ToastClose
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 inline-flex size-6 cursor-pointer pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 items-center justify-center rounded-[4px] text-band-muted hover:bg-band-raised hover:text-band-ink"
          >
            <X className="size-3.5" />
          </ToastClose>
        </Toast>
      )}
    </ToastRegion>
  );
}

export { Toaster, toast };
