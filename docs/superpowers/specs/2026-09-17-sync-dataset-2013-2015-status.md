# Status: sync do dataset histórico 2013-2015 (2026-09-17)

## O que foi feito

- Fonte: `cs13a0-management` (branch `feat/expansao-jogadores`, reconciliada com `feature/liquipedia-historical-import`), pesquisa real via API pública da Liquipedia (CC-BY-SA 3.0).
- Os 7 Majors de 2013-2015 (DreamHack Winter 2013, EMS Katowice 2014, ESL Cologne 2014/2015, DreamHack Winter 2014, ESL Katowice 2015, DreamHack Cluj-Napoca 2015) entraram via `teams.expansion.game.json`/`players.expansion.game.json`/`coaches.expansion.game.json` (camada `x1`, nunca o core v1 congelado). **Escopo final: 25 times** (não 84 — ver "correções feitas no meio do caminho" abaixo), todos com roster de 5 + coach confirmados.
- `catalog-manifest.json` atualizado (311 times, 1555 jogadores, 311 coaches, anos 2013-2026).
- `maps.ts`: adicionado `ACTIVE_DUTY_POOLS_BY_YEAR[2013|2014|2015]` — sem isso, times desses anos tinham familiaridade zero em todo mapa e o veto quebrava. Fonte: `data/research/map-pools-2013-2015.json` no `cs13a0-management`, derivada de anúncios da Valve. **2013 tem confiança baixa** (nenhuma fonte primária da Valve enumera o pool daquele Major — só uma fonte secundária sem citação); ver notas no arquivo de pesquisa antes de tratar como definitivo.
- `map-veto.ts`: `getVetoAvailableMaps`/`buildVetoPlan` agora aceitam pools de mapa menores que 7 (mínimo real 3), encolhendo bans (nunca picks) — necessário porque o pool de 2013 tem só 5 mapas. Comportamento em pools ≥7 (todo o resto do jogo) idêntico.
- Validado: `npm run check` (1 erro pré-existente, não relacionado — feature de credits em andamento por outra sessão) e `npx vitest run` (621/622 passando; a 1 falha restante é a mesma feature de credits).

### Correções feitas no meio do caminho (achadas por revisão e pelos próprios testes)
O primeiro commit desta sincronização (36fe954) tinha 3 problemas reais, todos corrigidos no commit seguinte (9ec36a3):
1. **Escopo errado**: 14 dos "84 times novos" não eram de 2013-2015 (ex: `avangar-2018`, `faze-2026`) — sobras do dataset de pesquisa mais amplo. Removidos.
2. **Sem coach**: nenhum dos 70 times de 2013-2015 restantes tinha treinador, e o jogo exige um pra todo time (`tests/catalogIntegrity.test.ts`). Pesquisei nos cards já coletados da Liquipedia: só **25 times têm coach confirmado** — a maioria dos times dessa era genuinamente não tinha coach dedicado ainda (prática rara pré-2016). Os outros **45 ficam de fora até haver pesquisa de coach pra eles** — não inventado. Lista completa dos 45 no commit 9ec36a3.
3. **Veto de mapa quebrando**: um agente de revisão (`/code-review`) achou que o pool de 5 mapas de 2013 quebrava o veto (mínimo fixo de 7). Corrigido na engine (ver acima) em vez de inflar o pool de mapas com dado não confirmado.

## O que NÃO entrou (pendência consciente)

A mesma rodada de pesquisa também corrigiu bugs reais em times/jogadores que **já existiam** no core congelado (2016-2026):
- Vitality 2025 sem o badge `double-major-year` (ganhou os 2 Majors do ano).
- Falcons 2026 sem nenhum título contado (campeão do IEM Cologne 2026 não estava em `YEAR_RESULTS[2026].titles`).
- Legacy 2025/2026 e Latto (3x MVP em CS Asia Championships 2025/2026 + FISSURE Playground 3) subvalorizados.
- Boosts de HLTV Top 20 2020 e 2025 pra jogadores que já tinham card no core (ex: ZywOo, ropz, donk).
- Correção de papel (role) de markeloff/kennyS/GuardiaN/latto pra AWPer/rifler real.

Essas correções **não podem entrar pela camada de expansão**: `buildCatalog`/`firstById` dá prioridade ao core em qualquer colisão de id, e o core está congelado por hash em `tests/catalogGuards.test.ts` até um deploy coordenado (mesma regra que protege o online). Descongelar o core pra aplicar essas correções é uma decisão separada, deliberada — não deve ser feita de passagem numa sincronização de rotina.

## Onde ficam os dados completos, se/quando decidirem descongelar o core

`cs13a0-management/data/workspace/{teams,players}.game.json` (branch `feat/expansao-jogadores`) tem o dataset completo com as correções já aplicadas — é só reprocessar a partir de lá.
