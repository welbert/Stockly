import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Erro do backend (ex.: recusa por regra de negócio) — mantém o modal aberto pra mostrar. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação genérica (ex.: elevar usuário a Administrador, excluir item). */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-theme-2">{message}</p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
