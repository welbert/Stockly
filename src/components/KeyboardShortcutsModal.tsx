import { CSSProperties } from "react";
import { Modal } from "./Modal";

const UNIT = 26;
const GAP = 3;

function span(units: number): number {
  return units * UNIT + (units - 1) * GAP;
}

type KeySpec = {
  label: string;
  width?: number;
  /** Reserves the space without drawing a key — just breathing room between blocks (e.g. between F-key groups). */
  blank?: boolean;
  highlight?: boolean;
};

function Key({ label, width = 1, blank, highlight }: KeySpec) {
  const style: CSSProperties = { width: span(width), height: UNIT };
  if (blank) return <div style={style} />;
  return (
    <div
      style={style}
      className={`flex items-center justify-center rounded border text-center text-[9px] font-semibold leading-none ${
        highlight ? "border-primary bg-primary-soft text-primary" : "border-theme-border bg-theme-surface text-theme-3"
      }`}
    >
      {label}
    </div>
  );
}

function Row({ keys }: { keys: KeySpec[] }) {
  return (
    <div className="flex" style={{ gap: GAP }}>
      {keys.map((k, i) => (
        <Key key={i} {...k} />
      ))}
    </div>
  );
}

const FUNCTION_ROW: KeySpec[] = [
  { label: "Esc", highlight: true },
  { label: "", width: 0.5, blank: true },
  { label: "F1" },
  { label: "F2", highlight: true },
  { label: "F3" },
  { label: "F4", highlight: true },
  { label: "", width: 0.4, blank: true },
  { label: "F5" },
  { label: "F6", highlight: true },
  { label: "F7" },
  { label: "F8" },
  { label: "", width: 0.4, blank: true },
  { label: "F9" },
  { label: "F10" },
  { label: "F11" },
  { label: "F12" },
];

const NUMBER_ROW: KeySpec[] = [
  { label: "`" },
  { label: "1" },
  { label: "2" },
  { label: "3" },
  { label: "4" },
  { label: "5" },
  { label: "6" },
  { label: "7" },
  { label: "8" },
  { label: "9" },
  { label: "0" },
  { label: "-" },
  { label: "=" },
  { label: "Backspace", width: 2 },
];

const QWERTY_ROW: KeySpec[] = [
  { label: "Tab", width: 1.5 },
  { label: "Q" },
  { label: "W" },
  { label: "E" },
  { label: "R" },
  { label: "T" },
  { label: "Y" },
  { label: "U" },
  { label: "I" },
  { label: "O" },
  { label: "P" },
  { label: "[" },
  { label: "]" },
  { label: "\\", width: 1 },
];

const HOME_ROW: KeySpec[] = [
  { label: "Caps", width: 1.75 },
  { label: "A" },
  { label: "S" },
  { label: "D" },
  { label: "F" },
  { label: "G" },
  { label: "H" },
  { label: "J" },
  { label: "K" },
  { label: "L" },
  { label: ";" },
  { label: "'" },
  { label: "Enter", width: 2.25, highlight: true },
];

const BOTTOM_ROW: KeySpec[] = [
  { label: "Shift", width: 2.25 },
  { label: "Z" },
  { label: "X" },
  { label: "C" },
  { label: "V" },
  { label: "B" },
  { label: "N" },
  { label: "M" },
  { label: "," },
  { label: "." },
  { label: "/" },
  { label: "Shift", width: 2.65 },
];

const SPACE_ROW: KeySpec[] = [
  { label: "Ctrl", width: 1.25 },
  { label: "Win", width: 1.25 },
  { label: "Alt", width: 1.25 },
  { label: "Espaço", width: 6.5 },
  { label: "Alt", width: 1.25 },
  { label: "Win", width: 1.25 },
  { label: "Menu", width: 1.25 },
  { label: "Ctrl", width: 1.25 },
];

const NAV_CLUSTER: KeySpec[][] = [
  [{ label: "Ins" }, { label: "Home" }, { label: "PgUp" }],
  [{ label: "Del", highlight: true }, { label: "End" }, { label: "PgDn" }],
];

