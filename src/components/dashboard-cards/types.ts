import type { DashboardData } from "../../lib/api";

/** Single prop contract passed to every card — each card reads only the
 * slice of `data` it needs, never fetches its own (see `docs/frontend.md`'s
 * Dashboard section). Kept as its own type (not inlined in `catalog.ts`) so
 * every card file can import just this, not the whole catalog. */
export type DashboardCardProps = {
  data: DashboardData;
};
