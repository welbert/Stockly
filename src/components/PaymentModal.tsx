import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ClientSummary, PaymentMethod } from "../lib/api";
import { createClient, listClients, round2 } from "../lib/api";
import { fmt, normalize } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";
import { PhoneInput } from "./PhoneInput";

const ALL_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "cash", label: "Dinheiro", icon: "💵" },
  { value: "card", label: "Cartão", icon: "💳" },
  { value: "pix", label: "PIX", icon: "📱" },
  { value: "credit", label: "Crediário", icon: "📒" },
];

const CLIENT_SUGGESTION_LIMIT = 5;

function clientSuggestionsFor(term: string, clients: ClientSummary[]): ClientSummary[] {
  const t = normalize(term.trim());
  if (!t) return clients.slice(0, CLIENT_SUGGESTION_LIMIT);
  const starts: ClientSummary[] = [];
  const contains: ClientSummary[] = [];
  for (const c of clients) {
    const name = normalize(c.name);
    if (name.startsWith(t)) starts.push(c);
    else if (name.includes(t)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, CLIENT_SUGGESTION_LIMIT);
}

interface PaymentModalProps {
  total: number;
  submitting: boolean;
  error: string | null;
  creditEnabled: boolean;
  onConfirm: (method: PaymentMethod, clientId: number | null, creditPaidNow: number | null) => void;
  onClose: () => void;
}

/** Crediário is a payment method like any other, plus an inline step to
 * pick/add the client the debt goes to — never leaves this modal, so the
 * sale in progress is never lost. */
export function PaymentModal({ total, submitting, error, creditEnabled, onConfirm, onClose }: PaymentModalProps) {
  const methods = creditEnabled ? ALL_METHODS : ALL_METHODS.filter((m) => m.value !== "credit");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const methodButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [creditPaidNow, setCreditPaidNow] = useState(0);
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientReminder, setNewClientReminder] = useState("");
  const [newClientNote, setNewClientNote] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [confirmDiscardClient, setConfirmDiscardClient] = useState(false);
  const clientInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const newClientDirty =
    newClientName.trim() !== "" || newClientPhone.trim() !== "" || newClientReminder !== "" || newClientNote.trim() !== "";

  useEffect(() => {
    if (!creditEnabled) return;
    listClients()
      .then(setClients)
      .catch((err) => logger.error("falha ao listar clientes", err));
  }, [creditEnabled]);

  useEffect(() => {
    if (method === "credit" && !selectedClient && !addingClient) clientInputRef.current?.focus();
  }, [method, selectedClient, addingClient]);

  const clientSuggestions = clientSuggestionsFor(clientQuery, clients);

  function selectClient(client: ClientSummary) {
    setSelectedClient(client);
    setClientQuery("");
    setClientError(null);
    setCreditPaidNow(0);
  }

  function startAddClient() {
    setAddingClient(true);
    setNewClientName(clientQuery.trim());
    setClientError(null);
  }

  function resetNewClientFields() {
    setNewClientName("");
    setNewClientPhone("");
    setNewClientReminder("");
    setNewClientNote("");
  }

  function requestCancelAddClient() {
    if (newClientDirty) setConfirmDiscardClient(true);
    else {
      setAddingClient(false);
      resetNewClientFields();
    }
  }

  async function handleSaveNewClient() {
    if (!newClientName.trim()) {
      setClientError("Nome é obrigatório");
      return;
    }
    setSavingClient(true);
    setClientError(null);
    try {
      const created = await createClient({
        name: newClientName.trim(),
        phone: newClientPhone.trim() || null,
        reminderDate: newClientReminder || null,
        note: newClientNote.trim() || null,
      });
      setClients((prev) => [...prev, created]);
      selectClient(created);
      setAddingClient(false);
      resetNewClientFields();
    } catch (err) {
      logger.error("falha ao cadastrar cliente", err);
      setClientError(String(err));
    } finally {
      setSavingClient(false);
    }
  }

  // A negative balance means the client has store credit (e.g. from an
  // overpayment on a sale later cancelled) — that credit is applied to this
  // sale automatically, up to its own total, with no manual amount to type:
  // there's nothing to decide, it's just the client's own money being used.
  const storeCredit = selectedClient && selectedClient.balance < 0 ? round2(-selectedClient.balance) : 0;
  const hasStoreCredit = storeCredit > 0;
  const appliedStoreCredit = hasStoreCredit ? Math.min(storeCredit, total) : 0;
  const effectiveCreditPaidNow = hasStoreCredit ? appliedStoreCredit : creditPaidNow;

  const manualCreditInvalid = !hasStoreCredit && method === "credit" && creditPaidNow >= total;
  const canSubmit = method !== "credit" || (selectedClient !== null && !manualCreditInvalid);

  // Selecting a client unmounts the search input (a focused node being
  // removed from the DOM drops focus to <body>, silently swallowing the next
  // Enter press) — when there's no store credit, the freshly-mounted
  // MoneyInput grabs focus on its own (see its `autoFocus` below); when the
  // credit auto-applies, there's no input to focus at all, so this puts focus
  // on "Finalizar" instead, letting a keyboard-only flow chain straight
  // through search → select → Enter to finalize.
  useEffect(() => {
    if (selectedClient && hasStoreCredit) submitButtonRef.current?.focus();
  }, [selectedClient, hasStoreCredit]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(method, method === "credit" ? selectedClient!.id : null, method === "credit" && effectiveCreditPaidNow > 0 ? effectiveCreditPaidNow : null);
  }

  function confirmWith(m: PaymentMethod) {
    if (m === "credit" && (!selectedClient || manualCreditInvalid)) return;
    onConfirm(m, m === "credit" ? selectedClient!.id : null, m === "credit" && effectiveCreditPaidNow > 0 ? effectiveCreditPaidNow : null);
  }

  /** `←`/`→` move both the selection and focus between the method buttons —
   * standard roving-tabindex radiogroup pattern. `Enter` is handled
   * explicitly too: a focused `type="button"` only re-fires its own click,
   * it doesn't submit the form on its own, so without this Enter would do
   * nothing while focus sits on a method button. */
  function handleMethodKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex = e.key === "ArrowRight" ? Math.min(index + 1, methods.length - 1) : Math.max(index - 1, 0);
      setMethod(methods[nextIndex].value);
      methodButtonRefs.current[nextIndex]?.focus();
    } else if (e.key === "Enter" && !submitting) {
      e.preventDefault();
      confirmWith(methods[index].value);
    }
  }

  function handleClientInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (clientSuggestions.length > 0) selectClient(clientSuggestions[0]);
    else startAddClient();
  }

  function handleNewClientKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveNewClient();
    } else if (e.key === "Escape") {
      // Intercepted here so Esc only cancels this sub-form (with its own
      // dirty check) instead of bubbling to `Modal`'s own Escape handler,
      // which would close the whole "Finalizar venda" modal instead.
      e.preventDefault();
      e.stopPropagation();
      requestCancelAddClient();
    }
  }

  return (
    <>
      <Modal title="Finalizar venda" onClose={submitting ? undefined : onClose}>
        <form onSubmit={handleSubmit}>
          <p className="mb-3 text-sm text-theme-3">
            Total <span className="text-lg font-bold text-theme-1">{fmt(total)}</span>
          </p>
          <label className="mb-1 block text-xs font-semibold text-theme-3">Forma de pagamento</label>
          <div className={`grid gap-2 ${methods.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
            {methods.map((m, i) => (
              <button
                key={m.value}
                ref={(el) => {
                  methodButtonRefs.current[i] = el;
                }}
                type="button"
                autoFocus={m.value === method}
                onClick={() => setMethod(m.value)}
                onKeyDown={(e) => handleMethodKeyDown(e, i)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs font-semibold ${
                  method === m.value ? "border-primary bg-primary-soft text-primary" : "border-theme-border text-theme-2"
                }`}
              >
                <span className="text-lg">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-theme-3">
            <Kbd>←</Kbd>/<Kbd>→</Kbd> escolher forma de pagamento
          </p>

          {method === "credit" && (
            <div className="mt-4 border-t border-theme-border pt-4">
              {selectedClient ? (
                <div>
                  <div className="flex items-center justify-between rounded-lg border border-theme-border bg-primary-soft px-3 py-2.5">
                    <div>
                      <div className="text-sm font-semibold text-theme-1">{selectedClient.name}</div>
                      <div className="text-xs text-theme-3">
                        {hasStoreCredit ? `Crédito com a loja: ${fmt(storeCredit)}` : `Saldo atual: ${fmt(selectedClient.balance)}`}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSelectedClient(null);
                        setCreditPaidNow(0);
                      }}
                    >
                      Trocar
                    </Button>
                  </div>
                  <div className="mt-3">
                    {hasStoreCredit ? (
                      <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-xs">
                        <p className="font-semibold text-success">Cliente possui saldo com a loja</p>
                        <p className="mt-1 text-theme-3">
                          {appliedStoreCredit >= total
                            ? "O saldo cobre o valor total da venda — será quitada automaticamente."
                            : `${fmt(appliedStoreCredit)} do saldo serão usados automaticamente nesta venda. Saldo Crediário após: ${fmt(round2(total - appliedStoreCredit))}.`}
                        </p>
                      </div>
                    ) : (
                      <>
                        <label className="mb-1 block text-xs font-semibold text-theme-3">Valor pago agora (opcional)</label>
                        <MoneyInput value={creditPaidNow} onChange={setCreditPaidNow} max={total} autoFocus />
                        {manualCreditInvalid ? (
                          <p className="mt-1 text-[11px] text-danger">
                            Isso é o valor total da venda — pra pagamento total, escolha Dinheiro, Cartão ou PIX em vez de Crediário.
                          </p>
                        ) : (
                          creditPaidNow > 0 && (
                            <p className="mt-1 text-[11px] text-theme-3">
                              Saldo Crediário após esta venda: {fmt(round2(selectedClient.balance + total - creditPaidNow))}
                            </p>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : addingClient ? (
                <div className="rounded-lg bg-theme-raised p-3" onKeyDown={handleNewClientKeyDown}>
                  <label className="mb-1 block text-xs font-semibold text-theme-3">Nome *</label>
                  <input
                    required
                    autoFocus
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Ex.: Maria Fernandes"
                    className="mb-2 w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
                  />
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-theme-3">Telefone</label>
                      <PhoneInput value={newClientPhone} onChange={setNewClientPhone} placeholder="(opcional)" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-theme-3">Data de lembrete</label>
                      <input
                        type="date"
                        value={newClientReminder}
                        onChange={(e) => setNewClientReminder(e.target.value)}
                        className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
                      />
                    </div>
                  </div>
                  <label className="mb-1 block text-xs font-semibold text-theme-3">Observação</label>
                  <input
                    value={newClientNote}
                    onChange={(e) => setNewClientNote(e.target.value)}
                    placeholder="Texto livre (opcional)"
                    className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
                  />
                  {clientError && <p className="mt-2 text-xs text-danger">{clientError}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={requestCancelAddClient}>
                      Cancelar
                    </Button>
                    <Button type="button" variant="primary" disabled={savingClient} onClick={handleSaveNewClient}>
                      Salvar e vincular
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-theme-3">Cliente</label>
                  <input
                    ref={clientInputRef}
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    onKeyDown={handleClientInputKeyDown}
                    placeholder="Buscar cliente por nome..."
                    className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
                  />
                  <div className="mt-2 overflow-hidden rounded-lg border border-theme-border">
                    {clientSuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectClient(c)}
                        className="flex w-full items-center justify-between border-b border-theme-border px-3 py-2 text-left text-sm hover:bg-theme-hover"
                      >
                        <span className="text-theme-1">{c.name}</span>
                        <span className="text-xs text-theme-3">
                          {c.balance < 0 ? `Crédito com a loja: ${fmt(round2(-c.balance))}` : `Saldo atual: ${fmt(c.balance)}`}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={startAddClient}
                      className="w-full px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-theme-hover"
                    >
                      + Adicionar novo cliente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Voltar <Kbd>Esc</Kbd>
            </Button>
            <Button ref={submitButtonRef} type="submit" variant="primary" disabled={submitting || !canSubmit}>
              Finalizar <Kbd>Enter</Kbd>
            </Button>
          </div>
        </form>
      </Modal>

      {confirmDiscardClient && (
        <ConfirmModal
          title="Descartar cadastro?"
          message="Você tem dados não salvos neste cliente. Cancelar agora descarta o que foi digitado."
          confirmLabel="Descartar"
          danger
          onConfirm={() => {
            setConfirmDiscardClient(false);
            setAddingClient(false);
            resetNewClientFields();
          }}
          onCancel={() => setConfirmDiscardClient(false)}
        />
      )}
    </>
  );
}