const ARROW_CLUSTER: KeySpec[][] = [
  [{ label: "", blank: true }, { label: "↑", highlight: true }, { label: "", blank: true }],
  [{ label: "←" }, { label: "↓", highlight: true }, { label: "→" }],
];

function GridKey({ label, highlight, rowSpan, colSpan }: { label: string; highlight?: boolean; rowSpan?: number; colSpan?: number }) {
  return (
    <div
      style={{ gridRow: rowSpan ? `span ${rowSpan}` : undefined, gridColumn: colSpan ? `span ${colSpan}` : undefined }}
      className={`flex items-center justify-center rounded border text-center text-[9px] font-semibold leading-none ${
        highlight ? "border-primary bg-primary-soft text-primary" : "border-theme-border bg-theme-surface text-theme-3"
      }`}
    >
      {label}
    </div>
  );
}

function Numpad() {
  return (
    <div className="grid" style={{ gap: GAP, gridTemplateColumns: `repeat(4, ${UNIT}px)`, gridAutoRows: `${UNIT}px` }}>
      <GridKey label="Num" />
      <GridKey label="/" />
      <GridKey label="*" />
      <GridKey label="-" highlight />
      <GridKey label="7" />
      <GridKey label="8" />
      <GridKey label="9" />
      <GridKey label="+" highlight rowSpan={2} />
      <GridKey label="4" />
      <GridKey label="5" />
      <GridKey label="6" />
      <GridKey label="1" />
      <GridKey label="2" />
      <GridKey label="3" />
      <GridKey label="Enter" highlight rowSpan={2} />
      <GridKey label="0" colSpan={2} />
      <GridKey label="." />
    </div>
  );
}

const LEGEND: { keys: string; label: string }[] = [
  { keys: "F2", label: "Finalizar venda" },
  { keys: "F4", label: "Cancelar venda" },
  { keys: "F6", label: "Aplicar desconto (item ou venda)" },
  { keys: "Enter", label: "Adicionar item selecionado" },
  { keys: "+ / -", label: "Ajustar quantidade do item selecionado" },
  { keys: "Del", label: "Remover item selecionado" },
  { keys: "↑ / ↓", label: "Navegar sugestões ou itens da venda" },
  { keys: "Esc", label: "Fechar o modal aberto, ou desmarcar o item selecionado" },
];

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

/** Full keyboard diagram (function row, alphanumeric block, nav cluster and
 * numpad), with the keys Venda actually uses highlighted — for anyone who
 * doesn't know a key by sight, look here and find the same spot on their
 * physical keyboard. */
export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal title="Atalhos de teclado" onClose={onClose} size="lg">
      <p className="mb-3 text-xs text-theme-3">
        A tela de Venda foi pensada pra uso 100% via teclado. As teclas destacadas abaixo são as usadas lá — compare com
        o seu teclado físico pra achar a posição de cada uma.
      </p>

      <div className="overflow-x-auto rounded-lg border border-theme-border bg-theme-raised p-3">
        <div className="flex w-max flex-col gap-3">
          <div className="flex items-start" style={{ gap: UNIT }}>
            <div className="flex flex-col" style={{ gap: GAP }}>
              <Row keys={FUNCTION_ROW} />
              <Row keys={NUMBER_ROW} />
              <Row keys={QWERTY_ROW} />
              <Row keys={HOME_ROW} />
              <Row keys={BOTTOM_ROW} />
              <Row keys={SPACE_ROW} />
            </div>

            <div className="flex flex-col" style={{ gap: UNIT * 1.3 }}>
              <div className="flex flex-col" style={{ gap: GAP }}>
                {NAV_CLUSTER.map((row, i) => (
                  <Row key={i} keys={row} />
                ))}
              </div>
              <div className="flex flex-col" style={{ gap: GAP }}>
                {ARROW_CLUSTER.map((row, i) => (
                  <Row key={i} keys={row} />
                ))}
              </div>
            </div>

            <Numpad />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {LEGEND.map((item) => (
          <div key={item.keys} className="flex items-center gap-2">
            <span className="min-w-[52px] rounded border border-primary bg-primary-soft px-1.5 py-0.5 text-center text-[10px] font-semibold text-primary">
              {item.keys}
            </span>
            <span className="text-xs text-theme-2">{item.label}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
