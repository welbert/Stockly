import { ReactNode } from "react";
import { Modal } from "./Modal";

/**
 * Three tiny looping CSS animations (no real screen recording/GIF — this is
 * a hand-built illustration, same idea as `KeyboardShortcutsModal`'s keyboard
 * diagram) standing in for what a GIF of dragging/resizing a card would show.
 * Kept in a scoped `<style>` tag rather than `index.css` since these
 * `@keyframes` exist only for this one modal.
 */
const ANIMATION_STYLES = `
  @keyframes dashHelpAddPulse {
    0%, 30% { transform: scale(1); }
    38% { transform: scale(0.93); }
    46%, 100% { transform: scale(1); }
  }
  @keyframes dashHelpAddCursor {
    0%, 22% { opacity: 0; transform: translate(18px, 14px); }
    28%, 46% { opacity: 1; transform: translate(0, 0); }
    58%, 100% { opacity: 0; transform: translate(0, 0); }
  }
  @keyframes dashHelpAddCardIn {
    0%, 44% { opacity: 0; transform: scale(0.7); }
    62%, 100% { opacity: 1; transform: scale(1); }
  }
  @keyframes dashHelpMoveCard {
    0%, 15% { transform: translate(0, 0); }
    50%, 65% { transform: translate(-64px, 34px); }
    100% { transform: translate(0, 0); }
  }
  @keyframes dashHelpMoveCursor {
    0%, 15% { opacity: 1; transform: translate(0, 0); }
    50%, 65% { opacity: 1; transform: translate(-64px, 34px); }
    85%, 100% { opacity: 1; transform: translate(0, 0); }
  }
  @keyframes dashHelpResizeCard {
    0%, 20% { width: 64px; }
    50%, 70% { width: 136px; }
    100% { width: 64px; }
  }
  @keyframes dashHelpResizeCursor {
    0%, 20% { transform: translate(0, 0); }
    50%, 70% { transform: translate(72px, 0); }
    100% { transform: translate(0, 0); }
  }
`;

function Cursor({ animation }: { animation: string }) {
  return (
    <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 text-base drop-shadow" style={{ animation }}>
      🖱️
    </span>
  );
}

function Panel({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold text-theme-1">{title}</h3>
        <p className="text-xs text-theme-3">{caption}</p>
      </div>
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-theme-border bg-theme-raised">
        {children}
      </div>
    </div>
  );
}

interface DashboardHelpModalProps {
  onClose: () => void;
}

/** Opened from the "?" next to "✎ Personalizar" — explains the three things
 * edit mode lets you do (add, move, resize) with a small looping illustration
 * for each, since the buttons/handles alone aren't self-explanatory the
 * first time someone opens the Dashboard. */
export function DashboardHelpModal({ onClose }: DashboardHelpModalProps) {
  return (
    <Modal title="Como personalizar o Dashboard" onClose={onClose} size="lg">
      <style>{ANIMATION_STYLES}</style>
      <p className="mb-4 text-xs text-theme-3">
        Clique em "✎ Personalizar" pra habilitar os três ajustes abaixo. As animações são só uma simulação — nenhuma
        delas altera nada de verdade.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Panel title="Adicionar card" caption='"+ Adicionar card" abre a lista de cards ainda não visíveis.'>
          <div className="relative">
            <span
              className="block rounded-full border border-primary/40 bg-primary-soft px-2.5 py-1 text-[10px] font-semibold text-primary"
              style={{ animation: "dashHelpAddPulse 3.2s ease-in-out infinite" }}
            >
              + Vendas por categoria
            </span>
            <div
              className="absolute -bottom-8 left-1/2 h-6 w-16 -translate-x-1/2 rounded-md border border-theme-border bg-theme-surface shadow-sm"
              style={{ animation: "dashHelpAddCardIn 3.2s ease-in-out infinite" }}
            />
            <Cursor animation="dashHelpAddCursor 3.2s ease-in-out infinite" />
          </div>
        </Panel>

        <Panel title="Mover card" caption="Arraste um card pelo corpo dele pra reposicionar no grid.">
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5">
            <div className="h-8 w-8 rounded border border-dashed border-theme-border" />
            <div className="relative h-8 w-8 rounded border border-dashed border-theme-border">
              <div
                className="absolute inset-0 flex items-center justify-center rounded border border-primary/50 bg-primary-soft text-[9px] font-semibold text-primary"
                style={{ animation: "dashHelpMoveCard 3.2s ease-in-out infinite" }}
              >
                ⠿
              </div>
              <Cursor animation="dashHelpMoveCursor 3.2s ease-in-out infinite" />
            </div>
            <div className="h-8 w-8 rounded border border-dashed border-theme-border" />
            <div className="h-8 w-8 rounded border border-dashed border-theme-border" />
          </div>
        </Panel>

        <Panel title="Redimensionar" caption="Alguns cards têm um canto (⤢) pra arrastar e trocar de tamanho.">
          <div className="relative flex items-center">
            <div
              className="relative flex h-10 items-center justify-center rounded border border-primary/50 bg-primary-soft text-[9px] font-semibold text-primary"
              style={{ width: 64, animation: "dashHelpResizeCard 3.2s ease-in-out infinite" }}
            >
              <span className="absolute bottom-0.5 right-1 text-[9px] text-primary/70">⤢</span>
            </div>
            <span className="absolute bottom-1 left-0" style={{ animation: "dashHelpResizeCursor 3.2s ease-in-out infinite" }}>
              <span className="text-base drop-shadow">🖱️</span>
            </span>
          </div>
        </Panel>
      </div>

      <ul className="mt-5 space-y-1 text-xs text-theme-2">
        <li>• "✕" no canto de cada card (visível ao passar o mouse) remove ele do dashboard — fica disponível de novo em "+ Adicionar card".</li>
        <li>• "✕ Cancelar" desfaz tudo que foi ajustado desde que "✎ Personalizar" foi aberto.</li>
        <li>• "✓ Concluir" só sai do modo de edição — o que já foi feito continua salvo.</li>
      </ul>
    </Modal>
  );
}
