import { useEffect, useState } from "react";

import type { GridMetrics } from "@/features/sequencer/step-drag";

export const stepsPerBeatGroup = 4;
export const stepGridClass = "grid grid-cols-8 gap-1 md:grid-cols-16";
export const laneColumnsClass = "lg:grid-cols-[18rem_minmax(0,1fr)]";
export const stepHeightPx = 48;

const fallbackStepWidthPx = 40;
const fallbackStepGapPx = 4;
const mediumViewportQuery = "(min-width: 768px)";

// Beats read as groups through a wider gap: cells at a beat edge give up 2px of margin. Margins shrink the cell, not
// its grid track, so every track keeps the same pitch and drag maths stays linear.
export function beatEdgeClass(firstStepIndex: number, lastStepIndex = firstStepIndex) {
  const startsBeat = firstStepIndex % stepsPerBeatGroup === 0;
  const endsBeat = lastStepIndex % stepsPerBeatGroup === stepsPerBeatGroup - 1;

  return `${startsBeat ? "ml-0.5" : ""} ${endsBeat ? "mr-0.5" : ""}`;
}

function getViewportColumnCount() {
  return window.matchMedia(mediumViewportQuery).matches ? 16 : 8;
}

export function useStepColumnCount() {
  const [columnCount, setColumnCount] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? 16 : getViewportColumnCount(),
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(mediumViewportQuery);
    const updateColumnCount = () => {
      setColumnCount(mediaQuery.matches ? 16 : 8);
    };

    updateColumnCount();
    mediaQuery.addEventListener("change", updateColumnCount);

    return () => {
      mediaQuery.removeEventListener("change", updateColumnCount);
    };
  }, []);

  return columnCount;
}

export function getGridMetrics(
  element: HTMLElement,
  gridElement: HTMLElement | null,
  columns: number | undefined,
  clientX: number,
  clientY: number,
): GridMetrics {
  const targetGrid = gridElement ?? element.closest("[data-step-grid]");
  const cellRect = (stepIndex: number) =>
    targetGrid instanceof HTMLElement
      ? (targetGrid.querySelector<HTMLElement>(`[data-step-index='${stepIndex}']`)?.getBoundingClientRect() ?? null)
      : null;
  const resolvedColumns =
    columns ??
    (targetGrid instanceof HTMLElement && typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? getViewportColumnCount()
      : 16);
  const referenceRect = cellRect(0) ?? element.getBoundingClientRect();
  const nextCellRect = cellRect(1);
  const nextRowRect = columns === undefined ? null : cellRect(columns);
  // Steps 1 and 2 sit inside a beat with no edge margin, so their distance is the exact column pitch.
  const innerPitch = (cellRect(2)?.left ?? 0) - (nextCellRect?.left ?? 0);
  const horizontalGap = nextCellRect === null ? fallbackStepGapPx : Math.max(0, nextCellRect.left - referenceRect.right);
  const verticalGap = nextRowRect === null ? fallbackStepGapPx : Math.max(0, nextRowRect.top - referenceRect.bottom);

  return {
    pointerStartX: clientX,
    pointerStartY: clientY,
    stepWidth: innerPitch > 0 ? innerPitch : referenceRect.width + horizontalGap || fallbackStepWidthPx,
    stepHeight: referenceRect.height + verticalGap || stepHeightPx,
    columns: resolvedColumns,
  };
}
