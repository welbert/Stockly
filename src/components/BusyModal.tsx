import { Modal } from "./Modal";

interface BusyModalProps {
  message: string;
}

/** Blocking "please wait" overlay for actions that take a noticeable moment
 * (e.g. rendering + sending a receipt to the printer). Not dismissible on
 * purpose — the modal backdrop swallows clicks and there is no close button,
 * so the user can't trigger the same action again while it's running. The
 * caller is responsible for only rendering it while the work is in flight. */
export function BusyModal({ message }: BusyModalProps) {
  return (
    <Modal title="Aguarde" dismissible={false}>
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-theme-border border-t-primary" />
        <span className="text-sm text-theme-1">{message}</span>
      </div>
    </Modal>
  );
}
