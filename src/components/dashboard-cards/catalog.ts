import { ComponentType } from "react";
import type { CardSize } from "../../lib/api";
import { ComparativoMensalCard } from "./ComparativoMensalCard";
import { CreditoEmAbertoCard } from "./CreditoEmAbertoCard";
import { DescontosConcedidosCard } from "./DescontosConcedidosCard";
import { DevedoresLembreteCard } from "./DevedoresLembreteCard";
import { EstoqueBaixoCard } from "./EstoqueBaixoCard";
import { FormasPagamentoCard } from "./FormasPagamentoCard";
import { ItensEmEstoqueCard } from "./ItensEmEstoqueCard";
import { ItensEstoqueBaixoCard } from "./ItensEstoqueBaixoCard";
import { RecebidosHojeCard } from "./RecebidosHojeCard";
import { RecebidosMesCard } from "./RecebidosMesCard";
import { TopItensVendidosCard } from "./TopItensVendidosCard";
import { UltimasVendasCard } from "./UltimasVendasCard";
import { ValorEmEstoqueCard } from "./ValorEmEstoqueCard";
import { VendasCanceladasCard } from "./VendasCanceladasCard";
import { VendasHojeCard } from "./VendasHojeCard";
import { VendasMesCard } from "./VendasMesCard";
import { VendasPorCategoriaCard } from "./VendasPorCategoriaCard";
import { VendasPorPeriodoCard } from "./VendasPorPeriodoCard";
import type { DashboardCardProps } from "./types";

export type CardKey =
  | "itens_em_estoque"
  | "valor_em_estoque"
  | "vendas_hoje"
  | "vendas_mes"
  | "recebidos_hoje"
  | "recebidos_mes"
  | "estoque_baixo"
  | "itens_estoque_baixo"
  | "vendas_por_periodo"
  | "vendas_por_categoria"
  | "top_itens_vendidos"
  | "formas_pagamento"
  | "ultimas_vendas"
  | "comparativo_mensal"
  | "devedores_lembrete"
  | "credito_em_aberto"
  | "descontos_concedidos"
  | "vendas_canceladas";

export type CardCatalogEntry = {
  label: string;
  /** Explains what the card shows — feeds the "?" tooltip on the card itself
   * and the text in the "+ Adicionar card" drawer. */
  description: string;
  allowedSizes: CardSize[];
  component: ComponentType<DashboardCardProps>;
};

/**
 * Order also drives the reading order in the "+ Adicionar card" drawer.
 * `allowedSizes` reflects the real shape of the content — a stat is always
 * compact ("1x1"/"2x1"), a donut is narrow-and-tall (never full width), a
 * table/list benefits from more height, and the trend chart wants width.
 * The 1st entry of each list is the size used when the card is added from
 * the drawer.
 */
