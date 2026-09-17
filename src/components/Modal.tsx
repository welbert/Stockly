import { ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  /** Sem botão de fechar nem clique fora fecha — usado pela tela de bloqueio. */
  dismissible?: boolean;
}

export function Modal({ title, children, onClose, dismissible = true }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-theme-overlay px-4"
      onMouseDown={(e) => {
        if (dismissible && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-theme-border bg-theme-surface shadow-xl">
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
