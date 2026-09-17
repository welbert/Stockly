export function fmt(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Same as `fmtDate` but with the year — used where the date alone (dd/mm)
 * would be ambiguous, e.g. a client's Devedores detail header. */
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

/** Remove acentos e normaliza pra minúsculas — usado por toda busca de texto
 * do app (Estoque, PDV) pra casar "lampada" com "Lâmpada". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}