export const CARD_CATALOG: Record<CardKey, CardCatalogEntry> = {
  itens_em_estoque: {
    label: "Itens em estoque",
    description: "Soma da quantidade de todos os itens ativos no estoque.",
    allowedSizes: ["1x1"],
    component: ItensEmEstoqueCard,
  },
  valor_em_estoque: {
    label: "Valor em estoque",
    description: "Valor de custo do estoque (preço de custo × quantidade), não o valor de venda.",
    allowedSizes: ["1x1"],
    component: ValorEmEstoqueCard,
  },
  vendas_hoje: {
    label: "Vendas hoje",
    description: "Total vendido hoje (vendas concluídas, sem contar canceladas).",
    allowedSizes: ["1x1"],
    component: VendasHojeCard,
  },
  vendas_mes: {
    label: "Vendas no mês",
    description: "Total vendido no mês atual (vendas concluídas, sem contar canceladas).",
    allowedSizes: ["1x1"],
    component: VendasMesCard,
  },
  recebidos_hoje: {
    label: "Valores recebidos hoje",
    description: "Dinheiro/Cartão/PIX de hoje + quitações de Crediário recebidas hoje — diferente de \"Vendas hoje\" por causa do Crediário.",
    allowedSizes: ["1x1"],
    component: RecebidosHojeCard,
  },
  recebidos_mes: {
    label: "Valores recebidos no mês",
    description: "Dinheiro/Cartão/PIX do mês + quitações de Crediário recebidas no mês.",
    allowedSizes: ["1x1"],
    component: RecebidosMesCard,
  },
  estoque_baixo: {
    label: "Itens em estoque baixo",
    description: "Quantidade de itens com estoque igual ou abaixo do mínimo definido.",
    allowedSizes: ["1x1"],
    component: EstoqueBaixoCard,
  },
  itens_estoque_baixo: {
    label: "Lista de estoque baixo",
    description: "Lista dos itens com estoque igual ou abaixo do mínimo definido, do mais crítico pro menos.",
    allowedSizes: ["2x2", "2x3", "4x2", "4x3"],
    component: ItensEstoqueBaixoCard,
  },
  vendas_por_periodo: {
    label: "Vendas por período",
    description: "Gráfico de vendas dos últimos 7 dias.",
    allowedSizes: ["4x2", "6x2", "6x3"],
    component: VendasPorPeriodoCard,
  },
  vendas_por_categoria: {
    label: "Vendas por categoria",
    description: "Distribuição das vendas do mês atual por categoria de item.",
    allowedSizes: ["2x1", "2x2"],
    component: VendasPorCategoriaCard,
  },
  top_itens_vendidos: {
    label: "Top itens vendidos",
    description: "Itens mais vendidos (por quantidade) no mês atual.",
    allowedSizes: ["2x2", "2x3", "4x2", "4x3"],
    component: TopItensVendidosCard,
  },
  formas_pagamento: {
    label: "Formas de pagamento",
    description: "Distribuição das vendas do mês atual por forma de pagamento.",
    allowedSizes: ["2x1", "2x2"],
    component: FormasPagamentoCard,
  },
  ultimas_vendas: {
    label: "Últimas vendas",
    description: "Lista das vendas mais recentes, com data/hora, recibo e operador.",
    allowedSizes: ["2x2", "2x3", "4x2", "4x3"],
    component: UltimasVendasCard,
  },
  comparativo_mensal: {
    label: "Comparativo mensal",
    description: "Variação percentual das vendas do mês atual em relação ao mês anterior.",
    allowedSizes: ["1x1"],
    component: ComparativoMensalCard,
  },
  devedores_lembrete: {
    label: "Devedores com lembrete",
    description: "Clientes com saldo em aberto cujo lembrete está próximo ou vencido.",
    allowedSizes: ["2x2", "2x3", "4x2"],
    component: DevedoresLembreteCard,
  },
  credito_em_aberto: {
    label: "Total em Crediário em aberto",
    description: "Soma do saldo em aberto de todos os clientes do Crediário.",
    allowedSizes: ["1x1"],
    component: CreditoEmAbertoCard,
  },
  descontos_concedidos: {
    label: "Descontos concedidos",
    description: "Soma dos descontos (item + geral) das vendas concluídas no mês atual.",
    allowedSizes: ["1x1"],
    component: DescontosConcedidosCard,
  },
  vendas_canceladas: {
    label: "Vendas canceladas",
    description: "Quantidade e valor total das vendas canceladas/estornadas no mês atual.",
    allowedSizes: ["1x1"],
    component: VendasCanceladasCard,
  },
};

export const GRID_COLS = 6;

/** Width (1st number, direct in `GRID_COLS` columns) × height (2nd number,
 * in rows of `ROW_HEIGHT` px) — generated to cover every "WxH" from 1x1 to 6x3. */
export const SIZE_DIMENSIONS: Record<CardSize, { w: number; h: number }> = Object.fromEntries(
  Array.from({ length: GRID_COLS }, (_, i) => i + 1).flatMap((w) => [1, 2, 3].map((h) => [`${w}x${h}`, { w, h }])),
) as Record<CardSize, { w: number; h: number }>;
