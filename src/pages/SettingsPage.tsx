import { ReactNode, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAuth } from "../context/AuthContext";
import type { ReceiptsFolderInfo } from "../lib/api";
import {
  clearBackupFolder,
  clearReceiptsFolder,
  effectiveAutoLockMinutes,
  getBackupFolder,
  getCreditEnabled,
  getDefaultProfitMargin,
  getItemCodePadLength,
  getLowStockPercent,
  getReceiptThankYouMessage,
  getReceiptsFolder,
  getStoreInfo,
  getStoreName,
  openLogDir,
  runBackup,
  setBackupFolder,
  setCreditEnabled,
  setDefaultProfitMargin,
  setItemCodePadLength,
  setLowStockPercent,
  setReceiptThankYouMessage,
  setReceiptsFolder,
  setStoreInfo,
  setStoreName,
  updateMyAutoLock,
} from "../lib/api";
import { Accordion } from "../components/Accordion";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { FontScaleSwitcher } from "../components/FontScaleSwitcher";
import { RestoreBackupModal } from "../components/RestoreBackupModal";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useToast } from "../context/ToastContext";
import { useUpdater } from "../context/UpdaterContext";
import { normalize } from "../lib/format";
import { logger } from "../logger";

const AUTO_LOCK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Nunca" },
  { value: 1, label: "1 minuto" },
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
];

interface GroupMeta {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  adminOnly: boolean;
  /** fieldId → search aliases (the field's actual on-screen label, plus any
   * synonym someone might type instead) — the single source of truth the
   * search bar matches against, both to decide whether the whole group
   * shows up and to hide individual non-matching fields within it. Aliases,
   * not just the literal label, so e.g. "aviso" still finds the low-stock
   * field even though its label is "Percentual de aviso (chip amarelo)". */
  fields: Record<string, string[]>;
}

const GROUPS: GroupMeta[] = [
  {
    id: "perfil",
    icon: "🎨",
    title: "Perfil e aparência",
    subtitle: "Tema, tamanho da fonte, bloqueio automático",
    adminOnly: false,
    fields: {
      tema: ["Tema"],
      fonte: ["Tamanho da fonte", "Acessibilidade"],
      autoLock: ["Bloquear por inatividade após", "Bloqueio automático"],
    },
  },
  {
    id: "loja",
    icon: "🧾",
    title: "Loja e recibo",
    subtitle: "Identidade da loja e conteúdo do PDF de recibo",
    adminOnly: true,
    fields: {
      storeName: ["Nome da loja"],
      storeInfo: ["Informações adicionais"],
      thankYou: ["Mensagem de agradecimento"],
      receiptsFolder: ["Pasta dos recibos em PDF", "Pasta de recibos"],
    },
  },
  {
    id: "estoque",
    icon: "📦",
    title: "Estoque e precificação",
    subtitle: "Alertas, margem padrão, código automático, crediário",
    adminOnly: true,
    fields: {
      lowStock: ["Percentual de aviso (chip amarelo)", "Alerta de estoque baixo", "Estoque baixo"],
      profitMargin: ["% de lucro padrão", "Precificação", "Margem de lucro"],
      itemCodePad: ["Dígitos do código automático (zero à esquerda)", "Código automático de item"],
      credit: ["Crediário", "Aceitar Crediário como forma de pagamento"],
    },
  },
  {
    id: "backup",
    icon: "💾",
    title: "Backup e restauração",
    subtitle: "Cópia automática do banco e restauração manual",
    adminOnly: true,
    fields: {
      backupFolder: ["Pasta de backup", "Backup"],
      restoreBackup: ["Restaurar backup"],
    },
  },
  {
    id: "sistema",
    icon: "⚙️",
    title: "Sistema e diagnóstico",
    subtitle: "Logs e atualizações do aplicativo",
    adminOnly: false,
    fields: {
      logDir: ["Pasta de logs"],
      updates: ["Atualizações", "Verificar atualizações", "Versão atual"],
    },
  },
];

