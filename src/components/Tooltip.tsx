import { ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: ReactNode;
}

const MARGIN = 6;
const ESTIMATED_HEIGHT = 70;

interface Position {
  top: number;
  left: number;
  placement: "above" | "below";
}

/**
 * Popup de explicação ao passar o mouse/focar em cima de `children`.
 * Renderizado via portal em `document.body` (não como filho posicionado do
 * próprio trigger) — senão fica cortado quando o trigger está dentro de algo
 * com `overflow-hidden` (ex.: tabela com cantos arredondados) e sem espaço
 * pro popup abrir pra cima. Vira pra baixo sozinho quando falta espaço acima.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  function open() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const placement: Position["placement"] = rect.top > ESTIMATED_HEIGHT + MARGIN ? "above" : "below";
    setPos({
      left: rect.left + rect.width / 2,
      top: placement === "above" ? rect.top - MARGIN : rect.bottom + MARGIN,
      placement,
    });
  }

  function close() {
    setPos(null);
  }

  return (
    <span ref={triggerRef} className="relative inline-flex" onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: `translate(-50%, ${pos.placement === "above" ? "-100%" : "0"})`,
            }}
            className="z-50 w-52 rounded-lg border border-theme-border bg-theme-surface px-2.5 py-2 text-xs font-normal normal-case tracking-normal text-theme-2 shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
