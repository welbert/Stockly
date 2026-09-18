import { createContext, useContext, useState, type ReactNode } from "react";
import { ToastContainer } from "../components/Toast";

export type ToastType = "success" | "warning" | "error";

export interface ToastInput {
  type: ToastType;
  title: string;
  /** Second line — plain text, or (with `onClick`) a clickable action. */
  message?: string;
  onClick?: () => void;
  /** Auto-close delay in ms. Default 60000 (60s). */
  duration?: number;
}

export interface ToastItem extends ToastInput {
  id: string;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Global, stackable toast notifications (bottom-right) — generic on
 * purpose, any screen can call `useToast().showToast(...)` for success/
 * warning/error feedback, not just CSV/PDF exports (the first use case).
 * Mounted once at the app root so it's available everywhere, including
 * pre-login screens if ever needed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function showToast(toast: ToastInput) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() precisa estar dentro de um ToastProvider");
  return ctx;
}
