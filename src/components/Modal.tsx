import { ReactNode, useEffect } from "react";

const SIZE_CLASSES = {
  sm: "max-w-sm",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  /** Sem botão de fechar nem clique fora fecha — usado pela tela de bloqueio. */
  dismissible?: boolean;
  /** `lg`/`xl` only for content that needs extra width (e.g. a keyboard diagram, a CSV import review table) — defaults to `sm`. */
  size?: keyof typeof SIZE_CLASSES;
}

export function Modal({ title, children, onClose, dismissible = true, size = "sm" }: ModalProps) {
  useEffect(() => {
    if (!dismissible || !onClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismissible, onClose]);

  return (
    <div
      data-modal-root
      className="fixed inset-0 z-50 flex items-center justify-center bg-theme-overlay px-4"
      onMouseDown={(e) => {
        if (dismissible && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${SIZE_CLASSES[size]} rounded-2xl border border-theme-border bg-theme-surface shadow-xl`}>
        <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
          <h2 className="text-base font-semibold text-theme-1">{title}</h2>
          {dismissible && onClose && (
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-md p-1 text-theme-3 hover:bg-theme-hover hover:text-theme-1"
            >
              ✕
            </button>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
