# Status: sync do dataset histórico 2013-2015 (2026-09-17)

## O que foi feito

- Fonte: `cs13a0-management` (branch `feat/expansao-jogadores`, reconciliada com `feature/liquipedia-historical-import`), pesquisa real via API pública da Liquipedia (CC-BY-SA 3.0).
- Os 7 Majors de 2013-2015 (DreamHack Winter 2013, EMS Katowice 2014, ESL Cologne 2014/2015, DreamHack Winter 2014, ESL Katowice 2015, DreamHack Cluj-Napoca 2015) entraram via `teams.expansion.game.json`/`players.expansion.game.json` (camada `x1`, nunca o core v1 congelado): 84 times novos, 420 jogadores.
- `catalog-manifest.json` atualizado (370 times, 1850 jogadores, anos 2013-2026).
- `maps.ts`: adicionado `ACTIVE_DUTY_POOLS_BY_YEAR[2013|2014|2015]` — sem isso, times desses anos tinham familiaridade zero em todo mapa e o veto quebrava (`tests/sandboxMajor.test.ts` pegou isso). Fonte: `data/research/map-pools-2013-2015.json` no `cs13a0-management`, derivada de anúncios da Valve. **2013 tem confiança baixa** (nenhuma fonte primária da Valve enumera o pool daquele Major — só uma fonte secundária sem citação); ver notas no arquivo de pesquisa antes de tratar como definitivo.
- Validado: `npm run check` (1 erro pré-existente, não relacionado — feature de credits em andamento) e `npx vitest run` (620/622 passando; as 2 falhas restantes são da mesma feature de credits).

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
