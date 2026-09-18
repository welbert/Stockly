import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_CATALOG, CardKey, SIZE_DIMENSIONS } from "../components/dashboard-cards/catalog";
import { getDashboardLayout, saveDashboardLayout, CardSize, DashboardLayoutItem } from "../lib/api";
import { logger } from "../logger";

const AUTOSAVE_DELAY_MS = 500;

/** Drives the Dashboard's edit mode: layout state, autosave, and the
 * "Cancelar" undo — see `docs/frontend.md`'s Dashboard section. */
export function useDashboardLayout() {
  const [items, setItems] = useState<DashboardLayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Snapshot of the layout when edit mode is entered — lets "Cancelar" undo
  // everything autosaved during the editing session, not just the visual state.
  const snapshotRef = useRef<DashboardLayoutItem[] | null>(null);
  // Chains every outgoing save after the previous one settles — two quick
  // actions (e.g. adding two cards back to back) each fire their own
  // `save_dashboard_layout` call, and nothing guarantees those independent
  // Tauri IPC round-trips land at the backend in the order they were sent.
  // Without this, the *older* (smaller) list could overwrite the newer one
  // in the DB even though the UI already shows both additions — invisible
  // until the next reload, when the "lost" card reappears as addable again.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getDashboardLayout());
    } catch (err) {
      logger.error("falha ao carregar layout do dashboard", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function save(next: DashboardLayoutItem[]) {
    saveChain.current = saveChain.current.finally(() =>
      saveDashboardLayout(next).catch((err) => logger.error("falha ao salvar layout do dashboard", err)),
    );
  }

  // Autosave with debounce — only matters for drag/resize, which fires
  // `onLayoutChange` many times a second during the gesture; saving on every
  // single one would hammer the DB for nothing.
  function persistDebounced(next: DashboardLayoutItem[]) {
    setItems(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), AUTOSAVE_DELAY_MS);
  }

  // Discrete actions (one click = one change) save immediately — debouncing
  // here would open a window where closing the app right after loses the
  // change (e.g. remove a card, close before 500ms pass, it comes back).
  function persistImmediate(next: DashboardLayoutItem[]) {
    setItems(next);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    save(next);
  }

  /** Forces a still-pending drag/resize save through right away — called when leaving edit mode. */
  function flush() {
    if (!saveTimer.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    save(items);
  }

  function updateLayout(positions: { cardKey: string; x: number; y: number; size: CardSize }[]) {
    const byKey = new Map(positions.map((p) => [p.cardKey, p]));
    persistDebounced(
      items.map((it) => {
        const pos = byKey.get(it.cardKey);
        return pos ? { ...it, x: pos.x, y: pos.y, size: pos.size } : it;
      }),
    );
  }

  function addCard(cardKey: CardKey) {
    // Re-appended at the current bottom either way — a re-added card (one
    // that was removed, not brand new) used to keep its old x/y as-is, which
    // could land right on top of whatever the user rearranged into that spot
    // since removing it. Its previous `size` is kept, just not the position.
    const visible = items.filter((it) => it.visible);
    const maxY = visible.reduce((max, it) => Math.max(max, it.y + SIZE_DIMENSIONS[it.size].h), 0);
    const existing = items.find((it) => it.cardKey === cardKey);
    if (existing) {
      persistImmediate(items.map((it) => (it.cardKey === cardKey ? { ...it, x: 0, y: maxY, visible: true } : it)));
    } else {
      const defaultSize = CARD_CATALOG[cardKey].allowedSizes[0];
      persistImmediate([...items, { cardKey, x: 0, y: maxY, size: defaultSize, visible: true }]);
    }
  }

  function removeCard(cardKey: string) {
    persistImmediate(items.map((it) => (it.cardKey === cardKey ? { ...it, visible: false } : it)));
  }

  function enterEditMode() {
    snapshotRef.current = items;
    setEditMode(true);
  }

  /** Leaves edit mode keeping the changes — just makes sure nothing is still stuck in the debounce. */
  function confirmEdit() {
    flush();
    snapshotRef.current = null;
    setEditMode(false);
  }

  /** Undoes everything autosaved during the editing session, restoring and re-saving the entry snapshot. */
  function cancelEdit() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    setEditMode(false);
    if (!snapshot) return;
    setItems(snapshot);
    save(snapshot);
  }

  return { items, loading, editMode, enterEditMode, confirmEdit, cancelEdit, updateLayout, addCard, removeCard, reload };
}
