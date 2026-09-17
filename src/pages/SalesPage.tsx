import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { ItemSummary, PaymentMethod, SaleDetail, UserSummary } from "../lib/api";
import { createSale, getReceiptThankYouMessage, getStoreInfo, getStoreName, listAdmins, listItems, round2 } from "../lib/api";
import { Button } from "../components/Button";
import { ConfirmModal } from "../components/ConfirmModal";
import { DiscountModal, type DiscountResult } from "../components/DiscountModal";
import { Kbd } from "../components/Kbd";
import { KeyboardShortcutsModal } from "../components/KeyboardShortcutsModal";
import { PaymentModal } from "../components/PaymentModal";
import { ReceiptResultModal } from "../components/ReceiptResultModal";
import { fmt, normalize } from "../lib/format";
import { logger } from "../logger";

type CartLine = {
  itemId: number;
  code: string;
  name: string;
  unitPrice: number;
  /** Stock available at the moment the item was added — just a quick UX
   * bound; the validation that actually counts happens in the backend at
   * finalize time (stock may have changed between the start and end of the sale). */
  available: number;
  quantity: number;
  discountPercent: number | null;
  discountAmount: number | null;
};

type DiscountTarget = { kind: "item"; index: number } | { kind: "general" };

function lineSubtotal(line: Pick<CartLine, "unitPrice" | "quantity" | "discountPercent" | "discountAmount">): number {
  const gross = round2(line.unitPrice * line.quantity);
  const discountValue = line.discountAmount ?? (line.discountPercent ? round2((gross * line.discountPercent) / 100) : 0);
  return round2(gross - discountValue);
}

