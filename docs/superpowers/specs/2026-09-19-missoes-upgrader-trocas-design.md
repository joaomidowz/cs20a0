# Missões, Upgrader, Promoções e Trocas — design

Data: 2026-09-19. Plano aprovado: `~/.claude/plans/hoje-quero-lan-ar-algumas-lazy-puffin.md`.
Esta spec é a referência das quatro entregas. Cada entrega é um commit separado (`feat: …`), sem push e sem deploy.

## Objetivo

Dar motivo para voltar todo dia (missões) e formas de gastar coins (upgrader, promoções, trocas). Tudo é decidido no
servidor. O "offline" é o **solo contra bots no servidor**: uma sala `origin: 'queue'` com um humano só, que nunca é
competitiva e ainda passa por `onRunCompleted` → `recordMajor`, então o resultado é validado no servidor.

## Princípios comuns

- Toda mudança de saldo passa por `applyLedger` (`server/collection/service.ts`), que é o único escritor de `wallets`.
- Cada motivo novo de ledger entra no CHECK `ledger_reason_check` **e** no tipo `LedgerReason`, na mesma entrega.
- Migrations são append-only em `server/db/migrations.ts`: nunca editar uma entrada existente.
- Regras puras (números, períodos, chances) ficam em `src/lib/game/online/*-rules.ts`, compartilhadas com o cliente.
- O online só lê `players.game.json`/`teams.game.json` (fora do pool da coleção). Nenhum arquivo novo tem "catalog" no
  nome (`tests/catalogGuards.test.ts`).
- O protocolo WS continua na versão 9. Dados novos do run vão só no hook `RunCompletedEvent`.

## Entrega 1 — Missões

### Regras (`src/lib/game/online/missions-rules.ts`)

Tabela `MISSIONS` (id, escopo, métrica, alvo, coins, pacotes grátis). Valores ajustáveis no código.

| Escopo | Conta em | Período (`period_key`) | Missões |
|---|---|---|---|
| `daily` | run competitivo | `d:YYYY-MM-DD` (UTC-3) | jogar 1, jogar 3, 1 MVP |
| `weekly` | run competitivo | `w:YYYY-WW` (semana ISO, UTC-3) | jogar 10, ganhar 1 Major, 3 MVPs |
| `season` | run competitivo | `s:<seasonId>` | jogar 40, ganhar 5 Majors, 10 MVPs |
| `solo` | run não competitivo | `s:<seasonId>` (paga 1× por season) | Major dos Campeões, sequência de 2 e de 3, 13 a 0 |

- MVP = award `major_mvp` detectado no run. Vitória = `champion`.
- Solo, direto pela entrada (sem depender de award ranqueado):
  - Major dos Campeões: `field === 'champions'` e `champion`.
  - Sequência: `solo_streaks.current` após o run (campeão soma 1, qualquer outra colocação zera); o progresso é o maior valor visto.
  - 13 a 0: `champion` e `seriesLost === 0`.
- As maiores (semanal de MVP, todas da season) dão também pacotes básicos grátis, somados em `pack_grants.granted` do dia do claim.

### Major dos Campeões

- `src/lib/game/online/major-champions.ts`: `MAJOR_CHAMPIONS` (evento, ano, teamId) de todos os Majors de CS:GO/CS2.
  Os que não têm time no `teams.game.json` (2013–2015) ficam com `teamId: null` e saem do sorteio; um teste lista quais.
- Sala: `createRoom(..., { field: 'champions' })`. Em `beginTournament`, os times campeões vão na frente do sorteio dos
  bots (ainda embaralhados pela seed); se faltarem campeões para completar o campo, completa com o sorteio normal.
- Entrada: `POST /solo { field: 'random' | 'champions' }` cria a sala solo (1 humano, time salvo da coleção) e devolve
  `roomCode` + `lineupTicket`, como o match da fila. A UI online ganha o cartão "Solo contra bots" com os dois botões.

### Servidor

- Migration 16: `mission_progress(user_id, mission_id, period_key, progress, claimed_at)` PK nos três primeiros;
  `solo_streaks(user_id PK, current, best)`; `mission_reward` no CHECK do ledger.
- `server/collection/missions.ts`:
  - `advanceMissions(tx, { entry, event, seasonId, now, mvp })`, chamado dentro da transação de `recordMajor`, depois
    da checagem de run duplicado — então é idempotente por (sala, seed, usuário).
  - `listMissions(db, userId, now)` e `claimMission(db, userId, missionId, now)` (credita via `applyLedger`
    `mission_reward`, ref `mission:<id>:<period>`; `FOR UPDATE` + `claimed_at` impedem claim duplo).
- `RunCompletedEvent` ganha `field`; cada entrada ganha `seriesLost` e `lineupIds`.
- Rotas (`server/http/mission-routes.ts`): `GET /missions`, `POST /missions/:id/claim`, `POST /solo`.

### Front

`MissionsPanel.svelte` em `/online/colecao`: abas Diárias, Semanais, Season e Solo, barra de progresso e botão de resgate.

## Entrega 2 — Upgrader

- Regra pura em `collection-rules.ts`: `upgradeChance(stake, target) = min(0.75, stake / target × 0.9)`, valores por `coinValue`.
- `POST /upgrader { stake: string[1..6], target: string }`: o alvo vale mais que o total apostado; cartas escaladas não entram.
- RNG `createSeededRng(seed)` com seed gerada no servidor e gravada em `upgrades(id, user_id, stake, target, chance, seed, won, returned, created_at)`.
- Vitória: apostadas saem, alvo entra. Derrota: apostadas saem e 1 aleatória do grupo volta. Uma transação só.
- Front `Upgrader.svelte`: roda com arco de chance e ponteiro; 2–3 variações de animação são propostas antes de codar.

## Entrega 3 — Promoções diárias

- Uma por raridade por dia (Elite, Superstar, Legend), seed `promo:<dia>:<raridade>`, pacote de 4 cartas com 25% de coach.
- Preços 45k / 70k / 120k. Carta de topo pela raridade da promoção; GOAT ~0,5%; Legend baixo nas menores.
- Tier novo em `PACK_SLOTS`/`COACH_CHANCE`; `rollPackWithCoaches` ganha parâmetro de tamanho. Vitrine com countdown até a virada (UTC-3).

## Entrega 4 — Trocas diretas

- Proposta para outro usuário buscado por `users.team_name`: minha carta (+ coins opcionais) pela carta dele.
- Tabela `trades` com status `pending/accepted/declined/cancelled/expired`, expira em 48h.
- Aceite numa transação: confere posse das duas cartas, troca, move coins com `applyLedger` motivo novo `trade`.
- Carta escalada no lineup não pode ser oferecida nem aceita.
- Rotas `POST /trades`, `GET /trades`, `POST /trades/:id/accept|decline|cancel`. Front: aba "Trocas" na coleção.

## Verificação

- Puros: períodos e tabela das missões, lista de campeões contra o dataset, chance do upgrader, odds da promoção.
- Banco (`describe.skipIf(!TEST_DATABASE_URL)`, Postgres local 5435): progresso por run e run duplicado, claim duplo,
  streak solo, upgrader nos dois desfechos, troca aceita/escalada/expirada.
- Gate: `npm run validate`.

## Riscos

- Lista de campeões curada à mão; 2013–2015 ficam fora enquanto o dataset do online não tiver esses times.
- Upgrader e promoções são mecânicas de aposta com coins, e há compra de coins com dinheiro: revisar antes da Fase P.
- A sala solo usa `origin: 'queue'`; `liveQueueRooms` a ignora por ser de um humano só.
