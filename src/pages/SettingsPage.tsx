import { useEffect, useState } from "react";
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
  setLowStockPercent,
  setReceiptThankYouMessage,
  setReceiptsFolder,
  setStoreInfo,
  setStoreName,
  updateMyAutoLock,
} from "../lib/api";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Checkbox } from "../components/Checkbox";
import { RestoreBackupModal } from "../components/RestoreBackupModal";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useToast } from "../context/ToastContext";
import { useUpdater } from "../context/UpdaterContext";
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

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const { currentVersion, checkNow } = useUpdater();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [lowStockPercent, setLowStockPercentState] = useState<number | null>(null);
  const [profitMargin, setProfitMarginState] = useState<number | null>(null);
  const [storeName, setStoreNameState] = useState<string | null>(null);
  const [storeInfo, setStoreInfoState] = useState<string | null>(null);
  const [thankYouMessage, setThankYouMessageState] = useState<string | null>(null);
  const [creditEnabled, setCreditEnabledState] = useState<boolean | null>(null);
  const [backupFolder, setBackupFolderState] = useState<string | null | undefined>(undefined);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [receiptsFolder, setReceiptsFolderState] = useState<ReceiptsFolderInfo | null>(null);

  useEffect(() => {
    if (user?.isAdmin) {
      getLowStockPercent()
        .then(setLowStockPercentState)
        .catch((err) => logger.error("falha ao ler percentual de alerta", err));
      getDefaultProfitMargin()
        .then(setProfitMarginState)
        .catch((err) => logger.error("falha ao ler margem de lucro padrão", err));
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

  return (
    <div className="grid max-w-3xl grid-cols-2 gap-4">
      <Card title="Aparência">
        <label className="mb-1.5 block text-xs font-semibold text-theme-3">Tema</label>
        <ThemeSwitcher />
        <p className="mt-2.5 text-xs text-theme-3">Preferência salva no seu perfil e lembrada entre reinícios.</p>
      </Card>

      <Card title="Bloqueio automático">
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
      </Card>

      <Card title="Diagnóstico">
        <Button variant="secondary" onClick={handleOpenLogDir}>
          Abrir pasta de logs
        </Button>
        <p className="mt-2.5 text-xs text-theme-3">
          Caso o app apresente algum problema, os arquivos de log ficam aqui — encaminhe pra investigação.
        </p>

        <div className="mt-4 border-t border-theme-border pt-4">
          <p className="text-xs text-theme-3">Versão atual: {currentVersion ? `v${currentVersion}` : "—"}</p>
          <Button variant="secondary" className="mt-2" onClick={handleCheckUpdate} disabled={checkingUpdate}>
            {checkingUpdate ? "Verificando…" : "Verificar atualizações"}
          </Button>
        </div>
      </Card>

      {user.isAdmin && lowStockPercent !== null && (
        <Card title="Alerta de estoque baixo">
          <label className="mb-1.5 block text-xs font-semibold text-theme-3">Percentual de aviso (chip amarelo)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={lowStockPercent}
              onChange={(e) => handleLowStockPercentChange(Number(e.target.value))}
              className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <span className="text-sm text-theme-3">%</span>
          </div>
          <p className="mt-2.5 text-xs text-theme-3">
            Acima da quantidade mínima de cada item, definida no cadastro — só exibido para Administrador.
          </p>
        </Card>
      )}

      {user.isAdmin && profitMargin !== null && (
        <Card title="Precificação">
          <label className="mb-1.5 block text-xs font-semibold text-theme-3">% de lucro padrão</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={profitMargin}
              onChange={(e) => handleProfitMarginChange(Number(e.target.value))}
              className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <span className="text-sm text-theme-3">%</span>
          </div>
          <p className="mt-2.5 text-xs text-theme-3">
            Ao cadastrar um item novo, o preço de venda é sugerido automaticamente (custo + esse percentual) — ainda
            editável antes de salvar.
          </p>
        </Card>
      )}

      {user.isAdmin && creditEnabled !== null && (
        <Card title="Crediário">
          <Checkbox label="Aceitar Crediário como forma de pagamento" checked={creditEnabled} onChange={handleCreditEnabledChange} />
          <p className="mt-2.5 text-xs text-theme-3">
            Só pode ser desativado se não houver nenhum devedor com saldo em aberto (tela Devedores).
          </p>
        </Card>
      )}

      {user.isAdmin && backupFolder !== undefined && (
        <Card title="Backup" className="col-span-2">
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
            O banco de dados é copiado para essa pasta (arquivo fixo <code>stockly-backup.db</code>, sobrescrito a cada
            execução) ao abrir o app e, em seguida, a cada 10 minutos enquanto ele permanece aberto.
          </p>

          <div className="mt-5 border-t border-theme-border pt-5">
            <Button variant="secondary" onClick={handleChooseRestoreFile}>
              Restaurar backup
            </Button>
            <p className="mt-2.5 text-xs text-theme-3">
              Substitui todos os dados atuais pelos de um arquivo .db escolhido. O app reinicia sozinho depois de
              restaurar.
            </p>
          </div>
        </Card>
      )}

      {user.isAdmin && storeName !== null && storeInfo !== null && (
        <Card title="Recibo" className="col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-theme-3">Nome da loja</label>
          <input
            value={storeName}
            onChange={(e) => setStoreNameState(e.target.value)}
            onBlur={handleStoreNameBlur}
            placeholder="BORA VENDER"
            className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
          <p className="mt-1.5 text-xs text-theme-3">
            Aparece em negrito no topo do recibo, no lugar de "BORA VENDER". Deixe em branco pra manter o padrão.
          </p>

          <label className="mb-1.5 mt-4 block text-xs font-semibold text-theme-3">Informações adicionais</label>
          <textarea
            value={storeInfo}
            onChange={(e) => setStoreInfoState(e.target.value)}
            onBlur={handleStoreInfoBlur}
            rows={3}
            placeholder={"CNPJ: 00.000.000/0000-00\nTelefone: (00) 00000-0000"}
            className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
          <p className="mt-1.5 text-xs text-theme-3">
            Uma linha por linha digitada — aparece logo abaixo do nome da loja no recibo, antes de "Recibo de Venda".
          </p>

          {thankYouMessage !== null && (
            <>
              <label className="mb-1.5 mt-4 block text-xs font-semibold text-theme-3">Mensagem de agradecimento</label>
              <input
                value={thankYouMessage}
                onChange={(e) => setThankYouMessageState(e.target.value)}
                onBlur={handleThankYouMessageBlur}
                className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
              />
              <p className="mt-1.5 text-xs text-theme-3">Aparece no rodapé do recibo, logo abaixo da forma de pagamento.</p>
            </>
          )}

          {receiptsFolder && (
            <div className="mt-5 border-t border-theme-border pt-5">
              <label className="mb-1.5 block text-xs font-semibold text-theme-3">Pasta dos recibos em PDF</label>
              <p className="text-xs text-theme-3">Pasta atual: {receiptsFolder.path}</p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={handleChooseReceiptsFolder}>
                  {receiptsFolder.isCustom ? "Alterar pasta" : "Selecionar pasta"}
                </Button>
                {receiptsFolder.isCustom && (
                  <Button variant="secondary" onClick={handleUseDefaultReceiptsFolder}>
                    Usar pasta padrão
                  </Button>
                )}
              </div>
              <p className="mt-2.5 text-xs text-theme-3">Vale pra recibos novos a partir de agora — os já gerados continuam onde estavam.</p>
            </div>
          )}
        </Card>
      )}

      {restorePath && <RestoreBackupModal path={restorePath} onClose={() => setRestorePath(null)} />}
    </div>
  );
}
