import { FormEvent, ReactNode, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { ClientSummary, UserSummary } from "../lib/api";
import { createClient, updateClient, verifyPassword } from "../lib/api";
import { Button } from "./Button";
import { CnpjInput, isValidCnpj } from "./CnpjInput";
import { ConfirmModal } from "./ConfirmModal";
import { CpfInput, isValidCpf } from "./CpfInput";
import { Modal } from "./Modal";
import { PhoneInput } from "./PhoneInput";
import { logger } from "../logger";

interface ClientFormModalProps {
  /** Present = editing an existing client; absent = registering a new one. */
  initial?: ClientSummary;
  /** Only used when renaming a client with an open Crediário balance requires
   * authorization (see below) — feeds the admin picker. */
  admins: UserSummary[];
  onSaved: (client: ClientSummary) => void;
  onClose: () => void;
}

type DocumentType = "cpf" | "cnpj" | null;

const DOCUMENT_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: null, label: "Não informado" },
  { value: "cpf", label: "Pessoa física (CPF)" },
  { value: "cnpj", label: "Pessoa jurídica (CNPJ)" },
];

/** Full client form — "+ Novo cliente"/"Editar cliente" on the Clientes
 * screen. The quick-add step inline in `PaymentModal`'s Crediário flow is a
 * separate, simpler mini-form (name/phone/reminder/note only, no document or
 * birth date) — deliberately kept fast for checkout, not a second instance of
 * this component. No field here requires an admin password — **except**
 * renaming a client who already has an open Crediário balance, which
 * protects the debt ledger's identity from an operator's mistake/abuse (same
 * authorization pattern as discount/cancel-sale/cancel-payment). */
export function ClientFormModal({ initial, admins, onSaved, onClose }: ClientFormModalProps) {
  const { user } = useAuth();
  const editing = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [reminderDate, setReminderDate] = useState(initial?.reminderDate ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [documentType, setDocumentType] = useState<DocumentType>(initial?.documentType ?? null);
  const [documentNumber, setDocumentNumber] = useState(initial?.documentNumber ?? "");
  const [adminId, setAdminId] = useState(admins[0]?.id ?? 0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    name !== (initial?.name ?? "") ||
    phone !== (initial?.phone ?? "") ||
    reminderDate !== (initial?.reminderDate ?? "") ||
    note !== (initial?.note ?? "") ||
    birthDate !== (initial?.birthDate ?? "") ||
    documentType !== (initial?.documentType ?? null) ||
    documentNumber !== (initial?.documentNumber ?? "");

  const nameChanged = Boolean(initial) && name.trim() !== initial?.name;
  const clientHasDebt = (initial?.balance ?? 0) > 0;
  const needsAuthUI = nameChanged && clientHasDebt && !user?.isAdmin;

  // Only flagged once the field reaches its full length — no point flashing
  // "CPF inválido" while the operator is still mid-digit.
  const documentComplete = documentType === "cpf" ? documentNumber.length === 11 : documentType === "cnpj" ? documentNumber.length === 14 : false;
  const documentValid = !documentComplete || (documentType === "cpf" ? isValidCpf(documentNumber) : isValidCnpj(documentNumber));

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function selectDocumentType(next: DocumentType) {
    setDocumentType(next);
    setDocumentNumber("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsAuthUI && !password) {
      setError("Senha do administrador é obrigatória");
      return;
    }
    if (documentComplete && !documentValid) {
      setError(documentType === "cpf" ? "CPF inválido" : "CNPJ inválido");
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
      const input = {
        name,
        phone: phone.trim() || null,
        reminderDate: reminderDate || null,
        note: note.trim() || null,
        birthDate: birthDate || null,
        documentType,
        documentNumber: documentNumber || null,
      };
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
      logger.error("falha ao salvar cliente", initial ? initial.id : "novo", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal title={editing ? "Editar cliente" : "Novo cliente"} onClose={requestClose}>
        <form onSubmit={handleSubmit}>
          <Field label="Nome *">
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone">
              <PhoneInput value={phone} onChange={setPhone} placeholder="(opcional)" />
            </Field>
            <Field label="Data de nascimento">
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Data de lembrete">
            <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Observação">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Texto livre (opcional)" className={inputClass} />
          </Field>

          <Field label="Documento">
            <div className="mb-2 grid grid-cols-3 gap-2">
              {DOCUMENT_OPTIONS.map((opt) => {
                const selected = documentType === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => selectDocumentType(opt.value)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                      selected ? "border-primary bg-primary-soft text-primary" : "border-theme-border text-theme-2"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {documentType === "cpf" && <CpfInput value={documentNumber} onChange={setDocumentNumber} />}
            {documentType === "cnpj" && <CnpjInput value={documentNumber} onChange={setDocumentNumber} />}
            {documentComplete && !documentValid && (
              <p className="mt-1 text-[11px] text-danger">{documentType === "cpf" ? "CPF inválido" : "CNPJ inválido"}</p>
            )}
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
              <p className="mt-1 text-[11px] text-theme-3">Renomear um cliente com saldo em aberto exige autorização de administrador.</p>
            </>
          )}

          {error && <p className="mb-2 mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting || (needsAuthUI && admins.length === 0) || (documentComplete && !documentValid)}
            >
              Salvar cliente
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
          message="Você tem alterações não salvas neste cliente. Fechar agora descarta o que foi digitado."
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
