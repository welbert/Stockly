import { useEffect, useState } from "react";
import type { ToastItem, ToastType } from "../context/ToastContext";

const DEFAULT_DURATION = 60_000;

const TYPE_STYLES: Record<ToastType, { icon: string; iconClass: string; barClass: string }> = {
  success: { icon: "✓", iconClass: "bg-success/10 text-success", barClass: "bg-success" },
  warning: { icon: "⚠", iconClass: "bg-warning/10 text-warning", barClass: "bg-warning" },
  error: { icon: "✕", iconClass: "bg-danger/10 text-danger", barClass: "bg-danger" },
};

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: () => void;
}

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const duration = toast.duration ?? DEFAULT_DURATION;
  const styles = TYPE_STYLES[toast.type];
  // Starts at full width; a frame later, flips to 0 so the width change is
  // an actual CSS transition (not an instant snap) — the bar itself is the
  // "vai fechar sozinho em X" signal the auto-close timer needs.
  const [shrink, setShrink] = useState(false);

  useEffect(() => {
    const closeTimer = setTimeout(onDismiss, duration);
    const raf = requestAnimationFrame(() => setShrink(true));
    return () => {
      clearTimeout(closeTimer);
      cancelAnimationFrame(raf);
    };
    // Only ever runs once per toast (stable `id`) — re-running on every
    // prop change would restart the auto-close timer and the bar animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-80 overflow-hidden rounded-xl border border-theme-border bg-theme-surface shadow-lg">
      <div className="flex items-start gap-3 p-3.5">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles.iconClass}`}>
          {styles.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-theme-1">{toast.title}</p>
          {toast.message &&
            (toast.onClick ? (
              <button
                type="button"
                onClick={() => {
                  toast.onClick?.();
                  onDismiss();
                }}
                className="mt-0.5 block text-left text-xs text-primary underline hover:text-primary-hover"
              >
                {toast.message}
              </button>
            ) : (
              <p className="mt-0.5 text-xs text-theme-3">{toast.message}</p>
            ))}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar"
          className="shrink-0 rounded-md p-0.5 text-theme-3 hover:bg-theme-hover hover:text-theme-1"
        >
          ✕
        </button>
      </div>
      <div className="h-1 w-full bg-theme-hover">
        <div
          className={`h-full ${styles.barClass}`}
          style={{ width: shrink ? "0%" : "100%", transition: `width ${duration}ms linear` }}
        />
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

/** Bottom-right stack — a new toast appends to the end, so it lands closest
 * to the corner (where it visually "arrives from") and pushes older ones
 * up, same convention as most desktop notification stacks. */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
