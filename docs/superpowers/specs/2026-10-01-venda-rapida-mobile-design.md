# Venda rápida mobile — design

## Objetivo

Permitir que o jogador venda várias cartas da coleção pelo celular sem precisar abrir e confirmar cada ficha individualmente. O fluxo deve atender jogadores e coaches, preservar a venda individual existente e impedir que uma ação em lote desmonte uma escalação.

## Experiência

- A seção **Minhas cartas** ganha o botão `VENDA RÁPIDA` no celular e no desktop.
- Ao ativá-lo, a grade entra em modo de seleção múltipla. Tocar em uma carta seleciona ou remove uma unidade da venda.
- Jogadores e coaches participam do mesmo modo e usam a mesma seleção visual.
- Uma barra fixa, acima da navegação e da área segura do aparelho, mostra `N CARTAS`, o total de coins e o botão `VENDER`.
- O usuário pode cancelar o modo sem alterar a coleção.
- A confirmação final lista quantidade e valor total. Uma única confirmação executa o lote.
- A venda individual pela ficha continua disponível.

## Proteções

- A única cópia de uma carta usada em qualquer escalação salva não pode ser selecionada.
- Quando houver cópias excedentes de uma carta escalada, apenas a quantidade excedente pode entrar no lote.
- Uma carta bloqueada continua visível e informa `NO TIME` ao toque, em vez de falhar silenciosamente.
- Enquanto a requisição estiver em andamento, seleção, cancelamento e confirmação ficam bloqueados.
- Se o servidor rejeitar o lote, nenhuma seleção é presumida como vendida; a coleção é atualizada e o erro é exibido.

## Componentes e estado

`CollectionWorkspace` controla o modo de venda, as quantidades escolhidas por `cardId`, o total calculado e a barra fixa. `CollectionCard` e `CoachCard` recebem estado selecionado/bloqueado e um callback de seleção, sem duplicar regras econômicas.

O valor de cada unidade continua vindo de `sellValue` ou `coachSellValue`. A elegibilidade deriva das quantidades possuídas menos as cópias necessárias pelas escalações salvas.

## Servidor e consistência

Será adicionado um endpoint de venda em lote com uma lista de `{ cardId, quantity }`. O servidor valida propriedade, quantidade disponível e uso em escalações dentro de uma transação; depois remove as cópias, credita a soma e grava o ledger. A operação é atômica: vende tudo ou nada.

O endpoint individual permanece compatível. O frontend atualiza carteira e coleção apenas após a resposta confirmada do servidor.

## Responsividade e acessibilidade

- Alvos de toque têm pelo menos 44 px.
- Seleção não depende apenas de cor: usa marca visível e `aria-pressed`.
- A barra respeita `env(safe-area-inset-bottom)` e não cobre a navegação móvel.
- O foco retorna ao acionador ao cancelar ou concluir.
- Textos existem nos três idiomas já suportados.

## Verificação

- Testes do serviço: lote misto, múltiplas cópias, carta escalada, quantidade inválida, rollback e ledger.
- Testes do frontend: seleção, total, cancelamento, bloqueio de escaladas e erro do servidor.
- Verificação visual e funcional em 390×844 e desktop.
- `svelte-check`, testes direcionados, build do frontend e build do backend antes do deploy.

## Fora de escopo

- Venda automática por raridade.
- Selecionar toda a coleção com um toque.
- Remover cartas automaticamente das escalações.
- Alterar preços ou regras econômicas.
