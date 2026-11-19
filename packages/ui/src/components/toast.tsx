import { cn } from "@ochoit/ui/lib/utils";
import { Toast, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const phoneQuery = "(max-width: 47.99rem)";

// On a phone a corner toast lands on the first voice lane, so it drops in at the top centre, under the row with Play.
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
        "fixed z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2",
        isPhone ? "top-[50px] left-1/2 -translate-x-1/2" : "right-4 bottom-4",
      )}
    >
      {() => (
        <Toast
          className={cn(
            "relative flex items-start gap-3 rounded-panel border border-band-edge bg-band py-3 pr-10 pl-4 text-band-ink shadow-pop",
            "transition-[opacity,translate] duration-200 ease-snap data-starting-style:opacity-0 data-ending-style:opacity-0",
            isPhone ? "data-starting-style:-translate-y-2" : "data-starting-style:translate-y-2",
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
