import { ReactNode } from "react";

interface AccordionProps {
  icon: string;
  title: string;
  subtitle: string;
  adminBadge?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Collapsible section used by `SettingsPage`'s accordion-with-search layout
 * — a `Card`-like header (icon, title/subtitle, optional "Admin" badge) that
 * toggles a field grid below it. `open` is fully controlled by the caller so
 * a search match can force a section open without fighting manual state. */
export function Accordion({ icon, title, subtitle, adminBadge, open, onToggle, children }: AccordionProps) {
  return (
    <div className="mb-2.5 overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary-soft text-base" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-theme-1">
            {title}
            {adminBadge && (
              <span className="rounded-full bg-theme-hover px-2 py-0.5 text-[11px] font-bold text-theme-3">Admin</span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-theme-3">{subtitle}</span>
        </span>
        <span className={`flex-none text-theme-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && <div className="grid grid-cols-1 gap-5 border-t border-theme-border px-5 pb-5 pt-4 sm:grid-cols-2">{children}</div>}
    </div>
  );
}
