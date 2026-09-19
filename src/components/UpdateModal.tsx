import type { UpdatePhase } from "../context/UpdaterContext";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface UpdateModalProps {
  phase: UpdatePhase;
  onConfirm: () => void;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Autoupdate's UI — `"available"` is the only dismissible phase ("Depois"
 * just hides it for this session, see `UpdaterContext.dismiss`); once
 * downloading starts there's no cancel, so `"downloading"`/`"ready"` render
 * with no `onClose` at all. */
export function UpdateModal({ phase, onConfirm, onDismiss }: UpdateModalProps) {
  if (phase.phase === "ready") {
    return (
      <Modal title="Atualização instalada">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-2xl">🔄</div>
          <p className="text-sm text-theme-2">Reiniciando o app na nova versão…</p>
        </div>
      </Modal>
    );
  }

  const isDownloading = phase.phase === "downloading";
  const pct = isDownloading && phase.total > 0 ? Math.round((phase.downloaded / phase.total) * 100) : 0;

  return (
    <Modal title="Atualização disponível" onClose={isDownloading ? undefined : onDismiss}>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-lg border border-theme-border bg-theme-hover p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-theme-3">Atual</div>
          <div className="mt-1 font-mono text-sm font-bold text-theme-2">v{phase.currentVersion}</div>
        </div>
        <div className="flex items-center text-theme-3">→</div>
        <div className="flex-1 rounded-lg border border-primary/30 bg-primary-soft p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">Nova</div>
          <div className="mt-1 font-mono text-sm font-bold text-primary">v{phase.newVersion}</div>
        </div>
      </div>

      {isDownloading ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-theme-3">
            <span>Baixando…</span>
            <span className="tabular-nums">
              {phase.total > 0 ? `${formatBytes(phase.downloaded)} / ${formatBytes(phase.total)}` : `${pct}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-theme-hover">
            <div className="h-full rounded-full bg-primary transition-all duration-150 ease-linear" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onDismiss}>
            Depois
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Atualizar agora
          </Button>
        </div>
      )}
    </Modal>
  );
}