/** One field inside an `Accordion` group — `null` (unmounted, not just
 * hidden) when it doesn't match the current search so `Accordion`'s
 * "any child visible" grid never reserves empty space for it. */
function Field({ visible, span = 1, children }: { visible: boolean; span?: 1 | 2; children: ReactNode }) {
  if (!visible) return null;
  return <div className={span === 2 ? "sm:col-span-2" : ""}>{children}</div>;
}

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const { currentVersion, checkNow } = useUpdater();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [lowStockPercent, setLowStockPercentState] = useState<number | null>(null);
  const [profitMargin, setProfitMarginState] = useState<number | null>(null);
  const [itemCodePadLength, setItemCodePadLengthState] = useState<number | null>(null);
  const [storeName, setStoreNameState] = useState<string | null>(null);
  const [storeInfo, setStoreInfoState] = useState<string | null>(null);
  const [thankYouMessage, setThankYouMessageState] = useState<string | null>(null);
  const [creditEnabled, setCreditEnabledState] = useState<boolean | null>(null);
  const [backupFolder, setBackupFolderState] = useState<string | null | undefined>(undefined);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [receiptsFolder, setReceiptsFolderState] = useState<ReceiptsFolderInfo | null>(null);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["perfil"]));

  useEffect(() => {
    if (user?.isAdmin) {
      getLowStockPercent()
        .then(setLowStockPercentState)
        .catch((err) => logger.error("falha ao ler percentual de alerta", err));
      getDefaultProfitMargin()
        .then(setProfitMarginState)
        .catch((err) => logger.error("falha ao ler margem de lucro padrão", err));
      getItemCodePadLength()
        .then(setItemCodePadLengthState)
        .catch((err) => logger.error("falha ao ler número de dígitos do código automático", err));
      getStoreName()
        .then(setStoreNameState)
        .catch((err) => logger.error("falha ao ler nome da loja", err));
      getStoreInfo()
        .then(setStoreInfoState)
        .catch((err) => logger.error("falha ao ler informações adicionais da loja", err));
      getReceiptThankYouMessage()
        .then(setThankYouMessageState)
        .catch((err) => logger.error("falha ao ler mensagem de agradecimento do recibo", err));
      getCreditEnabled()
        .then(setCreditEnabledState)
        .catch((err) => logger.error("falha ao ler se o Crediário está habilitado", err));
      getBackupFolder()
        .then(setBackupFolderState)
        .catch((err) => logger.error("falha ao ler pasta de backup", err));
      getReceiptsFolder()
        .then(setReceiptsFolderState)
        .catch((err) => logger.error("falha ao ler pasta de recibos", err));
    }
  }, [user]);

  if (!user) return null;

  const normalizedSearch = normalize(search.trim());

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Whether the group itself matches the search — its title, or any alias of
   * any field inside it. Drives both whether the group renders at all and
   * whether it's force-opened while searching. */
  function groupMatches(meta: GroupMeta): boolean {
    if (!normalizedSearch) return true;
    if (normalize(meta.title).includes(normalizedSearch)) return true;
    return Object.values(meta.fields).some((aliases) => aliases.some((a) => normalize(a).includes(normalizedSearch)));
  }

  /** A field is visible when there's no search, the group already matched by
   * title (so every field inside stays visible), or one of that field's own
   * aliases matches. */
  function fieldVisible(meta: GroupMeta, fieldId: string): boolean {
    if (!normalizedSearch) return true;
    if (normalize(meta.title).includes(normalizedSearch)) return true;
    const aliases = meta.fields[fieldId] ?? [];
    return aliases.some((a) => normalize(a).includes(normalizedSearch));
  }

  function isGroupOpen(meta: GroupMeta): boolean {
    return normalizedSearch ? groupMatches(meta) : openGroups.has(meta.id);
  }

  async function handleAutoLockChange(value: number) {
    try {
      const updated = await updateMyAutoLock(value);
      setUser(updated);
    } catch (err) {
      logger.error("falha ao salvar tempo de bloqueio", err);
    }
  }

  async function handleLowStockPercentChange(value: number) {
    setLowStockPercentState(value);
    try {
      await setLowStockPercent(value);
    } catch (err) {
      logger.error("falha ao salvar percentual de alerta", err);
    }
  }

  async function handleProfitMarginChange(value: number) {
    setProfitMarginState(value);
    try {
      await setDefaultProfitMargin(value);
    } catch (err) {
      logger.error("falha ao salvar margem de lucro padrão", err);
    }
  }

  async function handleItemCodePadLengthChange(value: number) {
    setItemCodePadLengthState(value);
    try {
      await setItemCodePadLength(value);
    } catch (err) {
      logger.error("falha ao salvar número de dígitos do código automático", err);
    }
  }

  async function handleStoreNameBlur() {
    if (storeName === null) return;
    try {
      await setStoreName(storeName);
    } catch (err) {
      logger.error("falha ao salvar nome da loja", err);
    }
  }

  async function handleStoreInfoBlur() {
    if (storeInfo === null) return;
    try {
      await setStoreInfo(storeInfo);
    } catch (err) {
      logger.error("falha ao salvar informações adicionais da loja", err);
    }
  }

  async function handleThankYouMessageBlur() {
    if (thankYouMessage === null) return;
    try {
      await setReceiptThankYouMessage(thankYouMessage);
    } catch (err) {
      logger.error("falha ao salvar mensagem de agradecimento do recibo", err);
    }
  }

  async function handleOpenLogDir() {
    try {
      await openLogDir();
    } catch (err) {
      logger.error("falha ao abrir pasta de logs", err);
      showToast({ type: "error", title: "Não foi possível abrir a pasta de logs", message: String(err) });
    }
  }

  /** Manual counterpart of `UpdaterProvider`'s automatic startup check — same
   * `checkNow()`, so a found update shows the exact same `UpdateModal`
   * (shared `phase` state). Only this button's own "up to date" feedback is
   * local — the automatic check stays silent when nothing's new. */
  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    try {
      const found = await checkNow();
      if (!found) showToast({ type: "success", title: "Você já está na versão mais recente" });
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleCreditEnabledChange(value: boolean) {
    try {
      await setCreditEnabled(value);
      setCreditEnabledState(value);
    } catch (err) {
      logger.error("falha ao alterar disponibilidade do Crediário", err);
      showToast({ type: "error", title: "Não foi possível alterar a disponibilidade do Crediário", message: String(err) });
    }
  }

  async function handleChooseBackupFolder() {
    let selected: string | string[] | null;
    try {
      selected = await open({ directory: true, multiple: false });
    } catch (err) {
      logger.error("falha ao selecionar pasta de backup", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de pasta" });
      return;
    }
    if (!selected || Array.isArray(selected)) return;
    try {
      await setBackupFolder(selected);
      setBackupFolderState(selected);
    } catch (err) {
      logger.error("falha ao salvar pasta de backup", selected, err);
      showToast({ type: "error", title: "Não foi possível salvar a pasta de backup" });
      return;
    }
    try {
      await runBackup();
      showToast({ type: "success", title: "Pasta de backup atualizada", message: "Backup feito com sucesso." });
    } catch (err) {
      logger.error("falha ao rodar backup inicial após configurar a pasta", err);
      showToast({ type: "error", title: "Pasta de backup atualizada, mas o backup inicial falhou", message: String(err) });
    }
  }

  async function handleDisableBackup() {
    try {
      await clearBackupFolder();
      setBackupFolderState(null);
      showToast({ type: "success", title: "Backup automático desativado" });
    } catch (err) {
      logger.error("falha ao desativar backup automático", err);
      showToast({ type: "error", title: "Não foi possível desativar o backup" });
    }
  }

  async function handleChooseReceiptsFolder() {
    let selected: string | string[] | null;
    try {
      selected = await open({ directory: true, multiple: false });
    } catch (err) {
      logger.error("falha ao selecionar pasta de recibos", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de pasta" });
      return;
    }
    if (!selected || Array.isArray(selected)) return;
    try {
      await setReceiptsFolder(selected);
      setReceiptsFolderState(await getReceiptsFolder());
      showToast({ type: "success", title: "Pasta de recibos atualizada" });
    } catch (err) {
      logger.error("falha ao salvar pasta de recibos", selected, err);
      showToast({ type: "error", title: "Não foi possível salvar a pasta de recibos" });
    }
  }

  async function handleUseDefaultReceiptsFolder() {
    try {
      await clearReceiptsFolder();
      setReceiptsFolderState(await getReceiptsFolder());
      showToast({ type: "success", title: "Voltou a usar a pasta padrão de recibos" });
    } catch (err) {
      logger.error("falha ao voltar pra pasta padrão de recibos", err);
      showToast({ type: "error", title: "Não foi possível voltar pra pasta padrão" });
    }
  }

  async function handleChooseRestoreFile() {
    let selected: string | string[] | null;
    try {
      selected = await open({ directory: false, multiple: false, filters: [{ name: "Banco de dados", extensions: ["db"] }] });
    } catch (err) {
      logger.error("falha ao selecionar arquivo de backup", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!selected || Array.isArray(selected)) return;
    setRestorePath(selected);
  }

  const [perfilMeta, lojaMeta, estoqueMeta, backupMeta, sistemaMeta] = GROUPS;
  const visibleGroups = GROUPS.filter((g) => (!g.adminOnly || user.isAdmin) && groupMatches(g));
  const noResults = normalizedSearch !== "" && visibleGroups.length === 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-theme-border bg-theme-surface px-3.5 py-2.5">
        <span className="text-theme-3" aria-hidden>
          🔍
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar configuração (ex: recibo, backup, crediário...)"
          className="w-full border-none bg-transparent text-sm text-theme-1 outline-none placeholder:text-theme-3"
        />
      </div>

      {noResults && (
        <div className="rounded-xl border border-theme-border bg-theme-surface px-5 py-10 text-center text-sm text-theme-3">
          Nenhuma configuração encontrada.
        </div>
      )}

      {visibleGroups.includes(perfilMeta) && (
        <Accordion
          icon={perfilMeta.icon}
          title={perfilMeta.title}
          subtitle={perfilMeta.subtitle}
          open={isGroupOpen(perfilMeta)}
          onToggle={() => toggleGroup(perfilMeta.id)}
        >
          <Field visible={fieldVisible(perfilMeta, "tema")}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Tema</label>
            <ThemeSwitcher />
            <p className="mt-2.5 text-xs text-theme-3">Preferência salva no seu perfil e lembrada entre reinícios.</p>
          </Field>

          <Field visible={fieldVisible(perfilMeta, "fonte")} span={2}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Tamanho da fonte</label>
            <FontScaleSwitcher />
            <p className="mt-2.5 text-xs text-theme-3">
              Ajusta o texto do app inteiro. Preferência salva no seu perfil e lembrada entre reinícios — não afeta o
              PDF do recibo.
            </p>
          </Field>

          <Field visible={fieldVisible(perfilMeta, "autoLock")}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Bloquear por inatividade após</label>
            <select
              value={effectiveAutoLockMinutes(user) ?? 0}
              onChange={(e) => handleAutoLockChange(Number(e.target.value))}
              className="rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            >
              {AUTO_LOCK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-2.5 text-xs text-theme-3">
              Padrão para {user.isAdmin ? "Administrador" : "Usuário"}: {user.isAdmin ? "5 minutos" : "Nunca"}.
            </p>
          </Field>
        </Accordion>
      )}

      {visibleGroups.includes(lojaMeta) && (
        <Accordion
          icon={lojaMeta.icon}
          title={lojaMeta.title}
          subtitle={lojaMeta.subtitle}
          adminBadge
          open={isGroupOpen(lojaMeta)}
          onToggle={() => toggleGroup(lojaMeta.id)}
        >
          <Field visible={fieldVisible(lojaMeta, "storeName") && storeName !== null} span={2}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Nome da loja</label>
            <input
              value={storeName ?? ""}
              onChange={(e) => setStoreNameState(e.target.value)}
              onBlur={handleStoreNameBlur}
              placeholder="BORA VENDER"
              className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <p className="mt-1.5 text-xs text-theme-3">
              Aparece em negrito no topo do recibo, no lugar de "BORA VENDER". Deixe em branco pra manter o padrão.
            </p>
          </Field>

          <Field visible={fieldVisible(lojaMeta, "storeInfo") && storeInfo !== null} span={2}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Informações adicionais</label>
            <textarea
              value={storeInfo ?? ""}
              onChange={(e) => setStoreInfoState(e.target.value)}
              onBlur={handleStoreInfoBlur}
              rows={3}
              placeholder={"CNPJ: 00.000.000/0000-00\nTelefone: (00) 00000-0000"}
              className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <p className="mt-1.5 text-xs text-theme-3">
              Uma linha por linha digitada — aparece logo abaixo do nome da loja no recibo, antes de "Recibo de Venda".
            </p>
          </Field>

          <Field
            visible={fieldVisible(lojaMeta, "thankYou") && thankYouMessage !== null}
            span={2}
          >
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Mensagem de agradecimento</label>
            <input
              value={thankYouMessage ?? ""}
              onChange={(e) => setThankYouMessageState(e.target.value)}
              onBlur={handleThankYouMessageBlur}
              className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <p className="mt-1.5 text-xs text-theme-3">Aparece no rodapé do recibo, logo abaixo da forma de pagamento.</p>
          </Field>

          <Field visible={fieldVisible(lojaMeta, "receiptsFolder") && receiptsFolder !== null} span={2}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Pasta dos recibos em PDF</label>
            <p className="text-xs text-theme-3">Pasta atual: {receiptsFolder?.path}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={handleChooseReceiptsFolder}>
                {receiptsFolder?.isCustom ? "Alterar pasta" : "Selecionar pasta"}
              </Button>
              {receiptsFolder?.isCustom && (
                <Button variant="secondary" onClick={handleUseDefaultReceiptsFolder}>
                  Usar pasta padrão
                </Button>
              )}
            </div>
            <p className="mt-2.5 text-xs text-theme-3">
              Vale pra recibos novos a partir de agora — os já gerados continuam onde estavam.
            </p>
          </Field>
        </Accordion>
      )}

      {visibleGroups.includes(estoqueMeta) && (
        <Accordion
          icon={estoqueMeta.icon}
          title={estoqueMeta.title}
          subtitle={estoqueMeta.subtitle}
          adminBadge
          open={isGroupOpen(estoqueMeta)}
          onToggle={() => toggleGroup(estoqueMeta.id)}
        >
          <Field visible={fieldVisible(estoqueMeta, "lowStock") && lowStockPercent !== null}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Percentual de aviso (chip amarelo)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={lowStockPercent ?? 0}
                onChange={(e) => handleLowStockPercentChange(Number(e.target.value))}
                className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
              />
              <span className="text-sm text-theme-3">%</span>
            </div>
            <p className="mt-2.5 text-xs text-theme-3">
              Acima da quantidade mínima de cada item, definida no cadastro — só exibido para Administrador.
            </p>
          </Field>

          <Field visible={fieldVisible(estoqueMeta, "profitMargin") && profitMargin !== null}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">% de lucro padrão</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={profitMargin ?? 0}
                onChange={(e) => handleProfitMarginChange(Number(e.target.value))}
                className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
              />
              <span className="text-sm text-theme-3">%</span>
            </div>
            <p className="mt-2.5 text-xs text-theme-3">
              Ao cadastrar um item novo, o preço de venda é sugerido automaticamente (custo + esse percentual) — ainda
              editável antes de salvar.
            </p>
          </Field>

          <Field visible={fieldVisible(estoqueMeta, "itemCodePad") && itemCodePadLength !== null}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">
              Dígitos do código automático (zero à esquerda)
            </label>
            <input
              type="number"
              min="1"
              max="10"
              step="1"
              value={itemCodePadLength ?? 0}
              onChange={(e) => handleItemCodePadLengthChange(Number(e.target.value))}
              className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <p className="mt-2.5 text-xs text-theme-3">
              Quando o código é deixado em branco no cadastro, o item recebe um número sequencial completado com
              zeros à esquerda (ex.: "0001"). Só um mínimo de dígitos — um item além dessa quantidade não é cortado.
              Não afeta um código digitado manualmente.
            </p>
          </Field>

          <Field visible={fieldVisible(estoqueMeta, "credit") && creditEnabled !== null}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Crediário</label>
            <Checkbox
              label="Aceitar Crediário como forma de pagamento"
              checked={creditEnabled ?? false}
              onChange={handleCreditEnabledChange}
            />
            <p className="mt-2.5 text-xs text-theme-3">
              Só pode ser desativado se não houver nenhum cliente com saldo em aberto (tela Clientes).
            </p>
          </Field>
        </Accordion>
      )}

      {visibleGroups.includes(backupMeta) && (
        <Accordion
          icon={backupMeta.icon}
          title={backupMeta.title}
          subtitle={backupMeta.subtitle}
          adminBadge
          open={isGroupOpen(backupMeta)}
          onToggle={() => toggleGroup(backupMeta.id)}
        >
          <Field visible={fieldVisible(backupMeta, "backupFolder") && backupFolder !== undefined} span={2}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Pasta de backup</label>
            <p className="text-sm text-theme-3">
              {backupFolder
                ? `Pasta atual: ${backupFolder}`
                : "Nenhuma pasta selecionada. O backup automático fica desativado até escolher uma."}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={handleChooseBackupFolder}>
                {backupFolder ? "Alterar pasta" : "Selecionar pasta"}
              </Button>
              {backupFolder && (
                <Button variant="secondary" onClick={handleDisableBackup}>
                  Desativar backup
                </Button>
              )}
            </div>
            <p className="mt-2.5 text-xs text-theme-3">
              O banco de dados é copiado para essa pasta (arquivo fixo <code>stockly-backup.db</code>, sobrescrito a
              cada execução) ao abrir o app e, em seguida, a cada 10 minutos enquanto ele permanece aberto.
            </p>
          </Field>

          <Field visible={fieldVisible(backupMeta, "restoreBackup") && backupFolder !== undefined} span={2}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Restaurar backup</label>
            <Button variant="secondary" onClick={handleChooseRestoreFile}>
              Restaurar backup
            </Button>
            <p className="mt-2.5 text-xs text-theme-3">
              Substitui todos os dados atuais pelos de um arquivo .db escolhido. O app reinicia sozinho depois de
              restaurar.
            </p>
          </Field>
        </Accordion>
      )}

      {visibleGroups.includes(sistemaMeta) && (
        <Accordion
          icon={sistemaMeta.icon}
          title={sistemaMeta.title}
          subtitle={sistemaMeta.subtitle}
          open={isGroupOpen(sistemaMeta)}
          onToggle={() => toggleGroup(sistemaMeta.id)}
        >
          <Field visible={fieldVisible(sistemaMeta, "logDir")}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Pasta de logs</label>
            <Button variant="secondary" onClick={handleOpenLogDir}>
              Abrir pasta de logs
            </Button>
            <p className="mt-2.5 text-xs text-theme-3">
              Caso o app apresente algum problema, os arquivos de log ficam aqui — encaminhe pra investigação.
            </p>
          </Field>

          <Field visible={fieldVisible(sistemaMeta, "updates")}>
            <label className="mb-1.5 block text-xs font-semibold text-theme-3">Atualizações</label>
            <p className="text-xs text-theme-3">Versão atual: {currentVersion ? `v${currentVersion}` : "—"}</p>
            <Button variant="secondary" className="mt-2" onClick={handleCheckUpdate} disabled={checkingUpdate}>
              {checkingUpdate ? "Verificando…" : "Verificar atualizações"}
            </Button>
          </Field>
        </Accordion>
      )}

      {restorePath && <RestoreBackupModal path={restorePath} onClose={() => setRestorePath(null)} />}
    </div>
  );
}
