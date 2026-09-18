import type { LayoutConstraint } from "react-grid-layout/core";
import type { CardSize } from "../../lib/api";
import { SIZE_DIMENSIONS } from "./catalog";

/** Distance between two sizes in grid units — used to find the closest one. */
function dimensionDistance(a: { w: number; h: number }, b: { w: number; h: number }): number {
  return Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
}

/** Resize always snaps to one of the card's allowed sizes — never a free-form
 * per-pixel/column resize. On every proposed w/h during the drag, picks the
 * closest allowed size. */
export function allowedSizeConstraint(allowedSizes: CardSize[]): LayoutConstraint {
  const candidates = allowedSizes.map((size) => SIZE_DIMENSIONS[size]);
  return {
    name: "allowed-size",
    constrainSize(_item: unknown, w: number, h: number) {
      let best = candidates[0];
      let bestDist = Infinity;
      for (const candidate of candidates) {
        const dist = dimensionDistance(candidate, { w, h });
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }
      return best;
    },
  };
}

/** Inverse of `SIZE_DIMENSIONS` — after the snap, w/h should match a size
 * exactly; falls back defensively to the closest one. */
export function sizeFromDimensions(w: number, h: number): CardSize {
  let best: CardSize = "1x1";
  let bestDist = Infinity;
  for (const [size, dim] of Object.entries(SIZE_DIMENSIONS) as [CardSize, { w: number; h: number }][]) {
    const dist = dimensionDistance(dim, { w, h });
    if (dist < bestDist) {
      bestDist = dist;
      best = size;
    }
  }
  return best;
}
