# Coleção por pacotes no online: conta, pacotes, time com star player, ligas mensais e awards

Status: spec aprovada em conversa (2026-09-17), **sem implementação**. Roadmap de fases em `/home/itcenterai/.claude/plans/especifica-o-definitiva-do-scalable-wilkinson.md`.

## Problema

O online é sala por código, sem conta nem persistência: nada sobrevive ao restart do Railway. Não há motivo pra voltar. Este modo dá progressão persistente: o usuário coleciona versões reais de jogadores (dataset core, 1430 versões, 2016–2026), monta um time, joga majors com ele e disputa temporadas mensais.

## Decisões

- Só moeda do jogo (**coins**). Sem dinheiro real. Fotos/logos continuam sob fair use nominativo (`docs/permissions/granted/`).
- Postgres do Railway; magic link por e-mail (Resend). **E-mail é único**: um e-mail = uma conta; o link só vai pro e-mail cadastrado; grant diário só depois de verificar.
- Duplicata vira coins. `collection` é único por `(user_id, player_id)`.
- 2 pacotes básicos por dia (UTC-3), idempotente por `(user_id, day)`.
- Pacote = 3 versões de **anos distintos**, pesos por raridade por tier, seed `${userId}:${day}:${n}` via `createSeededRng` (já importado em `server/room-manager.ts`).
- API nova é **HTTP** em `server/app.ts`; não mexe no protocolo WS (`PROTOCOL_VERSION = 9`).
- Guard `tests/catalogGuards.test.ts`: `server/`, `src/lib/game/online`, `src/routes/online` só importam `players.game.json`/`teams.game.json`. Nenhum dado de pacote/award vai pra `src/lib/data/cs`; fica em tabela ou em `server/collection/*.ts`. Fórmula de valor de `dynasty/value.ts` é **copiada**, não importada.
- Ranked só com lobby ≥ 4; 1x1 joga, mas não conta no ranking (ver pontos).

## Time: funções, repetição e star player

Funções existentes: `igl`, `awper`, `entry`, `lurker`, `support`, `rifler` (`getEligibleSlotRoles`, `roleRules.ts`). Regras deste modo:

- **Repetir função é permitido** (dois riflers, dois awpers). Não há penalidade automática por "fora de posição" como na Dinastia (`OFF_ROLE_PENALTY` não se aplica). O que muda é **sinergia**, que pode subir ou descer:
  - 1 IGL: +1,5% mental. 0 IGL: −2% mental. 2 IGLs: 0 (não soma).
  - 1 AWPer: normal. 2 AWPers: +1% poder em pistol/eco se ambos ≥ 80 de `awp`, senão −1%. 0 AWPer: −2% poder.
  - 1 entry: +1% abertura. 2 entries: +0,5% abertura, −1% consistência.
  - ≥1 support: +1% utilitário/economia. 0 support: −1,5% economia.
  - Lurker: +1% clutch quando presente.
  - Cada jogador **fora da própria função** (ex.: awper no slot rifler): −1% poder. Tem que "fazer sentido".
- **Star player**: designação (não é slot). Um jogador do lineup; o jogo é montado em volta dele:
  - Star recebe +6% no atributo principal da função dele (`awp` pra awper, `firepower` pra rifler/entry, `igl` pra IGL, `clutch` pra lurker, `support` pra support).
  - Os outros quatro recebem +1,5% em `support` (jogam pra ele).
  - AWPer star: prioridade de AWP e economia (+1 compra de AWP garantida por meio-lado quando o caixa permite; já existe `eco-call`).
  - Support star: a equipe ganha +2% utilitário e o support +3% mental.
  - Star só vale se o jogador for ≥ 2º maior OVR do lineup **ou** ≥ 85; senão a designação é ignorada (não se faz o jogo em volta de um common de 70).
  - Trocar star custa 0, mas trava por major (definido ao entrar na sala).
- Implementação: função pura `applyCollectionLineup(team: CombatTeam, lineup, star)` em `server/collection/lineup.ts` (espelhada no cliente pra pré-visualizar), aplicada como `postTeamAdjust` do `campaign-major.ts` (o hook já existe).

## Estratégia por série (já existe no motor)

Estilo (`OrgStyle`), tática por série (`CoachTactic`: padrão/pressão/controle/anti-strat, `seriesPlan.ts`), veto real (`map-veto.ts`, pools por ano), side pick, eco-call, timeout. O modo só expõe isso na UI da sala; sem motor novo.

## Schema (Postgres)

