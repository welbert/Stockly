import { Tooltip } from "../Tooltip";
import { CARD_CATALOG, CardKey } from "./catalog";

type Props = {
  hiddenKeys: CardKey[];
  onAdd: (cardKey: CardKey) => void;
  onClose: () => void;
};

export function AddCardDrawer({ hiddenKeys, onAdd, onClose }: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-theme-border bg-theme-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-theme-3">Adicionar card</span>
        <button onClick={onClose} className="text-theme-3 hover:text-theme-1">
          ✕
        </button>
      </div>
      {hiddenKeys.length === 0 ? (
        <div className="py-2 text-sm text-theme-3">Todos os cards do catálogo já estão no dashboard.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hiddenKeys.map((key) => (
            <Tooltip key={key} text={CARD_CATALOG[key].description}>
              <button
                onClick={() => onAdd(key)}
                className="rounded-full border border-theme-border bg-theme-bg px-4 py-2 text-xs font-semibold text-theme-1 hover:border-primary/50"
              >
                + {CARD_CATALOG[key].label}
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
