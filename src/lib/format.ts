export function fmt(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Formata um `datetime('now')` do SQLite (UTC, "YYYY-MM-DD HH:MM:SS") pro
 * horário local, ex.: "16/09/2026 22:10". */
export function fmtDateTime(sqliteDatetime: string): string {
  const date = new Date(sqliteDatetime.replace(" ", "T") + "Z");
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
