import { useMemo, useState } from "react";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { gridBounds } from "react-grid-layout/core";
import { useDashboardLayout } from "../../hooks/useDashboardLayout";
import { DashboardHelpModal } from "../DashboardHelpModal";
import { Tooltip } from "../Tooltip";
import { AddCardDrawer } from "./AddCardDrawer";
import { CARD_CATALOG, CardKey, GRID_COLS, SIZE_DIMENSIONS } from "./catalog";
import { allowedSizeConstraint, sizeFromDimensions } from "./gridConstraints";
import type { DashboardCardProps } from "./types";

const ROW_HEIGHT = 180;
const GRID_MARGIN: readonly [number, number] = [16, 16];

/** Computed once (`CARD_CATALOG` is static) — `react-grid-layout` deep-compares
 * its `layout` prop using `fast-equals`, which treats functions by reference,
 * not by behavior. `allowedSizeConstraint` returns a closure, so building a
 * fresh one inside `layout`'s useMemo (as this used to) meant every recompute
 * produced a "different" layout by that comparison alone, even with identical
 * x/y/w/h — react-grid-layout would then treat it as an external layout
 * change, fire `onLayoutChange`, which updates this component's own state,
 * triggering another recompute, forever ("Maximum update depth exceeded").
 * Caching the constraint object here keeps it referentially stable across
 * renders, so equality actually holds once nothing real has changed. */
const CARD_CONSTRAINTS = Object.fromEntries(
  (Object.keys(CARD_CATALOG) as CardKey[]).map((key) => [key, [allowedSizeConstraint(CARD_CATALOG[key].allowedSizes)]]),
) as Record<CardKey, ReturnType<typeof allowedSizeConstraint>[]>;

type Props = {
  cardProps: DashboardCardProps;
};

/** Draggable/resizable card grid — same architecture as the sibling
 * CashVault project (`react-grid-layout` v2's `GridLayout` + `useContainerWidth`
 * for the screen-width delimiter, a catalog of "dumb" components, per-user
 * persisted layout, and an edit mode with an undo). See `docs/frontend.md`. */
export function DashboardGrid({ cardProps }: Props) {
  const { items, loading, editMode, enterEditMode, confirmEdit, cancelEdit, updateLayout, addCard, removeCard } = useDashboardLayout();
  const { width, containerRef, mounted } = useContainerWidth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Memoized on `items` itself (not recomputed as a fresh array every render
  // regardless of cause) — `layout` below depends on this, and an unstable
  // dependency here would defeat that memoization the same way the
  // constraints closures did (see `CARD_CONSTRAINTS` above).
  const visibleItems = useMemo(() => items.filter((it) => it.visible), [items]);
  const hiddenKeys = (Object.keys(CARD_CATALOG) as CardKey[]).filter((key) => !visibleItems.some((it) => it.cardKey === key));

  const layout: LayoutItem[] = useMemo(
    () =>
      visibleItems.map((it) => {
        const dim = SIZE_DIMENSIONS[it.size];
        return {
          i: it.cardKey,
          x: it.x,
          y: it.y,
          w: dim.w,
          h: dim.h,
          constraints: CARD_CONSTRAINTS[it.cardKey as CardKey],
        };
      }),
    [visibleItems],
  );

  function handleLayoutChange(nextLayout: Layout) {
    updateLayout(nextLayout.map((it) => ({ cardKey: it.i, x: it.x, y: it.y, size: sizeFromDimensions(it.w, it.h) })));
  }

  if (loading) {
    return <div className="text-theme-3">Carregando dashboard...</div>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        {editMode && (
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="Ver como personalizar o dashboard"
            className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">?</span>
            Clique aqui para ajuda
          </button>
        )}
        {editMode && (
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="rounded-full border border-theme-border bg-theme-surface px-4 py-1.5 text-xs font-semibold text-theme-1 hover:border-primary/50"
          >
            + Adicionar card
          </button>
        )}
        {editMode && (
          <button
            onClick={cancelEdit}
            className="rounded-full border border-theme-border bg-theme-surface px-4 py-1.5 text-xs font-semibold text-theme-3 transition-colors hover:border-danger/50 hover:text-danger"
          >
            ✕ Cancelar
          </button>
        )}
        <button
          onClick={editMode ? confirmEdit : enterEditMode}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
            editMode
              ? "border-primary bg-primary-soft text-primary"
              : "border-theme-border bg-theme-surface text-theme-3 hover:border-primary/50 hover:text-theme-1"
          }`}
        >
          {editMode ? "✓ Concluir" : "✎ Personalizar"}
        </button>
      </div>

      {editMode && drawerOpen && (
        <AddCardDrawer
          hiddenKeys={hiddenKeys}
          // Stays open after each pick (same reasoning as Venda's
          // StockBrowserModal) — the just-added card simply disappears from
          // `hiddenKeys` on the next render, so several can be added in a row
          // without reopening the drawer every time.
          onAdd={(key) => addCard(key)}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/*
        `containerRef` is measurement-only (`useContainerWidth`) — it needs to
        stay at 100% of the available width to measure correctly, so the
        dashed outline can't go on it (it would then follow the whole
        screen, not the grid). The outline goes on the inner wrapper instead,
        sized to the grid's actual `width` — this is the screen-size
        delimiter: it marks exactly where the editable area ends, even with
        empty space left over to the right on a wide monitor.
      */}
      <div ref={containerRef}>
        {mounted && (
          <div style={{ width }} className={editMode ? "rounded-2xl border-2 border-dashed border-primary/50 p-3" : undefined}>
            <GridLayout
              width={editMode ? width - 24 : width}
              layout={layout}
              gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: GRID_MARGIN, containerPadding: [0, 0] }}
              dragConfig={{ enabled: editMode }}
              resizeConfig={{ enabled: editMode, handles: ["se"] }}
              constraints={[gridBounds]}
              onLayoutChange={handleLayoutChange}
            >
              {visibleItems.map((it) => {
                const entry = CARD_CATALOG[it.cardKey as CardKey] as (typeof CARD_CATALOG)[CardKey] | undefined;
                if (!entry) return null;
                const Card = entry.component;
                return (
                  <div key={it.cardKey} className="group relative h-full">
                    {/* Poking half outside the card's top-right corner (-top-2,
                        not top-2) on purpose — sitting inside the card would
                        overlap a title/hint header's own text (e.g. "9 itens"). */}
                    <span className="absolute -top-2 right-2 z-10">
                      <Tooltip text={entry.description}>
                        <button
                          type="button"
                          tabIndex={0}
                          aria-label={entry.description}
                          className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-theme-border bg-theme-surface text-[10px] text-theme-3 hover:border-primary/50 hover:text-theme-1"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </span>
                    {editMode && (
                      <button
                        onClick={() => removeCard(it.cardKey)}
                        className="absolute -top-2 right-8 z-10 rounded-full border border-theme-border bg-theme-surface px-2 py-0.5 text-xs text-theme-3 opacity-0 transition-opacity hover:border-danger hover:text-danger group-hover:opacity-100"
                        title="Remover card"
                      >
                        ✕
                      </button>
                    )}
                    <Card {...cardProps} />
                  </div>
                );
              })}
            </GridLayout>
          </div>
        )}
      </div>

      {showHelp && <DashboardHelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
