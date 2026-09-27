# Rating 3.0 e Round Swing no online

## Objetivo

Mostrar no online a mesma avaliação de desempenho que a Dinastia já usa: Rating 3.0 aproximado, Round Swing, KAST, ADR, assistências, trocas e multi-kills, calculada no servidor e apresentada nas estatísticas, no MVP e no histórico do jogador. Primeira entrega é só leitura: a nota explica, não muda partida, coins nem pontos.

## O que existia

- `src/lib/game/rating.ts`, `runStats.ts` e `majorAwards.ts` já implementam o modelo `v3` (Rating 3.0 aproximado) e o `hltv1` (legado), com Round Swing por jogadores vivos e ajuste de lado/mapa.
- O servidor online forçava `hltv1` nos dois pontos: prêmios do campo (`completeRun`) e stats do participante (`getSelfResult`). O motivo registrado era o protocolo 9: o cliente só recebe o kill feed da própria série, então não pode recalcular o campo.
- A tela `RunStatsGrid` já mostra Rating 3.0, swing, KAST, utilitário, aberturas e trocas quando os campos existem.

## Comportamento aprovado (dono, 2026-09-27)

- O servidor calcula tudo com `v3`, uma vez, ao fim da run: prêmios do campo inteiro em `completeRun` e stats do participante em `getSelfResult`. O cliente recebe o resultado pronto e nunca recalcula.
- A baseline do Rating 3.0 é a do campo inteiro: `getSelfResult` passa `tournament.awards` (já calculados) para `createRunStats`, que usa `ratingBaseline` de lá em vez das séries do próprio jogador.
- MVP, top 10 e o histórico (`majors.avg_rating`) passam a usar a nota nova. A média de rating antiga e a nova coexistem na coluna; a escala é a mesma (1,00 = média do campo).
- Nada muda em chance de vitória, coins, pontos de temporada ou awards de coins: só a nota exibida e o MVP.

## Comparação entre modos

- Fila (competitivo) alimenta o histórico ranqueado, como hoje (`ranked`).
- Solo contra bots, sala com amigos e Boost mostram a mesma nota no resumo pessoal, mas não entram no histórico ranqueado (regra existente de `recordMajor`).
- A tela mostra rounds jogados; runs curtas têm a nota com o aviso já existente do `RunStatsGrid` (`rating3Help`).

## Fora de escopo

- Explicações por jogada ("abriu vantagem", "decidiu o clutch"): o servidor não guarda economia por round; fica para quando o contexto de armas/economia for persistido.
- Efeito em ranking, coins ou prêmios.
- Ajuste do peso do swing em amostras curtas.

## Testes

- `tests/onlineServer.test.ts`: stats do participante trazem swing e KAST; prêmios com `ratingModel: 'v3'` e baseline positiva.
- `tests/majorAwards.test.ts` e `tests/rating3.test.ts`: o servidor pede `v3` nos dois pontos.
- Tempo: o cálculo é único no fim da run; a lição de desempenho da Dinastia (recalcular a cada passo) não se aplica.
