export function fmt(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Same as `fmtDate` but with the year — used where the date alone (dd/mm)
 * would be ambiguous, e.g. a client's Clientes detail header. */
export function fmtDateFull(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Formata um `datetime('now')` do SQLite (UTC, "YYYY-MM-DD HH:MM:SS") pro
 * horário local, ex.: "16/09/2026 22:10". */
export function fmtDateTime(sqliteDatetime: string): string {
  const date = new Date(sqliteDatetime.replace(" ", "T") + "Z");
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** `YYYY-MM-DD` local (não UTC) de um `datetime('now')` do SQLite — mesma
 * conversão de `fmtDateTime`, usado pra comparar contra `<input type="date">`
 * ou pra agrupar vendas por dia (ex.: relatórios, gráfico "vendas por dia"). */
export function localDateKey(sqliteDatetime: string): string {
  const d = new Date(sqliteDatetime.replace(" ", "T") + "Z");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Remove acentos e normaliza pra minúsculas — usado por toda busca de texto
 * do app (Estoque, PDV) pra casar "lampada" com "Lâmpada". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

/** Payment method label shown on the receipt preview, "Ver venda" and
 * Histórico de vendas — shared here so the three don't drift apart. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: "Dinheiro", card: "Cartão", pix: "PIX", credit: "Crediário" };
