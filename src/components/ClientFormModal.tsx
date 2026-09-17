import { FormEvent, ReactNode, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { ClientSummary, UserSummary } from "../lib/api";
import { createClient, updateClient, verifyPassword } from "../lib/api";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";
import { Modal } from "./Modal";
import { PhoneInput } from "./PhoneInput";
import { logger } from "../logger";

interface ClientFormModalProps {
  /** Present = editing an existing debtor; absent = registering a new one. */
  initial?: ClientSummary;
  /** Only used when renaming a debtor with an open balance requires
   * authorization (see below) — feeds the admin picker. */
  admins: UserSummary[];
  onSaved: (client: ClientSummary) => void;
  onClose: () => void;
}

/** Same form used both by "+ Novo devedor" on the Devedores screen and
 * (inline, without this Modal around it) by the Crediário step in Venda — see
 * `PaymentModal`. No field here requires an admin password (see "Crediário e
 * Devedores" in `Plans/PLANO.md`) — **except** renaming a debtor who already
 * has an open Crediário balance, which protects the debt ledger's identity
 * from an operator's mistake/abuse (same authorization pattern as
 * discount/cancel-sale/cancel-payment). */
export function ClientFormModal({ initial, admins, onSaved, onClose }: ClientFormModalProps) {
  const { user } = useAuth();
  const editing = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [reminderDate, setReminderDate] = useState(initial?.reminderDate ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [adminId, setAdminId] = useState(admins[0]?.id ?? 0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    name !== (initial?.name ?? "") ||
    phone !== (initial?.phone ?? "") ||
    reminderDate !== (initial?.reminderDate ?? "") ||
    note !== (initial?.note ?? "");

  const nameChanged = Boolean(initial) && name.trim() !== initial?.name;
  const clientHasDebt = (initial?.balance ?? 0) > 0;
  const needsAuthUI = nameChanged && clientHasDebt && !user?.isAdmin;

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsAuthUI && !password) {
      setError("Senha do administrador é obrigatória");
      return;
    }
    setSubmitting(true);
    try {
      if (needsAuthUI) {
        const ok = await verifyPassword(adminId, password);
        if (!ok) {
          setError("Senha incorreta");
          setSubmitting(false);
          return;
        }
      }
      const input = { name, phone: phone.trim() || null, reminderDate: reminderDate || null, note: note.trim() || null };
      const saved = initial
        ? await updateClient({
            id: initial.id,
            ...input,
            authorizerId: needsAuthUI ? adminId : null,
            authorizerPassword: needsAuthUI ? password : null,
          })
        : await createClient(input);
      onSaved(saved);
    } catch (err) {
      logger.error("falha ao salvar devedor", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal title={editing ? "Editar devedor" : "Novo devedor"} onClose={requestClose}>
        <form onSubmit={handleSubmit}>
          <Field label="Nome *">
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone">
              <PhoneInput value={phone} onChange={setPhone} placeholder="(opcional)" />
            </Field>
            <Field label="Data de lembrete">
              <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Observação">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Texto livre (opcional)" className={inputClass} />
          </Field>

          {needsAuthUI && (
            <>
              <hr className="my-3 border-theme-border" />
              <label className="mb-1 block text-xs font-semibold text-theme-3">Senha do administrador</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-[2] rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
                />
                <select
                  value={adminId}
                  onChange={(e) => setAdminId(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-theme-border bg-theme-bg px-2 py-2 text-sm text-theme-1 outline-none"
                >
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-theme-3">Renomear um devedor com saldo em aberto exige autorização de administrador.</p>
            </>
          )}

          {error && <p className="mb-2 mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || (needsAuthUI && admins.length === 0)}>
              Salvar devedor
            </Button>
          </div>
          {needsAuthUI && admins.length === 0 && (
            <p className="mt-2 text-xs text-danger">Nenhum administrador ativo cadastrado para autorizar.</p>
          )}
        </form>
      </Modal>

      {confirmDiscard && (
        <ConfirmModal
          title="Descartar alterações?"
          message="Você tem alterações não salvas neste devedor. Fechar agora descarta o que foi digitado."
          confirmLabel="Descartar"
          danger
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-semibold text-theme-3">{label}</label>
      {children}
    </div>
  );
}
