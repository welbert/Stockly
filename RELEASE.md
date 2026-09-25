# Stockly — Não lançado

# Stockly — v0.0.4

## Novidades

- **Novidade:** A tela de Devedores agora é a tela de Clientes — lista todos os clientes cadastrados, não só quem está devendo, e um filtro mostra só quem tem saldo em aberto quando precisar.
- **Novidade:** Agora dá pra identificar o cliente em qualquer forma de pagamento (Dinheiro, Cartão, PIX), não só no Crediário — é opcional, direto na tela de finalizar venda.
- **Novidade:** O detalhe do cliente mostra o histórico completo de compras (qualquer forma de pagamento), não só as vendas no Crediário.
- **Novidade:** Cadastro de cliente ganhou data de nascimento e CPF/CNPJ (com validação), além dos campos que já existiam.
- **Novidade:** Em Configurações, novo grupo "Acessibilidade" com opção de aumentar ou diminuir o tamanho da fonte do app — preferência salva no seu perfil.
- **Novidade:** Em Configurações, dá pra escolher com quantos dígitos o código automático de um item novo é gerado (ex.: "0001") — só afeta o código gerado automaticamente quando o campo é deixado em branco, nunca um código digitado à mão.
- **Novidade:** Tela de Configurações reorganizada em grupos recolhíveis (Perfil e aparência, Loja e recibo, Estoque e precificação, Backup e restauração, Sistema e diagnóstico), com um campo de busca no topo que acha qualquer configuração pelo nome sem precisar saber em qual grupo ela está.
- **Novidade:** Administrador agora consegue redefinir a senha de qualquer usuário (incluindo outros administradores e a própria conta) direto na tela Usuários, sem precisar saber a senha atual — útil quando alguém esquece a senha.
- **Novidade:** O relatório "Autorizações de Administrador" agora também mostra as redefinições de senha, junto com descontos, cancelamentos de venda e de pagamento.
- **Novidade:** Em Configurações → Loja e recibo, dá pra escolher qual impressora o botão "Imprimir" usa — antes ele sempre mandava para a impressora padrão do Windows.

# Stockly — v0.0.3

## Novidades

- **Novidade:** Em Configurações → Recibo, agora dá pra escolher em qual pasta os recibos em PDF são salvos, em vez de usar sempre a pasta padrão do app.
- **Novidade:** A tela "Venda concluída" ficou mais rápida de usar pelo teclado — em vez de três botões (Imprimir, Abrir pasta de recibos, Nova venda), agora é só uma pergunta: "Imprimir recibo?", com Não (Esc) ou Sim (Enter).

## Correções

- **Correção:** Item com estoque zerado, mas sem quantidade mínima configurada, não aparecia mais como "Sem estoque" (nem no Estoque, nem no card "Itens com estoque baixo" do Dashboard) — agora estoque zerado sempre alerta, mesmo sem mínima definida.

# Stockly — v0.0.2

## Novidades

- **Novidade:** O aviso de atualização disponível agora tem um botão "Notas de atualização", que abre a página de releases no navegador — assim dá pra ver tudo que mudou desde a sua versão atual, mesmo pulando mais de uma versão de uma vez.

# Stockly — v0.0.1

## Novidades

- **Novidade:** Login por seletor de perfil — Administrador ou Usuário, cada um com um menu adequado ao que faz no dia a dia.
- **Novidade:** Cadastro de itens no Estoque, com código único, categorias e alerta de estoque baixo.
- **Novidade:** Importação e exportação do estoque em CSV, com tela de conferência antes de aplicar qualquer mudança.
- **Novidade:** Tela de Venda otimizada para uso 100% via teclado — busca de item, desconto, cancelamento e finalização sem precisar do mouse.
- **Novidade:** Recibo em PDF gerado a cada venda, com numeração sequencial e opção de reimprimir a qualquer momento.
- **Novidade:** Histórico de vendas com busca por recibo, cliente ou operador, incluindo cancelamento/estorno (devolve o item ao estoque automaticamente).
- **Novidade:** Crediário — venda fiado vinculada a um cliente, com controle de saldo em aberto, lembrete de cobrança e histórico de pagamentos na tela Devedores.
- **Novidade:** Dashboard personalizável, com cards de vendas, estoque baixo, valores recebidos e devedores — arraste e redimensione do seu jeito.
- **Novidade:** Catálogo de Relatórios (vendas, estoque, crediário e auditoria), todos exportáveis em CSV ou PDF.
- **Novidade:** Backup automático do banco de dados, ao abrir o app e a cada 10 minutos, sem precisar fazer nada manualmente.
- **Novidade:** Atualização automática — o app verifica e instala novas versões sozinho.
- **Novidade:** Nome da loja personalizável, aparece na barra lateral e no cabeçalho do recibo.
- **Novidade:** Tema claro/escuro, à sua escolha.
