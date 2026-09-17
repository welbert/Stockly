# Bora Vender

App desktop de controle de estoque e vendas (PDV) para uso local em um único computador — sem nuvem, sem sincronização, sem telemetria. Pensado para o dia a dia de um pequeno comércio: cadastrar itens, vender rápido (principalmente via teclado) e acompanhar o que entra e sai do caixa.

## Funcionalidades

- **Perfis Administrador e Usuário** — login por seletor de perfil (escolhe quem é, digita só a senha); Usuário comum tem um menu reduzido, sem acesso a cadastro, dashboard ou relatórios
- **Estoque** — cadastro de itens por código único, categorias, alerta de estoque baixo (crítico e de atenção), importação/exportação em CSV com tela de conferência antes de aplicar
- **Venda (PDV) rápida via teclado** — busca de item por código ou nome, atalhos para desconto, cancelamento e finalização, sem depender do mouse
- **Recibo em PDF** — gerado a cada venda, numeração sequencial, com opção de reimprimir/regerar a qualquer momento
- **Crediário e Devedores** — venda fiado vinculada a um cliente, controle de saldo em aberto, lembrete de cobrança e histórico de pagamentos
- **Dashboard personalizável** — cards de vendas, estoque baixo, valores recebidos e devedores, arrastáveis e redimensionáveis
- **Relatórios** — vendas por período, por categoria/item, e margem de lucro
- **Backup automático do banco** — ao abrir o app e a cada 10 minutos, sem precisar de ação manual
- **Atualização automática** — o app verifica e instala novas versões sozinho
- **Tema claro/escuro**

## Instalação

Baixe o instalador mais recente na página de [Releases](https://github.com/welbert/Stockly/releases).

## Build a partir do código-fonte

**Pré-requisitos:** [Rust](https://rustup.rs), [Node.js](https://nodejs.org), [pnpm](https://pnpm.io)

```bash
git clone https://github.com/welbert/Stockly
cd Stockly
pnpm install
pnpm tauri build
```

O instalador Windows (NSIS) é gerado em `src-tauri/target/release/bundle/nsis/`.

Para desenvolvimento com hot-reload:

```bash
pnpm tauri dev
```

## Dados e privacidade

Tudo fica em um arquivo SQLite local — nada sai da sua máquina.

| Dado | Local |
|---|---|
| Banco de dados | `%APPDATA%\com.welbert.stockly\` |
| Backup | pasta escolhida em Configurações |

## Desenvolvimento

Para arquitetura, convenções e documentação técnica, veja o [`CLAUDE.md`](CLAUDE.md).
