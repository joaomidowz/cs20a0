# Motor de rounds competitivo, torneio incremental e decisões ao vivo

## Problema

O motor antigo travava o power em 99 e a probabilidade de round em 18–82%, sem pistol, economia, lado ou momentum: cada round era independente. Times com três jogadores 95+ perdiam MD1 com frequência e o Stage 3 parecia loteria. O modo online pré-calculava o torneio inteiro e só "revelava" os rounds; o veto era automático e opaco, e mapas que só um dos lados conhecia (Cobblestone de um bot de 2016–2018) podiam sobrar como decider.

## Motor de rounds (`src/lib/game/rounds.ts`)

Um `MapState` puro e determinístico substitui o laço fechado de `simulateMap` (que continua existindo como wrapper com políticas de bot):

- **Probabilidade de round** = base (sigmoide `diff/16` em `[0.06, 0.94]`) + vantagem de compra (`full` vs `eco` +0.28, `full` vs `force` +0.12, `force` vs `eco` +0.16) + viés de lado (`MAP_SIDE_BIAS` em `maps.ts` mais estilo: agressivo prefere TR, tático prefere CT) + momentum (+0.01 por round seguido, atenuado pelo `mental` do adversário) + pausa tática (+0.05 para quem pausou, zera o momentum do outro) + mental/clutch na prorrogação, tudo em `[0.03, 0.97]`.
- **Pistol** (rounds 1 e 13) ignora 70% do gap de power e usa firepower/entry do roster: ~50/50. O vencedor do pistol tem ~70% no round 2 (anti-eco) e o round 3 volta a ~50% (força ou full de quem perdeu). Isso emerge da economia (`LOSS_BONUS`, recompensa por kill, vencedor mantém as armas dos sobreviventes).
- **Power** sobe até 106 com `getStarCarry` (cada ponto de overall acima de 92 conta, limitado a +6). `consistency` do lineup reduz a variação de dia e de mapa.
- **Decisões**: `sidePickerTeamId` gera uma decisão de lado pendente; o perdedor do pistol recebe um `eco-call` (`force`/`eco`); `requestTimeout` uma vez por metade. Bots decidem via `bot-policies.ts`; humanos via `applyDecision` ou `autoDecide` ao vencer o prazo.
- **Detalhe do round** (`RoundDetail`): economia, lados, kills, final do round, momentum, pausa e `tags` (`pistol`, `anti-eco`, `eco-win`, `force-win`, `clutch`, `streak-break`, `comeback-alert`, `match-point`, `half-end`). `MapResult` ganha `details`, `halves`, `comeback`, `pickedBy` e `sidePickerId`.

Calibração (2000 seeds): 104 vs 89 → MD1 100%, 95 vs 88 → MD1 85%, 92 vs 90 → MD3 66%; pistol 50%, round 2 71% para o vencedor do pistol, round 3 50%; mistura de compras 6% eco / 25% force / 70% full; ~14% de viradas e ~15% de prorrogações.

## Série ao vivo e torneio incremental (`src/lib/game/online/`)

- `live-series.ts`: máquina de estados `veto → intermission → side-pick → live → … → finished`. Todo RNG é posicional (`seed:matchday`, `seed:knife:i`, `seed:map:i:mapId`), então mesmo seed + mesmo log de decisões ⇒ mesmo resultado. Decisões de bots nunca ficam pendentes (`settleBots`).
- `tournament-engine.ts`: `startNextRound`/`completeRound` pareiam o Swiss e o bracket rodada a rodada. `runOnlineTournament` virou o wrapper em lote (todos como bots), usado pelo solo e pelo Sandbox automático. Stage 3 é MD3 por padrão.
- `map-veto.ts`: `getVetoAvailableMaps` só inclui mapas que apenas um lado conhece quando faltam para chegar a sete; `buildVetoPlan` e `chooseMap` são reutilizados pelo veto interativo.

## Servidor (`server/room-manager.ts`, protocolo 6)

Cada série da rodada tem seu próprio relógio (`LiveSeriesRuntime`). Uma decisão humana pausa só aquela série e tem prazo (`veto` 20 s, lado 12 s, eco 8 s); ao vencer, o servidor decide com a política de bot. O veto interativo existe apenas entre dois humanos; contra bots o veto é automático, mas lado, pausa e eco continuam nas mãos do humano. A rodada só entra no histórico público quando todas as séries acabam; o feed de kills vai apenas para a série do próprio participante (janela dos três últimos rounds, acumulada no cliente). Comandos novos: `veto-action`, `pick-side`, `call-timeout`, `eco-call`.

## Cliente

`SeriesViewer` ganhou `RoundStrip` (pistol, metades, pausas, clutch), `RoundFeed` (economia, kill feed, tags, top fraggers) e a manchete do mapa (`VIRADA`, `ATROPELO`, prorrogação). Os prompts `VetoBoard`, `SidePickPrompt`, `EcoCallPrompt` e `TimeoutButton` em `src/lib/components/live/` são compartilhados entre `/online` e `/sandbox`.
