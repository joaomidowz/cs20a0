# Menos underdog na festa: variância achatada nas séries com jogador (2026-09-21)

## O pedido

Com 2+ jogadores humanos na sala online, um time forte do jogador ("80+") não convertia favoritismo: semifinal/final viravam moeda. O dono escolheu **"menos sorte nos jogos com humanos"** (e recusou explicitamente a opção "campo de bots mais fraco"): swing de mapa, ruído por round e pistola-moeda são achatados nas séries COM time de jogador; bot-vs-bot segue com o dado cheio; o SOLO não é tocado.

## Implementação

- `PARTY_VARIANCE_SCALE = 0.5` (`balance.ts`) — multiplicador de variância por série: swing de mapa (`createMapState`), ruído por round (`roundProbabilityA`) e o achatamento de pistol (fator 0,3 → 0,45) escalam com ele.
- `PARTY_ZEBRA_LIFT = 0.5` — o vento da zebra cai pela metade na festa (`botFieldPower` ganhou `zebraScale`).
- Fiação: `createTournamentEngine({ varianceFor })` → `LiveSeriesConfig.varianceScale` → `MapState.varianceScale`. `RoomManager.beginTournament` passa `varianceFor` só quando `organizations.length > 1` e só para séries com humano. Escala ausente = 1 = o jogo de sempre (offline, Dinastia, sandbox e o laboratório não mudam nada — `normalRunGolden` intocado).
- **Direção da pistola (armadilha encontrada)**: multiplicar o fator de achatamento (0,3) pela escala <1 tornava a pistola MAIS moeda, não menos. O correto é o fator SUBIR quando a escala desce: `0.3 + 0.3 * (1 - varianceScale)`.
- Humano × humano segue sem handicap de nível: a variância é simétrica, e a escala não toca em nível de ninguém.

## Medições (torneios completos de 16 times, campo de pedigree + alívio de festa de sempre)

| Cenário (200 runs) | base | var 0,5 |
|---|---|---|
| Melhor line montável (99): campeão | 68% | **73%** |
| Melhor line montável (99): final+ | 83% | **85%** |
| Time do dono (~90): semi+ | 26% | **30%** |
| Time do dono (~90): suíço | 21% | 24% |

Por série (400 MD3, isolamento): melhor line × bot campeão 68% → **74%** com escala 0,5 — é exatamente o "skill aparece mais": o favorito converte o que o nível promete.

- Elites (~87, azarão de verdade contra o campo): top8 17→15% — a redução de variância é neutra para quem já é underdog de nível; o efeito é simétrico e honesto.
- O alívio de festa continua na METADE do solo (`PARTY_RELIEF_RATIO = 0.5`, decisão do dono, intocada). Medimos também alívio cheio na festa (campeão iria a 83%), mas isso é a opção "campo mais fraco" que o dono recusou — fica registrado como a alavanca maior, caso um dia ele queira.
- `PARTY_ZEBRA_LIFT` mediu dentro do ruído (±4pp) no torneio; fica pela coerência de narrativa (zebra embala menos quando há festa).

Faixa nova: `tests/balanceTargets.test.ts` → "a festa": melhor line chega à final da festa ≥ 72% (medido 82%). Contratos determinísticos em `tests/onlinePartyVariance.test.ts` (escala ausente ≡ escala 1 seed a seed; swing reduzido à metade exata; `varianceFor` marca só as séries com humano).

## Item 4 relacionado: bot-vs-bot instantâneo

No mesmo pacote: séries bot-vs-bot SEM espectador resolvem na hora no launch (`settleUnwatchedBotSeries`); assistidas continuam round a round. O round fecha quando as séries humanas acabam — a BO3 simulada mais lenta não trava mais a sala.
