/** Single source of truth for the Relatórios menu, its routes and each
 * report's title/subtitle — consumed by `AppShell` (nav tree), `App.tsx`
 * (route registration) and `ReportPlaceholderPage` (header/body text), so
 * adding a report is one entry here instead of three places kept in sync by
 * hand. Scope decided with the product owner: the original 11, plus
 * **Comparativo de períodos** and **Descontos concedidos** (each added after
 * the fact, on request — considered important enough on its own to not
 * wait) — a further candidate list (Ticket médio, Vendas canceladas,
 * Margem/lucro, Estoque valorizado, Previsão de ruptura) is still
 * deliberately left out of the menu until prioritized. Every report here has
 * its own route/component now — `ReportPlaceholderPage` only ever renders
 * for a slug that isn't in this catalog at all. */
export interface ReportDef {
  slug: string;
  label: string;
  subtitle: string;
}

export interface ReportGroupDef {
  id: string;
  label: string;
  reports: ReportDef[];
}

export const REPORT_GROUPS: ReportGroupDef[] = [
  {
    id: "vendas",
    label: "Vendas",
    reports: [
      { slug: "vendas-periodo", label: "Vendas por período", subtitle: "Total vendido e nº de vendas em um intervalo" },
      { slug: "vendas-categoria-item", label: "Vendas por categoria / item", subtitle: "Distribuição das vendas, por categoria ou por item" },
      { slug: "vendas-forma-pagamento", label: "Vendas por forma de pagamento", subtitle: "Dinheiro, Cartão, PIX e Crediário no período" },
      { slug: "vendas-operador", label: "Vendas por operador", subtitle: "Quem vendeu o quê, quanto, no período" },
      { slug: "comparativo-periodos", label: "Comparativo de períodos", subtitle: "Um mês contra outro, à sua escolha" },
      { slug: "descontos-concedidos", label: "Descontos concedidos", subtitle: "Quanto, por quem foi autorizado, em quais vendas" },
    ],
  },
  {
    id: "estoque",
    label: "Estoque",
    reports: [
      { slug: "movimentacao-estoque", label: "Movimentação de estoque", subtitle: "Consulta do ledger stock_movements" },
      { slug: "historico-preco", label: "Histórico de alteração de preço", subtitle: "Consulta do ledger item_price_history" },
      { slug: "itens-parados", label: "Itens sem movimento", subtitle: "Itens sem venda há N dias — candidatos a promoção/descontinuação" },
    ],
  },
  {
    id: "crediario",
    label: "Crediário/Clientes",
    reports: [
      { slug: "inadimplencia-aging", label: "Inadimplência", subtitle: "Saldo em aberto agrupado por faixa de atraso" },
      { slug: "pagamentos-recebidos", label: "Pagamentos recebidos", subtitle: "Quitações de Crediário no período" },
      { slug: "pagamentos-cancelados", label: "Pagamentos cancelados", subtitle: "Auditoria de pagamentos revertidos" },
    ],
  },
  {
    id: "auditoria",
    label: "Auditoria",
    reports: [
      { slug: "autorizacoes-admin", label: "Autorizações de Administrador", subtitle: "Toda ação que precisou de senha de Admin, num só lugar" },
    ],
  },
];

const REPORTS_BY_SLUG = new Map(REPORT_GROUPS.flatMap((g) => g.reports).map((r) => [r.slug, r]));

export function findReport(slug: string | undefined): ReportDef | undefined {
  return slug ? REPORTS_BY_SLUG.get(slug) : undefined;
}

export function reportPath(slug: string): string {
  return `/relatorios/${slug}`;
}
