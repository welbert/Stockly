# Stockly — Plano Inicial (superficial)

> Rascunho de arquitetura e escopo. Nível "visão geral" — os detalhes (schema exato, contratos de comando, telas pixel-a-pixel) ficam para quando a implementação começar, seguindo o mesmo padrão de documentação do CashVault (`docs/architecture.md`, `docs/database.md`, `docs/commands.md`, `docs/frontend.md`).
>
> Nome técnico do app: **Stockly** (identifier, tabelas, nomes de arquivo — ex. `com.welbert.stockly`, `stockly-backup.db`). **Nome de exibição na interface: "Bora Vender"** — é o que aparece pro usuário (sidebar, tela de login, recibo etc.); "Stockly" nunca aparece na UI.
>
> Repositório: [github.com/welbert/Stockly](https://github.com/welbert/Stockly) (já criado).
>
> Ícone do app: conceito **"Fachada de loja"**, paleta índigo (mesma cor primária dos mockups). Já gerado — `icon-source.png` (1024×1024, imagem-mestre) e `icon.ico` (multi-resolução 16-256px, pronto pra uso no Windows) na raiz do repositório. Quando o projeto for escaffoldado, `pnpm tauri icon icon-source.png` gera o conjunto completo de ícones do Tauri a partir da imagem-mestre.

## Visão geral

**Stockly** é um app desktop de controle de estoque com registro de vendas, para uso local (single-machine), com perfis de **administrador** e **usuário**. Mesma arquitetura do projeto irmão `CashVault` (`F:\VS\Pessoal\CashVault`): React + Tauri + SQLite.

## Stack (idêntica ao CashVault)

| Camada     | Tecnologia                            |
|------------|----------------------------------------|
| UI         | React 19 + TypeScript + Tailwind v4    |
| Roteamento | react-router-dom v6                    |
| Desktop    | Tauri v2                               |
| Backend    | Rust (Tauri commands)                  |
| Banco      | SQLite via `rusqlite` (bundled)        |
| Gráficos   | Chart.js + react-chartjs-2             |
| Build      | Vite v7                                |
| Gerenciador| pnpm                                   |

Bibliotecas adicionais previstas:
- **Geração de PDF: backend Rust com o crate `genpdf`** (decidido — ver justificativa em "Recibo em PDF" nas seções de Vendas e Relatórios).
- CSV: parsing/geração via crate Rust (`csv`) no backend, mantendo o padrão "backend é dono dos dados".
- `react-grid-layout`: dashboard customizável (drag/resize de cards), mesma lib usada no CashVault — ver seção "Dashboard".

## Estrutura de pastas (espelhando o CashVault)

```
Stockly/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── theme.ts / logger.ts
│   ├── pages/              # Dashboard, Estoque, Vendas, Relatórios, Usuários, Configurações, Login
│   ├── components/
│   ├── context/             # AuthContext (usuário logado / perfil), ToastContext
│   ├── hooks/
│   └── lib/
│       ├── api.ts           # única porta de invoke()
│       └── format.ts
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs
│   │   ├── db.rs             # init_db + migrate_db
│   │   ├── models.rs
│   │   └── commands/         # auth, users, products, categories, sales, receipts, reports, export, import, backup, logging
│   ├── Cargo.toml
│   ├── tauri.conf.json       # identifier: com.welbert.stockly
│   └── capabilities/default.json
├── .github/
│   └── workflows/
│       └── release.yml      # build + publish ao dar push numa tag vX.Y.Z — ver "Autoupdate"
└── docs/
```

## Autoupdate (atualização automática)

O app verifica e instala atualizações sozinho, sem o usuário precisar baixar/instalar manualmente — via `tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` (frontend) + `@tauri-apps/plugin-process` (pra reiniciar o app depois de instalar, `relaunch()`).

### Fluxo

1. App abre → alguns segundos depois, `check()` roda em background (não trava a UI).
2. Se tiver versão nova, mostra um aviso/modal com a versão atual e a nova — usuário confirma ou adia (adiar só esconde nesta sessão; abre de novo no próximo início).
3. Ao confirmar, `downloadAndInstall()` baixa o instalador com callback de progresso (eventos `Started`/`Progress`/`Finished`) — dá pra mostrar uma barra de progresso.
4. `relaunch()` reinicia o app já na versão nova.
5. Falha na verificação (sem internet, endpoint fora do ar) só é logada — nunca trava o app. Em `pnpm tauri dev` o `check()` sempre falha e o aviso nunca aparece (binário de dev não é assinado nem bate com a versão do endpoint) — comportamento esperado, não é bug.

### Assinatura das atualizações

- As atualizações são assinadas com um par de chaves **minisign**; o plugin recusa instalar qualquer artefato cuja assinatura não bata com a chave pública configurada.
- **Chave pública**: fica versionada em `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- **Chave privada**: só existe como GitHub Secret (`TAURI_SIGNING_PRIVATE_KEY`) — nunca é commitada. **Par de chaves já gerado** (não é mais um passo pendente — ver "Próximos passos").
- **Se a chave privada se perder**: não dá mais pra assinar releases futuras, e instalações já existentes param de continuar recebendo updates — vale fazer backup seguro do arquivo de chave assim que gerado.

### Diferença importante em relação a outros projetos: tudo no mesmo repositório

Em outros apps Tauri que já configurei, o updater apontava para um **repositório de releases separado e público**, porque o repositório do código era privado — o endpoint que o app consulta (`.../releases/latest/download/latest.json`) precisa ser acessível **sem autenticação**, e GitHub Releases de um repo privado não são. A solução lá era publicar os instaladores num repo público só pra isso, e depois espelhar (mirror) esses mesmos artefatos de volta pro repo privado, só por organização.

Para o Stockly, como você quer **tudo no mesmo repositório do código**, isso simplifica bastante o workflow (sem job de "mirror", sem token de acesso pessoal extra — só o `GITHUB_TOKEN` padrão do GitHub Actions, com permissão `contents: write` no job) — **mas com uma condição**: **o repositório precisa ser público**, senão o app não consegue consultar o endpoint de atualização sem autenticação. Se em algum momento o repositório precisar ser privado, a solução é voltar ao padrão do repositório de releases separado (só para hospedar os binários/manifest, o código continua privado).

### Configuração necessária (o "detalhe técnico" — fácil de esquecer)

| Arquivo | O que precisa ter |
|---|---|
| `src-tauri/tauri.conf.json` | `bundle.createUpdaterArtifacts: true`; `plugins.updater.pubkey` (chave pública) e `plugins.updater.endpoints` (URL do `latest.json` da release); Windows com `bundle.windows.nsis.installMode: "currentUser"` (evita exigir privilégio de admin pra instalar, o que complicaria o fluxo de update) |
| `src-tauri/capabilities/default.json` | Permissões `updater:default`, `updater:allow-check`, `updater:allow-download-and-install`, `process:default`, `process:allow-restart` |
| `src-tauri/Cargo.toml` | Dependências `tauri-plugin-updater = "2"` e `tauri-plugin-process = "2"` |
| `src-tauri/src/lib.rs` | Registrar os dois plugins no builder do Tauri (`.plugin(tauri_plugin_updater::Builder::new().build())`, `.plugin(tauri_plugin_process::init())`) |
| `package.json` (frontend) | Dependências `@tauri-apps/plugin-updater` e `@tauri-apps/plugin-process` |

### GitHub Actions (`.github/workflows/release.yml`)

- Disparado por **push de uma tag** no formato `vX.Y.Z`.
- Usa `tauri-apps/tauri-action@v0` pra buildar e já publicar a release (instalador + `latest.json`, via `includeUpdaterJson: true`) — como é single-repo, sem repositório de releases separado, o job só precisa de `permissions: contents: write` (sem PAT/secret adicional pra isso).
- **Build exclusivo Windows por enquanto** (decidido): matrix só com `windows-latest`, sem macOS/Linux — mais simples e rápido de manter, já que o Stockly roda no seu próprio Windows. Dá pra adicionar outras plataformas depois, se algum dia fizer sentido.
- **Versão sincronizada em 3 arquivos** antes de criar a tag: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (mesma regra de versionamento do CashVault).
- **Secrets necessários no GitHub**: `TAURI_SIGNING_PRIVATE_KEY` (conteúdo da chave privada) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (deixar vazio, se a chave não tiver senha). `GITHUB_TOKEN` já é fornecido automaticamente pelo Actions.

## Instância única e concorrência do SQLite

- **Instância única do app** (decidido — ver "Pontos da revisão"): usar o plugin `tauri-plugin-single-instance` — se o usuário tentar abrir o app com uma instância já rodando, a janela existente só recebe foco em vez de abrir uma segunda janela. Evita duas conexões escrevendo no mesmo SQLite ao mesmo tempo (`database is locked`), especialmente relevante com vendas em fluxo contínuo.
- **Backup via `VACUUM INTO` em vez de cópia bruta do arquivo `.db`** (decidido): `run_backup` (ver "Backup do banco" em Configurações) passa a rodar `VACUUM INTO '<pasta>/stockly-backup.db'` em vez de `std::fs::copy`. Copiar o arquivo bruto pode gerar backup inconsistente se a conexão ativa estiver em modo WAL (arquivos `-wal`/`-shm` separados, não refletidos numa cópia simples); `VACUUM INTO` é a forma segura do próprio SQLite de gerar uma cópia consistente com a conexão aberta.
- **Banco corrompido/inacessível na abertura** (decidido, escopo mínimo — ver "Pontos da revisão"): sem UI dedicada de recuperação por enquanto (baixa probabilidade, não prioridade agora). O único requisito é que a falha passe pelo **logger** (`logger.ts`/módulo `logging` do backend, já previstos na estrutura de pastas) em vez de estourar sem registro — o usuário consegue então abrir a pasta de logs (Configurações → Diagnóstico) e encaminhar pra investigação.

## Perfis e autenticação

- Dois papéis: **Administrador** e **Usuário**.
- Login simples (usuário + senha, hash no banco — mesmo cuidado que apps de senha da família de projetos).
- **Tela de login como seletor de perfil**: em vez de digitar o nome de usuário, a tela mostra a lista dos usuários já cadastrados (nome/avatar) — a pessoa escolhe quem é (clique ou navegação por setas + Enter) e só precisa digitar a senha. Facilita a troca de perfil no dia a dia (ex.: usuário comum termina o turno, admin escolhe seu próprio nome na lista e só digita a senha, sem redigitar usuário toda vez). Mantém o princípio de uso por teclado (setas para navegar a lista, Enter seleciona e leva o foco pro campo de senha).
- **Primeiro uso do app — banco sem nenhum usuário cadastrado** (decidido): a tela de login não mostra o seletor de perfil (não há ninguém pra listar); em vez disso mostra um formulário de **criação do primeiro Administrador** com os mesmos campos do cadastro normal de usuário — **Nome**, **Usuário** (login), **Senha** e **Confirmação de senha**. Esse primeiro usuário criado **sempre vira Administrador automaticamente** (sem seletor de papel no formulário) e o app **loga automaticamente** logo em seguida, sem pedir a senha de novo numa segunda tela.
- **Administrador**:
  - **Cadastra/edita/desativa usuários, incluindo outros administradores** (decidido): ao cadastrar um usuário novo ou editar um já existente, pode marcá-lo como Administrador. **Elevar um Usuário comum já existente para Administrador exige confirmação em modal** ("tem certeza que quer tornar [nome] administrador?") antes de aplicar — é uma mudança de permissão sensível o suficiente pra não acontecer sem essa checagem extra, mesmo sendo o próprio admin quem está fazendo.
  - Autoriza ações sensíveis via senha do admin (ver lista abaixo).
- **Usuário comum**:
  - Registra vendas.
  - Atualiza estoque (entradas, ajustes simples) de itens já cadastrados.
  - Sem acesso a cadastro de usuários.
  - **Menu reduzido** (decidido): o perfil Usuário não vê **Dashboard**, **Relatórios** nem **cadastrar novo item** — só o que precisa pro dia a dia (Venda, Estoque — sem criar item novo, só ajustar quantidade/dar entrada —, Configurações). Cadastrar item novo, ver o dashboard geral e os relatórios ficam exclusivos do Administrador.

### Ações sensíveis — decidido

Duas lógicas diferentes, que não devem ser confundidas:

**1) Exige senha do admin porque um Usuário comum pode iniciar a ação** (modal de autorização inline, sem perder o que estava em andamento):
- **Aplicar desconto na venda** (item ou total) — ver seção "Desconto" em Vendas.
- **Cancelar/estornar uma venda já registrada** — ver seção "Cancelamento / Estorno de venda" em Vendas.

**2) Exclusivo do Administrador — Usuário comum nem vê a opção, sem necessidade de senha extra** (pedir senha de novo seria redundante, já que só o admin acessa a tela/ação):
- Excluir um item do estoque (não só desativar).
- Ajuste manual de quantidade em estoque fora do fluxo normal de venda/entrada (correção de contagem/inventário).
- Excluir/desativar um usuário.
- Importar/Exportar CSV (já decidido em "Estoque").
- CRUD de categorias e cadastro de item novo (já decididos em "Estoque").

**3) Exclusivo do Administrador, mas com reconfirmação da própria senha** (não é autorizar outra pessoa — é uma proteção contra clique acidental, dado o tamanho do estrago):
- **Restaurar backup do banco** (sobrescreve *todo* o banco ativo, não só o estoque — ver "Backup do banco" em Configurações). Mais destrutivo que os itens do grupo 2 acima, por isso mantém a reconfirmação mesmo só o admin tendo acesso.

### Bloqueio automático por inatividade

- **Padrão por perfil** (decidido): **Administrador** bloqueia após **5 minutos sem atividade**; **Usuário comum** nunca bloqueia automaticamente por padrão.
- **Configurável por usuário** na tela de Configurações (ver abaixo) — cada perfil pode mudar o próprio tempo (ex.: "Nunca", 1, 5, 10, 15, 30 min, 1h), sobrescrevendo o padrão do seu papel. Preferência salva por usuário, mesmo padrão de persistência do tema.
- **Referência de implementação**: `F:\VS\Pessoal\Personal.TOTP` já tem um mecanismo de auto-lock configurável (`get_auto_lock_timeout`/`set_auto_lock_timeout`, dropdown em Configurações com as mesmas opções de tempo acima) — **mas o gatilho lá é diferente do que o Stockly precisa**: no TOTP, o timer só começa a contar quando a janela é **minimizada/ocultada na bandeja** (`hide_window` arma o timer; reabrir antes de expirar cancela). Isso funciona pro TOTP porque é um app que fica escondido na bandeja a maior parte do tempo.
- **Stockly precisa de um gatilho diferente**: o app fica aberto e visível no balcão/PDV o tempo todo (sem conceito de bandeja no plano), então o que importa é **inatividade real com a janela aberta** (ex.: funcionário sai do balcão e esquece o app logado) — não tempo minimizado. A ideia do TOTP serviu só de referência para o **conceito de bloqueio e a UI de configuração** (dropdown com opções de tempo); o gatilho de reset é diferente e específico do Stockly.
- **Contador reseta a cada ação do usuário** (decidido): qualquer interação com a janela em foco — clique, tecla digitada, leitura de código de barras (que é entrada de teclado), navegação entre telas — reinicia a contagem do zero. Só volta a contar quando o app fica realmente parado. Implementação: listener de atividade no frontend (ex.: `mousemove`/`keydown`/`click` a nível de documento) resetando o timer, em vez do gatilho de hide/tray do TOTP (que não reseta por atividade — só conta a partir do momento em que a janela é ocultada).
- **Tela de bloqueio**: ao expirar o tempo, sobrepõe uma tela pedindo a senha do usuário já logado (reaproveitando o passo 2 da tela de Login — só senha, sem repetir a escolha de perfil), sem perder o estado da tela em uso (ex.: venda em andamento continua ali depois de desbloquear).
- **"Sair e trocar de usuário" na própria tela de bloqueio** (decidido): se o usuário travado não está disponível pra digitar a própria senha (ex.: outro operador precisa usar a máquina agora), um link discreto encerra a sessão dele ali mesmo e volta pro seletor de perfil — atrás de uma confirmação, já que descarta o que estava em andamento (ex.: venda não finalizada). Sem essa saída, a única alternativa seria chamar o usuário travado ou fechar o app inteiro.

## Estoque

- **Cadastrar item novo é exclusivo do Administrador** (não aparece no menu/telas do Usuário comum — ver "Perfis e autenticação"); o usuário comum só ajusta a quantidade de itens já existentes.
- Cadastro de item: nome, **código** (obrigatório — identificador único do item, usado para busca rápida na venda; digitado manualmente — **sem suporte a leitor de código de barras no v1**, ver "Uso via teclado"), categoria (opcional), preço de custo, preço de venda, quantidade disponível, **quantidade mínima** (opcional/nulável — ver "Alerta de estoque baixo" abaixo).
- **Categoria opcional**: se não informada, o item aparece agrupado/listado como **"Categoria indefinida"** em telas de listagem, filtros e relatórios.
- **Validação básica** (decidido — ver "Pontos da revisão"): preço (custo/venda) e quantidade não podem ser negativos; **código duplicado é rejeitado com aviso** ao cadastrar (não cria item novo, nem incrementa nada — código continua sendo identificador único de verdade).
- **CRUD de categorias é exclusivo do Administrador** (decidido) — mesmo padrão do cadastro de item novo; Usuário comum não cadastra nem edita categoria.
- **Exportar/Importar CSV é exclusivo do Administrador** (decidido — não aparece no menu/telas do Usuário comum, mesmo padrão do cadastro de item novo).
- Exportar estoque atual para CSV.
- Importar CSV para atualizar o estoque disponível — ver "Importação de CSV — tela de resumo" abaixo para a política de merge (decidida).

### Importação de CSV — tela de resumo (decidido)

- **Antes de aplicar qualquer mudança**, o import mostra uma **tela de resumo** com os itens **novos**, **alterados** (diff campo a campo — valor atual → valor novo, não só o valor novo) e **ausentes no CSV**, para o admin conferir antes de confirmar. Essa tela é um passo adicional de conferência — não precisa de senha à parte, já que importar CSV já é exclusivo do Administrador (ver "Ações sensíveis" em "Perfis e autenticação").
- **Match de cada linha do CSV com um item cadastrado — código como chave primária**: se a linha trouxer um código que já existe no banco, é tratada como atualização direta (sem ambiguidade, é a mesma lógica de identificador único usada no cadastro de item).
- **Fallback por nome, só quando o código não bate com nada existente**: nesse caso, busca por nome **case-insensitive e acento-insensitive** (mesmo padrão já usado na busca de item da tela de Venda — "lampada" encontra "Lâmpada") entre os itens cadastrados, para sugerir se a linha é: (a) um item realmente novo, ou (b) uma variação/erro de digitação de um item já existente (ex.: CSV traz "Canet" e existe "Caneta" cadastrada).
- **Mapeamento manual na tela de resumo**: toda linha classificada como "possível item novo" pode ser **remapeada pelo admin** para um item já existente (busca/seleção manual), tratando a linha como atualização daquele item em vez de criar duplicata. Ao mapear manualmente, **o nome já cadastrado é mantido** (o nome vindo do CSV, ex. "Canet", é descartado) — só os demais campos (preço, quantidade etc.) são atualizados a partir da linha do CSV. Evita que um erro de digitação na planilha renomeie o item de verdade.
- **Itens ausentes no CSV** (existem no banco, mas não aparecem na planilha importada): a tela de resumo lista esses itens e o admin escolhe a ação no momento do import — **deixar como está** (padrão), **zerar quantidade**, ou **desativar**. Fica por import, não é uma regra fixa.

### Alerta de estoque baixo (versão inicial — decidido)

- **Quantidade mínima por item** define o limite **crítico (chip vermelho)**: quantidade atual ≤ mínima → alerta vermelho. Campo **nulável** — item sem mínima definida (ex.: item de teste) nunca dispara alerta.
- **Percentual global de aviso (chip amarelo)**: configurado uma única vez (não por item), define uma faixa de atenção **acima** do limite crítico — `limite_amarelo = ceil(quantidade_mínima × (1 + percentual / 100))`. Quantidade entre o limite amarelo e o limite vermelho (exclusive) → alerta amarelo; acima do limite amarelo → sem alerta.
  - Arredondamento sempre **para cima (ceil)**, para o aviso amarelo disparar cedo o suficiente em vez de coincidir quase com o vermelho.
  - Configuração do percentual fica em **Configurações**, mas **só é exibida no perfil Administrador** (não aparece na tela de Configurações do Usuário comum) — sem exigir senha à parte, já que não é uma ação sensível, só uma preferência de exibição.
- **Item com estoque zerado** usa o mesmo estado visual **vermelho crítico**, só com texto diferente no chip ("Sem estoque" em vez de "Estoque baixo") — não é um terceiro estado separado (ver também "Uso via teclado", busca de item na venda).
- Aparece destacado na listagem de Estoque, na busca de item da tela de Venda e no card "Itens com estoque baixo" do Dashboard.

### Histórico de movimentações de estoque (ledger) — decidido, sem tela própria por enquanto

- **Banco preparado desde a v1** para registrar, como um **ledger append-only** (nunca edita/apaga linha), todo evento que altera a quantidade de um item: venda, entrada, ajuste manual, cadastro inicial, importação de CSV, estorno de venda.
- **Cada linha do ledger guarda** (conceitual, schema exato fica pra quando a implementação começar): `item_id`, `tipo` do movimento, `quantidade` (delta — negativo em saída, positivo em entrada/estorno), `referência` (ex.: `venda_id` quando `tipo=venda`, pra rastrear até a origem), `usuário_id` e `data/hora`.
- **Convive com o campo `quantidade` do item** (não substitui): toda operação que mexe em estoque atualiza os dois na mesma transação — o campo do item continua sendo a leitura rápida do "quanto tem agora" (usado em listagem/filtro/ordenação); o ledger é o "porquê"/histórico por trás de cada mudança.
- **Motivo de gravar já na v1 mesmo sem consumidor ainda**: as features que dependem desse histórico (ver "Previsão de ruptura de estoque" em "Ideias extras") precisam de uma série ao longo do tempo — não dá pra gerar isso retroativamente depois. Gravar desde o início evita perder esse histórico enquanto a tela que vai consumi-lo não existe.
- **Sem tela/menu de consulta agora** (decidido) — isso fica pra quando "Sugestões"/"Previsão de ruptura de estoque" for implementada (ver "Ideias extras"). Por ora é só armazenamento.

## Uso via teclado (prioridade de UX)

O registro de venda precisa ser rápido usando **só o teclado**, sem depender de mouse:

- Tela de venda com foco automático no campo de busca do item ao abrir/reiniciar.
- Digitar o **código completo** + Enter adiciona o item direto à venda — sem passar pela lista de sugestões. **Mesmo bloqueio de estoque zerado do fluxo de sugestão (abaixo) vale aqui também** (decidido — ver "Pontos da revisão"): item com estoque zerado não é adicionado por esse caminho, mesma regra e mesma exceção ajustável.
- Digitar **nome (ou parte do nome/código)** abre uma lista de sugestões em tempo real, ordenada por relevância:
  1. Nome do produto **começa com** o texto digitado.
  2. Nome do produto **contém** o texto digitado em qualquer parte.
  - Busca sem diferenciar maiúsculas/minúsculas nem acentuação (ex.: "lampada" encontra "Lâmpada").
  - Navegação da lista por `↑`/`↓`, `Enter` adiciona o item selecionado (o primeiro da lista já vem pré-selecionado, então digitar + Enter direto também funciona no caso comum).
  - Cada sugestão mostra a **quantidade disponível em estoque** ao lado do nome/código.
  - Item com **estoque zerado** aparece destacado com o mesmo chip vermelho do "Alerta de estoque baixo" (texto "Sem estoque" — ver seção "Alerta de estoque baixo" em Estoque) e, por padrão, **não pode ser adicionado** à venda dessa forma — decisão assumida como padrão, ajustável se você quiser permitir vender mesmo sem estoque (ex.: encomenda/reserva, deixando o saldo negativo).
- Atalhos de teclado para as ações mais comuns: ajustar quantidade, remover item, finalizar venda, cancelar venda em andamento.
- Navegação entre campos por Tab/setas, sem "armadilhas" de foco.
- **Sem suporte a leitor de código de barras no v1** (decidido — ver "Pontos da revisão"): busca por código é só digitação manual. Como o app trataria um leitor como "entrada de teclado comum" mesmo assim (é a natureza do hardware), nada impede usar um leitor por fora nessa versão, mas nenhuma engenharia é feita pensando nesse caso específico (ex.: risco de rajada de dígitos cair no lugar errado se o foco estiver num modal, como um pedido de senha) — fica pra quando isso for reavaliado.

Esse princípio (tudo operável por teclado) vale como guia geral de UX do app, mas a tela de venda é onde é mais crítico.

## Vendas

- Registro de venda: seleciona item(ns) por **código** + quantidade, calcula total, baixa do estoque automaticamente.
- Ao concluir a venda, gera **recibo em PDF** (numeração sequencial — ver "Numeração do recibo" abaixo —, dados dos itens, total, data/hora, talvez nome do usuário que registrou).
- **Nota fiscal (NFC-e/SAT) está fora de escopo desta versão** (decidido — ver "Pontos da revisão"): o recibo em PDF é só comprovante interno, **sem valor de documento fiscal**. O próprio recibo deve trazer essa frase impressa (ex.: rodapé — "**Não possui valor de documento fiscal**"), pra deixar isso claro pro cliente que recebe o papel.
- **Impressora já definida**: usuário possui uma **Tomate MDK-082** (térmica, 80mm, USB, 203dpi — [ficha do produto](https://tomate.tv/products/perifericos/impressoras/impressora-termica-mdk-082)) — ver "Impressão física" abaixo para o que isso já decide e o que ainda depende de testar com o hardware em mãos.

### Geração de PDF — backend Rust com `genpdf` (decidido)

- **Gerado no backend, não no frontend** — mantém o mesmo princípio já usado em CSV/backup/numeração de recibo ("backend é dono dos dados").
- **Texto real (vetorial), não imagem**: descartada a rota `html2canvas` + `jsPDF` (comum em soluções puramente frontend) porque ela tira um "screenshot" do HTML e cola como imagem no PDF — o recibo viraria uma foto, não texto de verdade (arquivo maior, borra no zoom, não dá pra copiar/pesquisar o texto).
- **Crate escolhido: `genpdf`** (construído em cima do `printpdf`) em vez de `printpdf` puro — `genpdf` já traz parágrafo com quebra de linha automática e tabelas simples prontas, em vez de só desenhar texto/linha em coordenadas manuais. Isso importa porque **Relatórios reaproveita essa mesma geração de PDF** (ver seção "Relatórios") e lá o conteúdo é tabular (vendas por categoria/item, margem) — `genpdf` cobre bem tanto o recibo (layout simples, uma coluna) quanto os relatórios (tabela), sem precisar de duas abordagens diferentes.
- **Contrapartida aceita**: layout em `genpdf` ainda é mais manual que CSS (sem flexbox) — ajuste fino de espaçamento exige mais tentativa-e-erro que mexer no `.receipt` do mockup HTML. Como o recibo é simples (uma coluna, estilo cupom) e os relatórios são tabelas básicas, não deve ser um problema sério na prática.
- **Ordem: venda commita primeiro, PDF é gerado depois** (decidido — ver "Pontos da revisão"): a transação atômica é só **baixa de estoque + registro da venda + numeração do recibo** — o PDF **não** participa dela, já que escrita de arquivo não é coberta por transação de banco. Justificativa: se a venda não for salva, o PDF não vale nada mesmo; então a prioridade é a venda nunca ficar bloqueada por um problema de arquivo (disco cheio, permissão). Se a geração do PDF falhar depois do commit, a venda continua válida (registrada e com número de recibo), só sem o arquivo gerado naquele momento.
- **Ação de "reimprimir/regerar recibo"** (decidido, necessária por causa do ponto acima): como pode existir venda sem PDF gerado na hora, a tela de Histórico de vendas (ver "Vendas") precisa de uma ação que gera o PDF sob demanda a partir dos dados já salvos da venda, a qualquer momento — cobre tanto o caso de falha na geração original quanto o de simplesmente precisar de uma segunda via depois.

### Impressão física — impressora térmica Tomate MDK-082

- **Decidido agora**: a página do PDF do recibo (gerada pelo `genpdf`) usa **tamanho de rolo contínuo de 80mm de largura** (altura dinâmica conforme os itens), não A4/Carta — bate com a largura confirmada da MDK-082 e já é compatível com o layout "cupom" (fonte monoespaçada) que o mockup do recibo já usa. Independe de qual caminho de impressão física for usado (item abaixo).
- **Ainda em aberto — só dá pra confirmar com a impressora física em mãos**: existem dois caminhos bem diferentes pra imprimir de verdade, e qual serve depende do driver que vem com essa impressora (a ficha do produto não confirma isso; tem link de driver/manual no site do fabricante que não foi possível checar):
  1. **Impressão comum**: instala como impressora Windows normal (driver GDI), manda o PDF pro spooler do Windows — funciona desde que o driver esteja configurado com o papel como rolo contínuo de 80mm, não papel de página fixa.
  2. **ESC/POS bruto**: ignora o driver gráfico e manda comandos direto pra impressora (corte automático, negrito, abrir gaveta de dinheiro se houver) — mais comum em PDV "de verdade", mas é um pipeline **diferente** de "gerar PDF e imprimir" (o PDF do `genpdf` continua servindo pro "salvar/abrir" digital, mas o print físico não reaproveitaria ele nesse caminho).
  - Impressoras térmicas baratas vendidas assim no Brasil costumam vir com driver "genérico/texto" (ruim pra imprimir PDF/gráfico corretamente) **ou** um driver de verdade compatível com ESC/POS — só testar com o hardware (ou abrir o manual/driver) confirma qual dos dois é o caso da MDK-082.
- Enquanto isso não é testado, o fluxo continua sendo **gerar o PDF e abrir/salvar** (usuário imprime manualmente por fora se quiser).

### Botão "Imprimir" — verbo "print" do shell do Windows (decidido, v1)

- Em vez de só abrir o PDF, o botão de imprimir dispara o **verbo `print` do shell do Windows** sobre o arquivo gerado (`ShellExecuteW` com `"print"`, ou via `Command` chamando `powershell -Command "Start-Process -FilePath '<recibo.pdf>' -Verb Print"`) — sem dependência extra no instalador.
- **Limitação aceita por enquanto**: esse verbo não garante que uma caixa de diálogo de impressão apareça — depende de qual programa está associado a PDF na máquina do usuário. Alguns leitores abrem o diálogo (deixando escolher impressora/opções, como pedido); outros mandam direto pra impressora padrão sem perguntar nada.
- **Plano B, se isso atrapalhar no teste real com a Tomate MDK-082**: empacotar o **SumatraPDF** (leitor de PDF leve e gratuito) e usar `SumatraPDF.exe -print-dialog recibo.pdf`, que sempre abre o diálogo nativo do Windows independente do leitor padrão do usuário — custo de ~10MB a mais no instalador do Tauri. Só migrar pra essa opção se a v1 (verbo `print` do shell) se mostrar inconsistente na prática.

- **Histórico de vendas com busca** (para consulta, para a tela de relatórios e **pré-requisito da tela para localizar a venda a cancelar/estornar** — ver "Cancelamento / Estorno de venda" abaixo): filtro por data/período, número do recibo, cliente (quando Crediário) e/ou usuário que registrou.

### Numeração do recibo

- **Formato**: `{yyyyMMdd}{sequencial}` — data da venda seguida do sequencial **global e contínuo** (nunca reseta por dia/ano), sem separador.
- Sequencial com **zero-padding de 6 dígitos** (`000001` a `999999`) para manter o número com tamanho visualmente consistente — ex.: venda nº 157 em 16/09/2026 → `20260916000157`.
- O padding é só formatação de largura mínima, não um limite: se o sequencial passar de 999.999, o número simplesmente passa a ter 7+ dígitos (`1000000` em diante), sem necessidade de tratamento especial, reset ou migração — o contador em si (inteiro no banco) não tem limite prático.
- Facilita localizar a data da venda a partir do próprio número do recibo, sem precisar consultar o sistema (útil quando o cliente traz o recibo físico de volta).
- **Sequencial fica gap-free** mesmo com a separação entre commit da venda e geração do PDF (ver "Geração de PDF"): o número é atribuído dentro da mesma transação da venda, então só existe número pra venda que realmente foi salva — uma falha na geração do PDF depois não consome nem pula número nenhum.

### Cancelamento / Estorno de venda

- **Pré-requisito**: depende da tela de **Histórico de vendas com busca** (ver acima) — o fluxo é localizar a venda (por número do recibo, data, cliente etc.) e a partir dela acionar o cancelamento/estorno, não uma ação solta.
- **Exige senha do administrador** (decidido) — se quem está logado é usuário comum, abre o mesmo padrão de modal usado no desconto (senha ali mesmo, sem logout/login), registrando qual admin autorizou.
- Devolve os itens ao estoque (reverte a baixa feita na venda original).
- **Nunca apaga o histórico**: o registro original da venda permanece, marcado como **cancelada/estornada** (com data, usuário que solicitou e admin que autorizou), aparecendo assim em relatórios e no histórico de vendas.
- Se a venda cancelada envolvia **Crediário**, o estorno também reverte o saldo em aberto lançado para o cliente (ver "Crediário e Devedores").

### Desconto (item e venda)

- Desconto em **% ou valor absoluto**, aplicável tanto a um **item específico** da venda quanto ao **total da venda**.
- **Autorização**: se quem está logado é **administrador**, aplica direto. Se é **usuário comum**, abre um modal ali mesmo — sem logout/login, sem perder a venda em andamento — com **seletor de qual Administrador está autorizando + campo de senha** (decidido — resolve o caso de mais de um admin cadastrado; evita testar a senha contra todos os hashes até achar match) e registra qual admin autorizou (fica no histórico da venda, para auditoria).
- Atalho de teclado dedicado para abrir o desconto (ex.: `F6`), mantendo o fluxo 100% operável via teclado.
- Regras a valer desde o início:
  - Desconto não pode deixar preço/subtotal negativo (limite = valor do item ou da venda).
  - Percentual entre 0% e 100%.
- **Decisão assumida como padrão** (ajustar se não for o que você imaginou): quando há desconto por item **e** desconto geral na mesma venda, o desconto geral incide sobre o subtotal já com os descontos de item aplicados (sequencial, não exclusivo).
- **Precisão monetária: float, com arredondamento para 2 casas decimais após cada operação** (soma, desconto) — decidido (ver "Pontos da revisão"). **Ressalva conhecida e aceita**: em desconto sequencial (item → geral), cada arredondamento intermediário descarta uma fração pequena, então o total final pode ficar 1 centavo diferente do que uma conta com precisão total daria — risco considerado baixo/aceitável, mas registrado aqui caso vire problema real no uso.
- Recibo em PDF deve deixar claro o desconto aplicado (item e/ou geral) e o total antes/depois.

### Formas de pagamento

- Dinheiro, Cartão, PIX e **Crediário** (decidido — ver seção "Crediário e Devedores" abaixo).
- Fica registrada a forma de pagamento escolhida em cada venda, para uso nos relatórios (ex.: total vendido por forma de pagamento).
- **(Fase 2, não implementar agora) Pagamento dividido em múltiplas formas na mesma venda** — ex.: conta de R$ 50, sendo R$ 30 no PIX e R$ 20 em Crediário. **Importante considerar já na modelagem do banco**: se a venda guardar só uma forma de pagamento por registro (campo único), migrar depois para múltiplas formas exige alterar o schema e os dados existentes; modelar a venda desde o início com uma **tabela de pagamentos por venda** (`venda_id`, `forma_pagamento`, `valor`), mesmo que a v1 sempre grave uma única linha ali, evita esse retrabalho.

## Crediário e Devedores

Forma de pagamento adicional que, em vez de encerrar financeiramente a venda, gera uma **dívida associada a um cliente** (não confundir com "Usuário" do sistema — cliente é quem compra, sem login no app).

### Fluxo na venda

- Ao escolher **Crediário** como forma de pagamento, abre busca de **cliente por nome** (mesmo padrão de busca em tempo real usado na busca de item — ver "Uso via teclado").
- Se o cliente não existir, botão **"Adicionar"** abre um modal de cadastro rápido, sem sair da venda em andamento:
  - **Nome** (obrigatório).
  - **Telefone** (opcional).
  - **Data de Lembrete** (opcional — ver "Uso da Data de Lembrete" abaixo).
  - **Observação** (texto livre, opcional).
- Ao concluir, a venda soma ao **saldo em aberto** do cliente; o recibo em PDF identifica a venda como Crediário e o cliente vinculado.
- **Sem exigência de senha do administrador** para registrar venda em Crediário (usuário comum pode registrar normalmente) — decidido, ao contrário de outras ações sensíveis da lista em "Perfis e autenticação".
- **Cliente com saldo a favor da loja** (decidido): se o cliente já tem crédito (saldo negativo — ex.: sobrou de um pagamento de uma venda depois cancelada), não aparece campo pra digitar "Valor pago agora" — em vez disso mostra o texto "Cliente possui saldo com a loja" e o crédito é aplicado automaticamente (até o limite do total da venda). Se o crédito cobrir a venda inteira, ela nasce quitada — única exceção à regra de que Crediário nunca fecha o valor total na hora (nesse caso não é alguém pagando o total na hora, é o próprio crédito do cliente se consumindo).

### Tela "Devedores"

- Lista todos os clientes com saldo em aberto (soma de todas as vendas em Crediário ainda não quitadas), ordenável por **Data de Lembrete** (mais próxima primeiro) além de nome/valor.
- Cadastro/edição de cliente com os mesmos campos do modal rápido (Nome, Telefone, Data de Lembrete, Observação).
- **Quitação de dívida — pagamento parcial e total** (decidido): cada cliente tem um histórico de pagamentos; é possível abater qualquer valor (até o saldo total) a qualquer momento, sem exigir senha do administrador (mesma decisão da venda em Crediário — usuário comum pode registrar).
- Exibe, por cliente, o saldo atual e o histórico de vendas em Crediário + pagamentos registrados.
- **Cada venda listada no histórico do cliente é linkada à venda real** (não é só um resumo): clicar nela abre um **modal com o detalhe da venda** (itens, valor, data, quem registrou) por cima da própria tela Devedores, sem sair do contexto do cliente — reaproveitando os mesmos dados/UI do "Histórico de vendas" (ver "Numeração do recibo" em Vendas). Esse modal já pode oferecer a ação de **cancelar/estornar** ali mesmo (ver "Cancelamento / Estorno de venda"), sem precisar ir buscar a venda manualmente em outra tela.

### Uso da Data de Lembrete

- Campo **por cliente** (um único lembrete, não por dívida individual — decidido; se o cliente acumular múltiplas vendas em Crediário, o lembrete continua sendo um só, associado ao cliente).
- Usado para:
  1. Ordenar a lista de "Devedores" (quem tem lembrete mais próximo aparece primeiro).
  2. Alimentar um card no Dashboard com clientes cujo lembrete está próximo/vencido.

### Configurações — trava de desativação

- Na tela de Configurações, o Crediário pode ser desativado como forma de pagamento **somente se não houver nenhum devedor com saldo em aberto** — evita desativar o recurso com dívidas pendentes de controle.

## Dashboard

**Tela exclusiva do Administrador** (não aparece no menu do Usuário comum — ver "Perfis e autenticação").

**Customizável, replicando a arquitetura do CashVault** (`src/components/dashboard-cards/`, `react-grid-layout`) — cards arrastáveis/redimensionáveis em vez de layout fixo:

- **Grid de 6 colunas** (`GRID_COLS = 6`), altura em unidades de linha (180px cada). Cada card tem uma **largura em colunas (1 a 6)** e uma **altura em linhas**, com um subconjunto de tamanhos permitidos por card (`allowedSizes`) — só faz sentido oferecer os tamanhos que cabem no conteúdo (ex.: um card de rosca/gráfico de pizza fica estreito e alto, nunca esticado na largura; um gráfico de linha/fluxo de vendas só faz sentido largo). Redimensionar sempre pula para o tamanho permitido mais próximo, nunca livre.
- **Catálogo de cards** (`catalog.ts`): cada card é um componente "burro" registrado num catálogo (`{ label, description, allowedSizes, component }`), recebendo só dados/callbacks via props — nunca busca os próprios dados. `description` explica o que o card mostra e alimenta o tooltip "?" do card e o texto na gaveta "+ Adicionar card" (campo confirmado batendo com a implementação real do CashVault — a versão anterior deste plano tinha esquecido dele). Isso é o que permite o usuário adicionar/remover cards pelo catálogo sem tocar em código.
- **Modo de edição**: um botão tipo "✎ Personalizar" / "✓ Concluir" liga/desliga drag-and-drop e resize; fora do modo de edição o grid é só leitura. Um "+ Adicionar card" abre um drawer listando os cards do catálogo que não estão visíveis no momento.
- **Persistência por perfil**: layout salvo por usuário (posição `x`/`y`, tamanho, visibilidade) — mesmo padrão da tabela `dashboard_layout` do CashVault, adaptado para Stockly (`stockly_dashboard_layout` ou nome equivalente). Autosave com debounce a cada mudança (arrastar, redimensionar, adicionar/remover card), sem passo explícito de "salvar".

**Toda métrica de venda/recebimento abaixo exclui vendas com `status = 'cancelled'`** (decidido — a seção "Cancelamento / Estorno de venda" foi escrita depois desta, e ficou faltando amarrar as duas): `sale_payments` de uma venda cancelada continua no banco (`cancel_sale` nunca apaga nada, só reverte estoque/saldo do cliente), então qualquer soma que não filtre por `status = 'completed'` conta dinheiro que já foi estornado. Vale tanto para "Vendas do dia/mês" quanto para "Valores recebidos do dia/mês" e "Formas de pagamento".

Cards candidatos para o catálogo inicial do Stockly (mockup `mockups-ui.html` + texto original + revisão feita depois que Crediário, Histórico de vendas/Cancelamento e a coluna "Desconto" já existiam):
- Itens em estoque (quantidade).
- **Valor em estoque** (decidido — ajustar se não for isso que você imaginou): `SUM(items.cost_price * items.quantity)`, valor de **custo**, não de venda — representa o capital parado em estoque, não uma receita potencial que ainda depende de vender tudo pelo preço cheio.
- Vendas do dia / mês (R$ e/ou contagem, só `status = 'completed'`).
- **Valores recebidos do dia / mês** (decidido — substitui "Ticket médio" no dashboard): difere de "Vendas do dia/mês" porque uma venda em **Crediário** conta como venda no momento do registro, mas o dinheiro só entra quando a dívida é quitada (ver "Crediário e Devedores"). Cálculo: pagamentos em Dinheiro/Cartão/PIX de vendas **não canceladas** registrados no período + quitações de Crediário (parciais/totais) recebidas no período — **não** inclui o valor de vendas em Crediário ainda em aberto.
- Itens com estoque baixo (contagem + lista, `quantity <= min_quantity`).
- Vendas por categoria / Categoria(s) mais vendida(s) (donut).
- Top itens vendidos no período (tabela, por quantidade).
- **Formas de pagamento** (donut) — **as 4 formas** (Dinheiro, Cartão, PIX, Crediário), só vendas `completed`. O mockup atual desenha só 3 fatias (sem Crediário) — desatualizado, corrigir na implementação.
- Gráfico de vendas ao longo do tempo / Vendas por período (Chart.js, últimos 7 dias no mockup).
- Últimas vendas (lista: hora, recibo, operador) — está no catálogo do mockup, não no layout inicial.
- Comparativo mensal (vendas deste mês vs. mês anterior, em %) — está no catálogo do mockup, não no layout inicial.
- **Devedores com lembrete próximo/vencido** (Crediário) — ver seção "Crediário e Devedores". Presente só no texto deste plano, **ausente do mockup** (a tela `dashboard` do mockup foi desenhada antes de Crediário/Devedores existir) — manter na implementação mesmo sem referência visual.
- **Total em Crediário em aberto** (novo, sugerido após Crediário/Devedores existir): mesmo agregado que já alimenta o card "Total em aberto" de Devedores (`client_balance` somado de todos os clientes) — reaproveitar a mesma query/comando, não recalcular do zero.
- **Total de descontos concedidos no período** (novo, só ficou possível depois que Histórico de vendas ganhou a coluna "Desconto"): soma de `discountValue` (item + geral, ver `docs/commands.md`'s `list_sales`) das vendas `completed` no período.
- **Vendas canceladas no período** (novo, sugerido após Cancelamento/Estorno existir): contagem e/ou valor total estornado — dá visibilidade de um número que hoje só existe espalhado no Histórico de vendas.
- (fase 2) Card de "Sugestões" em destaque, puxando da tela de Sugestões — ver "Ideias extras". Também está no catálogo do mockup.

## Relatórios

**Exclusivo do Administrador** (não aparece no menu do Usuário comum — ver "Perfis e autenticação").

- **Menu lateral expansível** (decidido): "Relatórios" no menu não navega direto — expande, mostrando os relatórios disponíveis como subitens, cada um sua própria sub-rota/tela com filtro próprio (período, categoria etc.), em vez de tudo empilhado numa página só. Facilita adicionar relatório novo no futuro sem redesenhar a tela inteira.
- Exportação dos relatórios (CSV e/ou PDF, reaproveitando a geração de PDF do recibo).

### Candidatos a relatório (revisão pós-Dashboard, Crediário, Histórico de vendas e `item_price_history` — cada um já mapeado pra fonte de dado real que existe hoje, não hipotética)

**Vendas**
- Vendas por período (dia/semana/mês/intervalo customizado) — já previsto na v1. **Implementado** (`VendasPorPeriodoPage`, `relatorios/vendas-periodo`) — toolbar de período (Últimos 7 dias/Este mês/Personalizado), 4 cards (total vendido, nº de vendas, ticket médio, dia de pico), gráfico de barras por dia, listagem bruta das vendas do período, Exportar CSV/PDF.
- Vendas por categoria / por item — já previsto na v1. **Implementado** (`VendasPorCategoriaItemPage`, `relatorios/vendas-categoria-item`) — alterna entre "Por categoria" (donut) e "Por item" (tabela ordenada por quantidade), Exportar CSV/PDF.
- Vendas por forma de pagamento — mesmo agregado do Dashboard (`formas_pagamento`), só que filtrável por período arbitrário e exportável, em vez de fixo no mês atual. **Implementado** (`VendasPorFormaPagamentoPage`, `relatorios/vendas-forma-pagamento`).
- **Vendas por operador** — quem vendeu o quê, quanto, quantas vendas no período (`sales.user_id`) — útil pra acompanhar desempenho/rotina de cada operador, não só o dono. **Implementado** (`VendasPorOperadorPage`, `relatorios/vendas-operador`).
- Comparativo de períodos — mês atual vs. anterior (já no Dashboard como `comparativo_mensal`), mas aqui generalizado pra qualquer par de períodos escolhido, não só o mês corrente. **Implementado** (`VendasComparativoPeriodosPage`, `relatorios/comparativo-periodos`) — adicionado ao menu depois dos outros quatro, fora do escopo original desta leva; dois seletores de mês/ano (só meses com venda) em vez de período livre, já que a comparação é sempre mês contra mês.
- **Ticket médio** por período — não estava em nenhuma versão anterior deste plano; métrica clássica de PDV (total vendido ÷ número de vendas no período), diferente de "Vendas por período" que só soma. Ainda não tem relatório dedicado próprio, mas já aparece como um dos 4 cards de "Vendas por período" acima.
- **Descontos concedidos** — quanto foi concedido, por quem foi autorizado, em quais vendas, no período. **Implementado** (`DescontosConcedidosPage`, `relatorios/descontos-concedidos`) — toolbar de período + operador, 3 cards (total concedido, vendas com desconto, desconto médio), tabela com recibo/tipo (Geral vs. Item, com % ou R$)/valor/autorizado por/data, Exportar CSV/PDF. Diferente do `discountValue` combinado de `list_sales`/Dashboard: usa um comando dedicado (`list_sale_discounts`) que separa desconto geral de desconto por item, pra dar a coluna "Tipo" do mockup.
- **Vendas canceladas/estornadas** — quantidade, valor total estornado, quem cancelou, quem autorizou, no período — visibilidade que hoje só existe espalhada no Histórico de vendas, útil pra Admin acompanhar se cancelamentos estão dentro do esperado.
- Margem/lucro (preço de venda − preço de custo) — já previsto na v1, mas com uma decisão em aberto agora que `item_price_history` existe: usar o **custo no momento da venda** (a linha de `item_price_history` mais recente com `created_at <= sales.created_at`) em vez do `items.cost_price` **atual** — senão, um item cujo custo mudou depois de vendido mostraria uma margem histórica errada. `sale_items.unit_price` já é o preço de venda no momento (snapshot); custo precisa do mesmo tratamento pra a conta fechar de verdade.

**Estoque**
- **Movimentação de estoque** — consulta direta do ledger `stock_movements` (filtrável por item/período/tipo: venda, entrada, ajuste, estorno, etc.) — é a "tela de consulta" que `docs/database.md` já registra como pendente desde que a tabela foi criada; os dados já existem desde o dia 1, só falta a tela. **Implementado** (`MovimentacaoEstoquePage`, `relatorios/movimentacao-estoque`).
- **Histórico de alteração de preço** — consulta direta do `item_price_history` (por item: linha do tempo de custo/venda, quem mudou, quando) — mesma lógica do relatório de movimentação de estoque, aplicada à tabela irmã que criamos mais recentemente. **Implementado** (`HistoricoPrecoPage`, `relatorios/historico-preco`) — "Todos os itens" numa tabela só, ou foca num item pra ver a linha do tempo, igual ao mockup.
- Estoque valorizado por categoria — mesmo cálculo do Dashboard (`valor_em_estoque`, a custo), quebrado por categoria em vez de um total único.
- **Itens sem movimento** ("parados") — itens sem nenhuma linha `sale` em `stock_movements` nos últimos N dias — sinaliza capital parado, candidato a promoção/desconto ou descontinuação. **Implementado** (`ItensParadosPage`, `relatorios/itens-parados`) — filtro 30+/60+ dias, itens nunca vendidos sempre aparecem.
- Previsão de ruptura de estoque — já registrado em `docs/future.md` ("Stock-rupture forecast"); citado aqui só pra lembrar que também é candidato a relatório, não só a badge extra no Estoque.

**Crediário / Devedores**
- **Inadimplência com "aging"** — saldo em aberto agrupado por faixa de atraso (ex.: 0–7 dias, 8–30, 30+, calculado a partir de `reminder_date` ou de quando a venda foi feita) — mais estruturado que o "Total em aberto" único que já existe em Devedores/Dashboard. **Implementado** (`InadimplenciaAgingPage`, `relatorios/inadimplencia-aging`) — decidido calcular os dias de atraso a partir da venda em Crediário mais antiga ainda em aberto do cliente (não do `reminder_date`, opcional e não necessariamente ligado à dívida em si); sem toolbar de período (é uma foto da situação agora, não um recorte de datas), donut por faixa + tabela por devedor, Exportar CSV/PDF.
- Pagamentos recebidos (Crediário) por período — consulta de `credit_payments`, quanto entrou, por quem foi registrado. **Implementado** (`PagamentosRecebidosPage`, `relatorios/pagamentos-recebidos`).
- Pagamentos cancelados — auditoria de `credit_payments` com `cancelled_at` preenchido: quem cancelou, quem autorizou, motivo (`cancel_reason`, campo que já existe e é obrigatório no cancelamento). **Implementado** (`PagamentosCanceladosPage`, `relatorios/pagamentos-cancelados`) — filtrado pela data do cancelamento, não do pagamento original.

**Auditoria**
- **Autorizações de Administrador** — visão unificada de toda ação que precisou de senha de Admin (desconto concedido, venda cancelada, pagamento de Crediário cancelado, cliente renomeado com saldo em aberto) — todas essas já gravam `*_authorized_by_user_id` em suas respectivas tabelas hoje; um relatório assim só precisa juntar o que já existe em 4 tabelas diferentes, não pede coluna nova. Complementa (sem substituir) a ideia de um log de auditoria genérico já registrada em "Ideias extras". **Implementado** (`AutorizacoesAdminPage`, `relatorios/autorizacoes-admin`) — com uma correção em relação ao texto acima: só 3 das 4 fontes têm dado persistido hoje (desconto/venda cancelada/pagamento cancelado); "cliente renomeado" verifica a senha do admin mas nunca grava quem autorizou nem quando (`update_client` descarta o resultado), então ficou de fora — ver `docs/future.md`.

**Status (atualizado após a implementação começar)**: menu lateral expansível implementado (`AppShell`, ver `docs/frontend.md`), com todos os 12 relatórios do catálogo prontos (5 de Vendas, 3 de Estoque, 3 de Crediário/Devedores, 1 de Auditoria — marcados "Implementado" acima). Ticket médio por período, Descontos concedidos, Vendas canceladas/estornadas, Margem/lucro, Estoque valorizado e Previsão de ruptura continuam fora do menu por enquanto — nenhum item além do já marcado "Implementado" está priorizado/comprometido.

## Configurações

- Tela de configurações com opção de **tema claro/escuro** (toggle simples), seguindo o mesmo design system de tokens (`bg-theme-*`/`text-theme-*`) do CashVault — preferência salva e lembrada entre reinícios (mesmo padrão do `config.last_active_user_id` do CashVault, mas para tema).
- **Bloqueio automático por inatividade** (ver seção em "Perfis e autenticação"): dropdown com opções de tempo (Nunca/1/5/10/15/30 min/1h), padrão 5 min para Administrador e Nunca para Usuário comum, ajustável por cada usuário.
- Demais opções da tela (a crescer conforme o app evoluir): gerenciar usuários (admin), **percentual de aviso do alerta de estoque baixo — exclusivo do Administrador** (ver "Alerta de estoque baixo" em Estoque), **backup do banco — exclusivo do Administrador** (ver "Backup do banco" abaixo), diagnósticos/logs, versão atual do app + botão "Verificar atualizações" (checagem manual, além da automática na abertura — ver seção "Autoupdate").

### Backup do banco (mesmo padrão do CashVault, adaptado)

- **Seção inteira exclusiva do Administrador** (decidido): não aparece de forma nenhuma na tela de Configurações do Usuário comum — nem escolher pasta, nem "último backup", nem restaurar. Não é só o botão de restaurar que fica bloqueado (como estava antes); o Usuário comum simplesmente não vê nada sobre backup.
- **Mesma arquitetura do CashVault** (`src-tauri/src/commands/backup.rs`): usuário escolhe uma pasta de backup em Configurações (caminho salvo na tabela `config`, chave `backup_folder`); `run_backup` gera `<pasta>/stockly-backup.db` — **nome fixo, sobrescrevendo o backup anterior a cada execução** (sem histórico de versões, igual ao CashVault). **Diferença em relação ao CashVault**: usa `VACUUM INTO` em vez de `std::fs::copy` (ver "Instância única e concorrência do SQLite") — o CashVault copia o arquivo bruto, mas isso pode gerar backup inconsistente com conexão ativa em modo WAL.
- **Diferença proposital em relação ao CashVault** — quando o backup roda: além de uma vez ao abrir o app (mesmo gatilho do CashVault, no mount da tela principal), roda também **a cada 10 minutos** enquanto o app permanece aberto (intervalo no frontend chamando o mesmo comando `run_backup`). Justificativa: aqui é registro de venda em fluxo contínuo — diferente do CashVault, o app tende a ficar aberto o turno inteiro, então esperar só a próxima abertura deixaria muito tempo de vendas sem backup.
- Falha ao rodar (pasta não encontrada, sem permissão) só mostra um toast de erro — nunca trava o app.
- **Restaurar backup** (`import_backup`): valida se o arquivo escolhido é realmente um `.db` do Stockly (checagem de tabela conhecida) antes de sobrescrever o banco ativo; app precisa reiniciar depois para reabrir o banco importado do zero — mesmo fluxo do CashVault.
- **Exige reconfirmação da própria senha do admin antes de aplicar** (decidido — ver "Ações sensíveis" em "Perfis e autenticação"): mesmo sendo tela exclusiva do Administrador, é destrutivo o suficiente (sobrescreve o banco inteiro) pra justificar essa proteção extra contra clique acidental.

## Ideias extras (sugestões para registrar, não compromissos)

- **Log de auditoria** de ações administrativas (quem cadastrou usuário, quem autorizou ação sensível, quando).
- **"Sugestões"** (nome provisório — fase 2, depende de acumular histórico de vendas): tela dedicada a reunir análises/previsões geradas a partir dos dados do app, não só a de estoque. A primeira ideia concreta:
  - **Previsão de ruptura de estoque**: em vez de só comparar quantidade atual com um mínimo fixo, calcular a média de vendas do item nos últimos meses e projetar se o estoque atual aguenta até o fim do período (ex.: início do mês com estoque baixo pode ser normal se o consumo é lento; estoque "ok" hoje pode não aguentar até o fim do mês se o item vende rápido). Pode aparecer também como status extra ("Tendência: acaba em ~5 dias") na lista de Estoque, além de entrar nessa tela.
    - **Fórmula conceitual** (calibrar o período exato na hora da implementação): `consumo_médio_diário = soma das saídas tipo=venda do item num período (ex.: últimos 90 dias) ÷ número de dias do período`; depois `dias_restantes = quantidade_atual ÷ consumo_médio_diário`. O badge "Tendência: acaba em ~N dias" usa esse `dias_restantes` diretamente.
  - Espaço reservado para outras sugestões/previsões que você for pensando (ex.: item parado há muito tempo, sugestão de reposição, combinações de produtos vendidos juntos etc.) — completar conforme forem surgindo ideias.
  - Alimentado pelo **"Histórico de movimentações de estoque"** — já decidido e gravado desde a v1 (ver seção em "Estoque"), mesmo sem essa tela existir ainda — é só questão de, quando chegar a hora, construir a tela que consulta esse histórico já acumulado.

## Próximos passos sugeridos

1. ~~Validar este plano com você (nomes de telas, quais ações exigem senha do admin, política de import CSV)~~ — **concluído**.
2. ~~Fazer o scaffold do projeto (`pnpm create tauri-app` ou copiar a base de configuração do CashVault) com nome **Stockly** e identifier `com.welbert.stockly`.~~ — **concluído**.
3. ~~Desenhar o schema inicial do SQLite (`init_db`/`migrate_db`), espelhando o padrão do CashVault.~~ — **concluído** (ver `docs/database.md`).
4. **Implementar em fatias verticais por feature** (decidido) — schema + comando Rust + tela, um recurso de cada vez, em vez de fechar todo o backend e só depois todo o frontend (ou vice-versa): os mockups HTML já definem a UI em detalhe e o `PLANO.md` já define as regras de negócio em detalhe, então separar as fases só adicionaria risco de integração no fim. Ordem sugerida, seguindo a dependência natural entre os recursos:
   1. ~~Base de auth + primeiro uso (usuários, login, bloqueio por inatividade) — tudo depende disso.~~ — **concluído** (ver `docs/commands.md`).
   2. ~~Estoque (cadastro de item, categorias) — Venda precisa de item cadastrado pra existir.~~ — **concluído**, exceto Importar/Exportar CSV (fica no item 8, "funcionalidades de apoio") — ver `docs/commands.md`.
   3. ~~Venda (PDV) + recibo PDF — o coração do app.~~ — **concluído** (ver `docs/commands.md`, `docs/frontend.md`): registro de venda por código/nome com sugestões, desconto por item e geral com autorização de administrador, PDF do recibo (`genpdf`, fonte Courier Prime embutida), reimpressão/regeneração sob demanda, botão "Imprimir" (verbo do shell do Windows) e "Abrir pasta de recibos". **Ficou de fora, escopo adiado pro item 5 abaixo**: Histórico de vendas com busca, Cancelamento/Estorno de venda (ambos dependem um do outro — ver seção "Cancelamento / Estorno de venda") e Crediário como forma de pagamento (depende do item 4 abaixo, Devedores/clientes ainda não existe).
   4. ~~Crediário e Devedores — depende de Venda já funcionando (forma de pagamento).~~ — **concluído** (ver `docs/commands.md`, `docs/frontend.md`): Crediário como forma de pagamento na Venda (busca/cadastro rápido de cliente inline, sem sair da venda em andamento), tela Devedores (saldo em aberto, histórico de vendas fiado + pagamentos, ordenável por lembrete/nome/saldo, badge de lembrete vencido/próximo), quitação parcial ou total sem senha de administrador, "Ver venda" reaproveitando o detalhe real da venda, e a trava de Configurações que só deixa desativar Crediário sem devedor em aberto.
   5. ~~Histórico de vendas (listagem + busca) e Cancelamento/Estorno — fecha o fluxo completo de venda começado no item 3.~~ — **concluído** (ver `docs/commands.md`, `docs/frontend.md`): tela "Histórico de vendas" (busca por recibo/cliente/operador + intervalo de data, ambos os perfis), reaproveitando o `SaleDetailModal` já usado em Devedores. Cancelamento/estorno com autorização de admin (mesmo padrão do desconto/cancelamento de pagamento), devolve os itens ao estoque (`stock_movements` tipo `refund`), nunca apaga o histórico — só marca `status='cancelled'` — e, se a venda era Crediário, reverte o saldo do cliente automaticamente (e cancela também o pagamento "Valor pago agora" vinculado, se houver, pra não deixar a dívida cancelada ainda descontando do saldo).
   6. ~~Dashboard — depende de ter dado de venda acumulado pra mostrar algo.~~ — **concluído** (ver `docs/commands.md`, `docs/frontend.md`): grid de 6 colunas customizável (arrastar/redimensionar, `react-grid-layout`), catálogo de 18 cards com tamanhos permitidos e descrição (tooltip "?"), modo de edição com "+ Adicionar card" e "✕ Cancelar" (desfaz tudo que foi autosalvo na sessão de edição), layout persistido por Administrador (cada um o seu), 8 cards visíveis por padrão na primeira vez que a tela é aberta (o resto do catálogo fica disponível pela gaveta). Cards incluem tanto os já previstos (vendas do dia/mês, valores recebidos, estoque baixo, vendas por categoria/período/forma de pagamento, top itens) quanto os que só fizeram sentido depois que Crediário/Histórico de vendas/Cancelamento e a coluna "Desconto" já existiam (Total em Crediário em aberto, Descontos concedidos, Vendas canceladas). O card de "Sugestões" (fase 2) ficou de fora, já que a tela de Sugestões ainda não existe.
   7. ~~Relatórios — depende do Dashboard já ter estabelecido as agregações principais.~~ — **concluído**
   8. Backup, autoupdate, CSV — funcionalidades de apoio, não bloqueiam nada acima.
5. ~~Criar a documentação técnica em `docs/` (architecture, database, commands, frontend) conforme o projeto avança.~~ — **concluído**: `architecture.md`, `frontend.md`, `database.md` e `commands.md` já existem (mais `future.md`, pra ideias fora do escopo atual); seguem sendo atualizados a cada fatia nova.
6. Decidir se o repositório do Stockly será **público** (necessário para o autoupdate single-repo funcionar) ou se vai precisar do esquema de repositório de releases separado — ver seção "Autoupdate".