function suggestionsFor(term: string, items: ItemSummary[]): ItemSummary[] {
  const t = normalize(term.trim());
  if (!t) return [];
  const starts: ItemSummary[] = [];
  const contains: ItemSummary[] = [];
  for (const item of items) {
    if (!item.active) continue;
    const name = normalize(item.name);
    const code = normalize(item.code);
    if (name.startsWith(t) || code.startsWith(t)) starts.push(item);
    else if (name.includes(t) || code.includes(t)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, 8);
}

export function SalesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [admins, setAdmins] = useState<UserSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [generalDiscountPercent, setGeneralDiscountPercent] = useState<number | null>(null);
  const [generalDiscountAmount, setGeneralDiscountAmount] = useState<number | null>(null);
  const [saleAuth, setSaleAuth] = useState<{ authorizerId: number; password: string } | null>(null);
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleDetail | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeInfo, setStoreInfo] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    listItems()
      .then(setItems)
      .catch((err) => logger.error("falha ao listar itens para a venda", err));
  }

  useEffect(reload, []);
  useEffect(() => {
    listAdmins()
      .then(setAdmins)
      .catch((err) => logger.error("falha ao listar administradores", err));
    getStoreName()
      .then(setStoreName)
      .catch((err) => logger.error("falha ao ler nome da loja", err));
    getStoreInfo()
      .then(setStoreInfo)
      .catch((err) => logger.error("falha ao ler informações adicionais da loja", err));
    getReceiptThankYouMessage()
      .then(setThankYouMessage)
      .catch((err) => logger.error("falha ao ler mensagem de agradecimento do recibo", err));
  }, []);

  useEffect(() => {
    if (cart.length === 0) setSelectedRow(null);
    else setSelectedRow((r) => (r === null ? null : Math.min(r, cart.length - 1)));
  }, [cart.length]);

  const suggestions = useMemo(() => suggestionsFor(searchTerm, items), [searchTerm, items]);

  const subtotal = useMemo(() => round2(cart.reduce((sum, l) => sum + lineSubtotal(l), 0)), [cart]);
  const generalDiscountValue =
    generalDiscountAmount ?? (generalDiscountPercent ? round2((subtotal * generalDiscountPercent) / 100) : 0);
  const total = round2(subtotal - generalDiscountValue);

  const modalOpen = discountTarget !== null || showPayment || cancelConfirm || completedSale !== null || showShortcuts;

  // Whenever the last modal closes, focus goes back to the search field —
  // this whole screen is meant to never need the mouse to keep adding items.
  useEffect(() => {
    if (!modalOpen) searchInputRef.current?.focus();
  }, [modalOpen]);

  function addItemToCart(item: ItemSummary) {
    if (item.quantity <= 0) {
      setAddError(`"${item.name}" está sem estoque`);
      return;
    }
    const idx = cart.findIndex((l) => l.itemId === item.id);
    if (idx >= 0) {
      if (cart[idx].quantity + 1 > item.quantity) {
        setAddError(`Estoque insuficiente para "${item.name}"`);
        return;
      }
      setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      setCart((prev) => [
        ...prev,
        {
          itemId: item.id,
          code: item.code,
          name: item.name,
          unitPrice: item.salePrice,
          available: item.quantity,
          quantity: 1,
          discountPercent: null,
          discountAmount: null,
        },
      ]);
    }
    setAddError(null);
    setSearchTerm("");
    setHighlightedIndex(0);
    searchInputRef.current?.focus();
  }

  function handleAddFromSearch() {
    const term = searchTerm.trim();
    if (!term) return;
    const normalizedTerm = normalize(term);
    const exactCode = items.find((it) => it.active && normalize(it.code) === normalizedTerm);
    const candidate = exactCode ?? suggestions[Math.min(highlightedIndex, suggestions.length - 1)];
    if (!candidate) {
      setAddError("Item não encontrado");
      return;
    }
    addItemToCart(candidate);
  }

  function adjustQuantity(index: number, delta: number) {
    setCart((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) return prev.filter((_, i) => i !== index);
      if (nextQty > line.available) return prev;
      return prev.map((l, i) => (i === index ? { ...l, quantity: nextQty } : l));
    });
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCancelSale() {
    setCart([]);
    setGeneralDiscountPercent(null);
    setGeneralDiscountAmount(null);
    setSaleAuth(null);
    setSelectedRow(null);
    setCancelConfirm(false);
  }

  function handleDiscountApply(result: DiscountResult) {
    if (result.authorizerId && result.authorizerPassword) {
      setSaleAuth({ authorizerId: result.authorizerId, password: result.authorizerPassword });
    }
    if (discountTarget?.kind === "item") {
      const index = discountTarget.index;
      setCart((prev) =>
        prev.map((l, i) => (i === index ? { ...l, discountPercent: result.percent, discountAmount: result.amount } : l)),
      );
    } else if (discountTarget?.kind === "general") {
      setGeneralDiscountPercent(result.percent);
      setGeneralDiscountAmount(result.amount);
    }
    setDiscountTarget(null);
  }

  function handleDiscountRemove() {
    if (discountTarget?.kind === "item") {
      const index = discountTarget.index;
      setCart((prev) => prev.map((l, i) => (i === index ? { ...l, discountPercent: null, discountAmount: null } : l)));
    } else if (discountTarget?.kind === "general") {
      setGeneralDiscountPercent(null);
      setGeneralDiscountAmount(null);
    }
    setDiscountTarget(null);
  }

  async function handleFinalize(method: PaymentMethod) {
    setSubmittingSale(true);
    setSaleError(null);
    try {
      const sale = await createSale({
        items: cart.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
          discountAmount: l.discountAmount,
        })),
        discountPercent: generalDiscountPercent,
        discountAmount: generalDiscountAmount,
        discountAuthorizerId: saleAuth?.authorizerId ?? null,
        discountAuthorizerPassword: saleAuth?.password ?? null,
        paymentMethod: method,
      });
      setCompletedSale(sale);
      setShowPayment(false);
    } catch (err) {
      logger.error("falha ao finalizar venda", err);
      setSaleError(String(err));
    } finally {
      setSubmittingSale(false);
    }
  }

  function handleNewSale() {
    setCart([]);
    setGeneralDiscountPercent(null);
    setGeneralDiscountAmount(null);
    setSaleAuth(null);
    setSelectedRow(null);
    setCompletedSale(null);
    setSaleError(null);
    reload();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen) return;
      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0) setShowPayment(true);
      } else if (e.key === "F4") {
        e.preventDefault();
        if (cart.length > 0) setCancelConfirm(true);
      } else if (e.key === "F6") {
        e.preventDefault();
        setDiscountTarget(selectedRow !== null ? { kind: "item", index: selectedRow } : { kind: "general" });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (suggestions.length > 0) setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        else if (cart.length > 0) setSelectedRow((r) => (r === null ? 0 : Math.min(r + 1, cart.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (suggestions.length > 0) setHighlightedIndex((i) => Math.max(i - 1, 0));
        else if (cart.length > 0) setSelectedRow((r) => (r === null ? 0 : Math.max(r - 1, 0)));
      } else if (e.key === "Enter" && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        handleAddFromSearch();
      } else if ((e.key === "+" || e.key === "-") && searchTerm === "" && selectedRow !== null) {
        e.preventDefault();
        adjustQuantity(selectedRow, e.key === "+" ? 1 : -1);
      } else if (e.key === "Delete" && searchTerm === "" && selectedRow !== null) {
        e.preventDefault();
        removeLine(selectedRow);
      } else if (e.key === "Escape" && selectedRow !== null) {
        e.preventDefault();
        setSelectedRow(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, cart, selectedRow, suggestions, searchTerm, highlightedIndex, items]);

  if (!user) return null;

  const discountRequiresAuth = !user.isAdmin && !saleAuth;
  const discountModalProps =
    discountTarget?.kind === "item"
      ? (() => {
          const line = cart[discountTarget.index];
          return line
            ? {
                targetLabel: line.name,
                grossValue: round2(line.unitPrice * line.quantity),
                current: { percent: line.discountPercent, amount: line.discountAmount },
              }
            : null;
        })()
      : discountTarget?.kind === "general"
        ? {
            targetLabel: null,
            grossValue: subtotal,
            current: { percent: generalDiscountPercent, amount: generalDiscountAmount },
          }
        : null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <label className="mb-1 block text-xs font-semibold text-theme-3">Código ou nome do item (foco automático)</label>
          <div className="mb-1 flex gap-2">
            <input
              ref={searchInputRef}
              autoFocus
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
                setAddError(null);
              }}
              placeholder="Digite o código ou nome... + Enter"
              className="flex-1 rounded-lg border border-theme-border bg-theme-bg px-3 py-2.5 text-base text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <Button variant="primary" onClick={handleAddFromSearch}>
              Adicionar
            </Button>
          </div>

          {addError && <p className="mb-2 text-xs text-danger">{addError}</p>}

          {suggestions.length > 0 && (
            <div className="mb-3 overflow-hidden rounded-lg border border-theme-border">
              {suggestions.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItemToCart(item)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    i === highlightedIndex ? "bg-primary-soft text-primary" : "text-theme-1 hover:bg-theme-hover"
                  }`}
                >
                  <span>
                    <code className="mr-2 text-xs text-theme-3">{item.code}</code>
                    {item.name}
                  </span>
                  <span className={item.quantity === 0 ? "text-xs font-semibold text-danger" : "text-xs text-theme-3"}>
                    {item.quantity === 0 ? "Sem estoque" : `${item.quantity} disp.`}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-theme-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Qtd.</th>
                  <th className="px-3 py-2">Preço unit.</th>
                  <th className="px-3 py-2">Desconto</th>
                  <th className="px-3 py-2">Subtotal</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {cart.map((line, index) => (
                  <tr
                    key={line.itemId}
                    onClick={() => setSelectedRow(index)}
                    className={`cursor-pointer border-b border-theme-border last:border-0 ${
                      selectedRow === index ? "bg-primary-soft" : "hover:bg-theme-hover"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <code className="text-xs">{line.code}</code>
                    </td>
                    <td className="px-3 py-2 text-theme-1">{line.name}</td>
                    <td className="px-3 py-2 text-theme-1">{line.quantity}</td>
                    <td className="px-3 py-2 text-theme-1">{fmt(line.unitPrice)}</td>
                    <td className="px-3 py-2">
                      {line.discountPercent !== null || line.discountAmount !== null ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRow(index);
                            setDiscountTarget({ kind: "item", index });
                          }}
                          className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning"
                        >
                          {line.discountPercent !== null ? `-${line.discountPercent}%` : `-${fmt(line.discountAmount!)}`}
                        </button>
                      ) : (
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRow(index);
                            setDiscountTarget({ kind: "item", index });
                          }}
                        >
                          + desconto
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-theme-1">{fmt(lineSubtotal(line))}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLine(index);
                        }}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-theme-3">
                      Nenhum item na venda ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-end justify-between border-t border-theme-border pt-3.5">
            <Button variant="secondary" onClick={() => setDiscountTarget({ kind: "general" })}>
              🏷️ Aplicar desconto na venda <span className="ml-1.5 rounded border border-theme-border px-1 text-[10px]">F6</span>
            </Button>
            <div className="text-right">
              <div className="text-xs text-theme-3">
                {generalDiscountValue > 0 ? (
                  <>
                    Subtotal <s className="text-theme-3">{fmt(subtotal)}</s> · Desconto geral
                    {generalDiscountPercent !== null ? ` -${generalDiscountPercent}%` : ` -${fmt(generalDiscountValue)}`}
                  </>
                ) : (
                  `Subtotal ${fmt(subtotal)}`
                )}
              </div>
              <div className="text-2xl font-bold text-theme-1">{fmt(total)}</div>
            </div>
          </div>

          <div className="mt-3.5 flex justify-end gap-2">
            <Button variant="danger" disabled={cart.length === 0} onClick={() => setCancelConfirm(true)}>
              Cancelar venda <span className="ml-1.5 rounded border border-white/30 px-1 text-[10px]">F4</span>
            </Button>
            <Button variant="primary" disabled={cart.length === 0} onClick={() => setShowPayment(true)}>
              Finalizar e gerar recibo <span className="ml-1.5 rounded border border-white/30 px-1 text-[10px]">F2</span>
            </Button>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-theme-raised px-3.5 py-2.5 text-xs text-theme-3">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Enter</Kbd> adicionar item
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>+</Kbd>/<Kbd>-</Kbd> ajustar quantidade
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Del</Kbd> remover item selecionado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>F6</Kbd> aplicar desconto (item/venda)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>F2</Kbd> finalizar venda
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>F4</Kbd> cancelar venda
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>/<Kbd>↓</Kbd> navegar itens
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Esc</Kbd> desmarcar item selecionado
            </span>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              aria-label="Ver atalhos de teclado"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-theme-hover text-[10px] font-bold text-theme-3 hover:bg-primary-soft hover:text-primary"
            >
              ?
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-theme-1">Pré-visualização do recibo</h3>
          <div className="rounded-lg border border-theme-border bg-theme-bg p-3 font-mono text-xs text-theme-1">
            <div className="text-center font-bold">
              {storeName || "BORA VENDER"}
              {storeInfo
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <div key={i} className="font-normal">
                    {line}
                  </div>
                ))}
              <div className="font-normal">Recibo de Venda</div>
            </div>
            <hr className="my-2 border-dashed border-theme-border" />
            <div>Operador: {user.name}</div>
            <hr className="my-2 border-dashed border-theme-border" />
            {cart.length === 0 && <p className="text-theme-3">Nenhum item ainda.</p>}
            {cart.map((line) => (
              <div key={line.itemId} className="flex justify-between gap-2">
                <span>
                  {line.name} x{line.quantity}
                  {line.discountPercent !== null
                    ? ` (-${line.discountPercent}%)`
                    : line.discountAmount !== null
                      ? ` (-${fmt(line.discountAmount)})`
                      : ""}
                </span>
                <span>{fmt(lineSubtotal(line))}</span>
              </div>
            ))}
            {cart.length > 0 && (
              <>
                <hr className="my-2 border-dashed border-theme-border" />
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                {generalDiscountValue > 0 && (
                  <div className="flex justify-between">
                    <span>Desconto geral{generalDiscountPercent !== null ? ` (-${generalDiscountPercent}%)` : ""}</span>
                    <span>-{fmt(generalDiscountValue)}</span>
                  </div>
                )}
                <hr className="my-2 border-dashed border-theme-border" />
                <div className="flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span>{fmt(total)}</span>
                </div>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-theme-3">
            Atualiza em tempo real conforme os itens são adicionados — a finalização acontece pelos botões ao lado.
          </p>
        </div>
      </div>

      {discountTarget && discountModalProps && (
        <DiscountModal
          targetLabel={discountModalProps.targetLabel}
          grossValue={discountModalProps.grossValue}
          current={discountModalProps.current}
          requiresAuth={discountRequiresAuth}
          admins={admins}
          onApply={handleDiscountApply}
          onRemove={handleDiscountRemove}
          onClose={() => setDiscountTarget(null)}
        />
      )}

      {showPayment && (
        <PaymentModal
          total={total}
          submitting={submittingSale}
          error={saleError}
          onConfirm={handleFinalize}
          onClose={() => setShowPayment(false)}
        />
      )}

      {cancelConfirm && (
        <ConfirmModal
          title="Cancelar venda"
          message="Descarta todos os itens adicionados a esta venda em andamento. Isso não pode ser desfeito."
          confirmLabel="Cancelar venda"
          danger
          onConfirm={handleCancelSale}
          onCancel={() => setCancelConfirm(false)}
        />
      )}

      {completedSale && (
        <ReceiptResultModal
          sale={completedSale}
          storeName={storeName}
          storeInfo={storeInfo}
          thankYouMessage={thankYouMessage}
          onNewSale={handleNewSale}
        />
      )}

      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