```sql
users        (id uuid pk, email citext unique, display_name, created_at, last_seen_at)
magic_links  (token_hash pk, user_id fk, expires_at, used_at)
sessions     (token_hash pk, user_id fk, expires_at, created_at)

wallets      (user_id pk fk, coins int, updated_at)
ledger       (id, user_id, delta int, reason enum[pack_open,duplicate,sell,buy_pack,match_reward,season_prize,award], ref_id, created_at)
collection   (user_id, player_id, acquired_at, source enum[pack,reward], pk(user_id,player_id))
pack_grants  (user_id, day date, granted int, opened int, pk(user_id,day))
pack_opens   (id, user_id, tier, seed, player_ids text[], coins_from_dupes int, opened_at)

lineups      (user_id pk fk, player_ids text[5], roles text[5], star_player_id, style, updated_at)

seasons      (id, month date, starts_at, ends_at, status enum[active,closed])
season_rules (season_id pk, points_json jsonb)   -- pesos por lobby, mutável sem migração
majors       (id, season_id, user_id, room_code, seed, lobby_size int, ranked bool, placement, champion bool, points int, awards jsonb, played_at)
matches      (id, season_id, user_id, opponent_kind enum[bot,user], opponent_id, seed, result jsonb, coins int, played_at)
season_standings (season_id, user_id, majors_won int, points int, avg_rating numeric, pk(season_id,user_id))

awards       (id, user_id, kind, ref_id, season_id, detail jsonb, earned_at)
award_rules  (kind pk, coins int, points int, once_per_season bool)
```

`ledger` é append-only; `wallets.coins` é cache do saldo. `majors.ranked = lobby_size >= 4`.

## Pontos de temporada (por título)

| lobby | ranking | pontos |
|---|---|---|
| 1 (só bots) | não | 0 |
| 2–3 | sim | 1 |
| 4–7 | sim | 3 |
| 8 | sim | 5 |

Desempate: `majors_won`, depois `avg_rating`. Um major ranked por dia por usuário conta pontos (os demais dão só coins) — evita vencer por horas jogadas. Temporada fecha no fim do mês: `season_top1/3/10` em `awards`, prêmio em coins/pacote via `award_rules`.

## Pacotes e economia

- Tiers: básico (grátis, 2/dia), prata, ouro, era (3 do mesmo ano, escolhido). Pesos por raridade por tier em `server/collection/packs.ts` (dataset: common 652, rare 311, elite 217, superstar 98, legend 85, goat 67).
- Coins por duplicata e por venda: tabela fixa por raridade × faixa de OVR (cópia da curva de `dynasty/value.ts`). Venda = 60% do valor.
- Reveal reaproveita `Roulette.svelte`.

## Awards (detecção pura ao fechar o major, `detectAwards(majorRun, lineup, star)`)

Placar: `flawless_map` (13–0), `perfect_series`, `undefeated_major`, `overtime_king` (3+ OT ganhos).
Virada: `comeback_map` (de 3–11 ou pior), `comeback_series` (0–1 em MD3 / 0–2 em MD5), `eco_miracle`.
Estratégia: `antistrat_win` (anti-strat contra time mais forte), `map_pick_master` (todos os picks próprios ganhos), `veto_denied` (venceu no decider), `timeout_turn`.
Underdog: `giant_killer` (+8 de poder), `budget_champion` (OVR médio ≤ 78), `common_hero` (MVP common/rare).
Rank: `major_title`, `major_mvp`, `top10_player` (jogador seu no top 10 de rating do major), `season_top1/3/10`, `streak_3`.
Star: `star_delivered` (star foi MVP), `carried` (star ≥ 1.30 de rating no título).
Coleção: `first_pack`, `collection_50/100/250`, `goat_pull`, `full_era` (5 do mesmo ano no lineup).

Cada award: `kind, ref_id, season_id, detail jsonb` (placar, adversário, mapa). Perfil mostra contagem por tipo. `award_rules` decide coins/pontos e se é 1x por temporada. Só majors `ranked` geram `major_title`/`major_mvp`/`top10_player`.

## Segurança e anti-abuso

- Magic link: token aleatório 32 bytes, guardado como hash, expira em 15 min, uso único. Sessão 30 dias, hash no banco, token no header `Authorization` (Vercel e Railway em domínios diferentes; cookie cross-site fica pra depois).
- Rate limit por e-mail e por IP em `/auth/request` (padrão de `server/app.ts:94`). Grant diário só com e-mail verificado (primeiro login).
- Um e-mail por conta; sem alias `+` (normalizar). Bloqueio de domínios descartáveis (lista curta em `server/auth/disposable.ts`).
- Toda operação de coins é transação com `ledger`; nunca `UPDATE wallets` isolado.

## Fases

