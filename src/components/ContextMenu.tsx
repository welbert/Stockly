import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** Generic right-click context menu, reused across listings with per-row
 * actions (Estoque, Usuários, Categorias) — the browser's own context menu is
 * disabled globally (see main.tsx), so this is what covers the right mouse
 * button in the app. The actions shown come from the caller (each listing
 * already decides which actions fit its profile/row) — this component only
 * handles positioning and closing. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left }}
      className="z-50 min-w-[170px] overflow-hidden rounded-lg border border-theme-border bg-theme-surface py-1 shadow-xl"
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`block w-full px-3 py-2 text-left text-sm hover:bg-theme-hover-strong ${item.danger ? "text-danger" : "text-theme-1"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
