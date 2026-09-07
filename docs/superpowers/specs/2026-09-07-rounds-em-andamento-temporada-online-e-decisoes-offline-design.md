# Rounds em andamento, temporada online, decisões no modo solo e prêmios do Major

## Problemas

- **Round "do passado"**: ao revelar um round, o placar já mostrava 1–0, a faixa já pintava o tick e a legenda dizia o vencedor enquanto as kills ainda pingavam. O espectador via o resultado antes do round acontecer.
- **Kill feed pouco crível**: o time perdedor quase não matava e rounds terminavam com dois ou três abates; aces, 4K, 3K e clutches não eram destacados.
- **Modo solo sem decisões**: o Major offline era pré-calculado em lote; veto, lado, call de economia e pausa tática só existiam no online e no Sandbox.
- **Online sem continuidade**: a sala morria no fim do torneio; nome e organização eram digitados de novo a cada visita; só era possível assistir à própria série.
- **Estatísticas**: o resultado final abria uma grade enorme de estatísticas sintéticas; não havia MVP do Major nem ranking de times por rating.

## Motor de rounds (`src/lib/game/rounds.ts`)

- Kills do perdedor seguem uma tabela por diferença de compra (`LOSER_KILL_WEIGHTS`): compras iguais rendem 2–4 abates na maioria dos rounds; full buy contra eco raramente perde mais de um jogador, mas ainda perde o round em ~10–15% das vezes. Vencedor faz 5 em eliminações e 3–5 quando bomba/relógio decidem. Eliminação passa a ser o final mais comum.
- `RoundDetail.highlight` (`ace`, `quad`, `triple`, `clutch` com `against`) e as tags `3k`, `4k`, `ace` são produzidas durante a simulação; `flipRoundDetail` espelha o lado do destaque.
- `roundPresentation.ts` ganha `getHighlightLabel` e `getRoundFlash` (ace, 4K, 3K, clutch 1vN, eco/forçado vencendo, reação, série quebrada).

## Apresentação (`SeriesViewer`, `SandboxSeriesViewer`, `RoundFeed`, `RoundStrip`, `live/RoundFlash.svelte`)

O último round visível fica **em andamento** até o kill feed terminar: placar anterior (R1 = 0–0), sem tick na faixa, legenda "R1 · em andamento". Ao terminar o feed o round é **confirmado**: placar pulsa, tick aparece, legenda mostra o vencedor e `RoundFlash` pisca o destaque do round em uma faixa de altura fixa. Sem kill feed, em velocidade ultra ou ao fechar o mapa a confirmação é imediata. A regra vive em `seriesPresentation.ts` para os dois visualizadores.

## Modo solo com decisões (`src/lib/game/offlineMajor.ts`)

O Major offline passa a rodar no motor incremental (`createTournamentEngine` + `live-series`), com o mesmo campo, seeds e contexto de mapas de `buildMajorRun` (uma run sem decisões manuais é idêntica ao lote). Regras por fila (`getOfflineDecisionRules`):

| Fila | Veto | Lado | Call de economia | Pausa tática |
| --- | --- | --- | --- | --- |
| Normal (`premier`) | automático | automático | automático | manual |
| Ranked (`faceit`) | manual | manual | manual | manual |
| PRO | manual | manual | manual | manual |

`LiveSeriesConfig.humanDecisions` delega tipos de decisão à política de bot sem tirar a pausa do humano. A persistência guarda um **log de replay** (decisões e passos por série); ao recarregar, o motor é reconstruído deterministicamente. Links compartilhados continuam usando o lote (podem divergir do que o jogador decidiu).

## Temporada online (`server/room-manager.ts`, protocolo 7)

- `RoomConfig.seasonRuns` (1–4). Ao fim de cada run o servidor registra colocação e pontos (`seasonPointsFor`: campeão 10, vice 7, 3º–4º 5, 5º–8º 3, Stage 3 = vitórias 0–2) e abre uma janela de **10 s de rematch** (`rematch-vote`). Com dois ou mais aceites a sala volta direto ao draft com nova seed e os mesmos participantes; quem não aceita sai. Após a última run da temporada o `championName` é declarado e o próximo rematch abre a temporada seguinte.
- `watch-match` passa a valer mesmo com série própria ao vivo: a série assistida vira `primarySeries`; `self.pendingDecision` continua avisando a decisão pendente na própria partida.
- `tournament.awards` (`computeMajorAwards`) é enviado quando a sala completa.
- Cliente: nome e organização em `localStorage`; `SeasonPanel`, `RematchPanel`, `LiveSeriesSwitcher`; a visão geral do Major permite clicar em qualquer série ao vivo.

## Prêmios do Major (`src/lib/game/majorAwards.ts`)

Rating HLTV 1.0 por jogador a partir do kill feed real de todas as séries (kills, mortes, multi-kills por round). `MajorAwards`: MVP (rating com bônus por colocação), top 8, melhor time por rating médio, rei do clutch e destaque (aces/4K). As estatísticas da run do usuário (`runStats.ts`) passam a derivar do kill feed quando ele existe. Nas telas de resultado as estatísticas ficam **fechadas** (`CollapsibleStats`) e o `MajorAwardsPanel` aparece aberto.

## Polimento final de classificação e movimento

- A classificação usa quatro colunas estáveis — organização, campanha, BH e colocação — com baseline única e `white-space: nowrap`. Em até 420 px, rank e brasão cedem espaço ao nome truncado para que os três valores competitivos permaneçam visíveis na mesma linha.
- Entradas e reordenações da classificação usam apenas `transform` e `opacity`: entrada/reordenação de 160 ms com `cubicOut` e saída de 90 ms. A troca de rota recebe o mesmo deslocamento vertical discreto de 6 px.
- `prefers-reduced-motion: reduce` remove deslocamento, reordenação e duração das transições.