0. Conta + Postgres + magic link (`/auth/request`, `/auth/verify`, `/me`, `/auth/logout`), tela `/online/conta`. Sala anônima segue igual.
1. Pacotes, coleção, coins, lineup com star (`/collection`, `/packs/open`, `/collection/sell`, `/packs/buy`, `/lineup`), tela `/online/colecao`.
2. Major com o time da coleção na sala existente (entrar com lineup em vez de draftar; bots completam 8), `majors`, pontos, `season_standings`, awards, perfil.
3. Temporada mensal (fechamento, prêmios), matches avulsos, PvP fora de sala.

## Verificação

`npm run check`, `npx vitest run` (guard do catálogo incluso), `npm run server:build`. Local: Postgres em Docker, `.env` com `DATABASE_URL`/`RESEND_API_KEY` (ou `AUTH_DEV_LINK=1` mostrando o link na tela); fluxo: pedir link → verificar → `/me` → 2 pacotes → 3º recusado → vender → comprar → montar lineup com star → major ranked em sala de 4 → award e ponto gravados. Railway: `railway add` Postgres, variáveis, `railway up`, `/health` 200.
## Referências (jogos parecidos)

EA FC Ultimate Team (pacotes, química, Squad Battles, objetivos), NBA 2K MyTeam / Madden MUT / MLB Diamond Dynasty (mesmo modelo; Diamond Dynasty é o mais alcançável sem pagar), Sorare (edição por temporada = nossas versões por ano), Top Eleven/OSM (temporadas curtas), HLTV Fantasy (montar time por major), roadtomajor.com.br ("Ultimate Squad" e "Draft" — concorrente direto).

## Fases futuras (escolhidas pelo usuário; schema nasce preparado)

- **Química** por time-ano (5 iguais), era e país — só cálculo em `applyCollectionLineup`, sem tabela. País vem de `identities.game.json`, que o online NÃO pode importar (guard): copiar mapa `baseId → país` pra `server/collection/countries.ts` gerado por script, ou tabela `player_meta`.
- **Squad Battles assíncrono** — `squad_battles(id, user_id, opponent_user_id, opponent_lineup_snapshot jsonb, seed, result, points, played_at)`; adversário = lineup salvo de outro usuário controlado por bot; pontos reduzidos.
- **Objetivos diários/semanais** — `objectives(id, kind, period, target, reward_coins, reward_pack)`, `user_objectives(user_id, objective_id, progress, done_at)`; progresso alimentado pela mesma `detectAwards`.
- **Eventos temáticos** — `pack_catalog(id, tier, filter_json, price, active_from, active_to)`; semana do Major real (calendário em `circuit-events.game.json`, mas copiar datas pro servidor por causa do guard).
- **Perfil público** `/u/<slug>` — `users.slug unique`, vitrine, awards, temporada; recap mensal em imagem (`html-to-image`, já dep).
- **Passe de temporada** grátis — `season_pass_tiers(season_id, level, xp, reward)`, `user_pass(user_id, season_id, xp)`; XP por major/objetivo.
- **Streak de login** — `users.login_streak`, `last_login_day`; dia 7 = pacote prata.
- **Marcos de coleção** — award `full_team_year` (5 do mesmo time-ano) → moldura cosmética; `collection.variant` (ex.: `flawless`) só visual.
- **Pacote escolhido** — filtro no `pack_catalog.filter_json` (função, ano ≥, país); mais caro.
- **Reciclagem** — `POST /collection/recycle`: 3 commons → 1 rare garantido (seed + ledger).
- **Leilão 1/dia** — `auctions(id, seller_id, player_id, min_bid, ends_at, winner_id)`, `bids`; 1 slot por usuário por dia; coins em escrow no `ledger`.
- **Org do usuário** — `orgs(user_id pk, name, color, crest_seed)`; escudo por `crest.ts` (já existe, puro).
- **Hall da fama** — `season_standings` top 3 fixado + página.
- **Modo Era** — `majors.era_year`; ranking por ano em `season_standings(era_year nullable)`.
- **Coach da coleção** — coaches reais em pacote (dataset `coaches.game.json` **não** está na lista do guard: precisa liberar no `catalogGuards` ou copiar subset pro servidor); `collection_coaches`, `lineups.coach_id`; bônus como `applyCoachToTeam`.

Ordem sugerida depois da Fase 3: química → objetivos + streak → Squad Battles → passe → eventos/pacote escolhido → reciclagem/leilão → org/perfil/hall/recap → modo Era → coach.

Anti-inflação: coins entram só por grant/prêmio/objetivo/passe; saem por pacote/leilão/reciclagem.
