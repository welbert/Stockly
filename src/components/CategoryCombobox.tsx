import { useEffect, useMemo, useRef, useState } from "react";
import type { CategorySummary } from "../lib/api";
import { normalize } from "../lib/format";

interface CategoryComboboxProps {
  categories: CategorySummary[];
  value: number | null;
  onChange: (id: number | null) => void;
}

const UNDEFINED_LABEL = "Categoria indefinida";

/** Category autocomplete: type to filter, arrows/Enter/click to pick. */
export function CategoryCombobox({ categories, value, onChange }: CategoryComboboxProps) {
  const selectedName = categories.find((c) => c.id === value)?.name ?? "";
  const [text, setText] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // keeps the input in sync when the selection changes from outside (e.g. picked in the manager modal)
  useEffect(() => {
    setText(selectedName);
  }, [selectedName]);

  const filtered = useMemo(() => {
    const q = normalize(text.trim());
    // showing the full list when the text is exactly the current selection, so reopening isn't stuck on one match
    if (!q || text === selectedName) return categories;
    return categories.filter((c) => normalize(c.name).includes(q));
  }, [categories, text, selectedName]);

  // option 0 is always "Categoria indefinida"
  const optionCount = filtered.length + 1;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closeAndRestore();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  });

  function closeAndRestore() {
    setOpen(false);
    setText(selectedName);
  }

  function select(id: number | null) {
    onChange(id);
    setText(categories.find((c) => c.id === id)?.name ?? "");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % optionCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h - 1 + optionCount) % optionCount);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      select(highlight === 0 ? null : filtered[highlight - 1].id);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      closeAndRestore();
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        value={text}
        placeholder={UNDEFINED_LABEL}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setHighlight(e.target.value.trim() ? 1 : 0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-theme-border bg-theme-bg py-1 shadow-lg">
          <Option active={highlight === 0} onHover={() => setHighlight(0)} onPick={() => select(null)}>
            <span className="text-theme-3">{UNDEFINED_LABEL}</span>
          </Option>
          {filtered.map((c, i) => (
            <Option key={c.id} active={highlight === i + 1} onHover={() => setHighlight(i + 1)} onPick={() => select(c.id)}>
              {c.name}
            </Option>
          ))}
          {filtered.length === 0 && <li className="px-3 py-1.5 text-sm text-theme-3">Nenhuma categoria encontrada.</li>}
        </ul>
      )}
    </div>
  );
}

function Option({
  active,
  onHover,
  onPick,
  children,
}: {
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      onMouseEnter={onHover}
      // mousedown (not click) so it fires before the input's blur/outside-click handling
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={`cursor-pointer px-3 py-1.5 text-sm text-theme-1 ${active ? "bg-theme-hover" : ""}`}
    >
      {children}
    </li>
  );
}
