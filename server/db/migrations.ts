import type { Db } from './client';

/**
 * Schema versions inlined as SQL: the Railway image only carries the bundled `index.cjs`, so nothing on disk.
 * Append only; never edit an applied entry.
 */
export const MIGRATIONS: ReadonlyArray<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));
CREATE TABLE IF NOT EXISTS magic_links (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE TABLE IF NOT EXISTS wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  coins int NOT NULL DEFAULT 0 CHECK (coins >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  delta int NOT NULL,
  reason text NOT NULL CHECK (reason IN ('pack_open','duplicate','sell','buy_pack','match_reward','season_prize','award','purchase','refund','chargeback')),
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger (user_id, created_at);
CREATE TABLE IF NOT EXISTS collection (
  user_id uuid NOT NULL REFERENCES users(id),
  player_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('pack','reward')),
  PRIMARY KEY (user_id, player_id)
);
CREATE TABLE IF NOT EXISTS pack_grants (
  user_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  granted int NOT NULL DEFAULT 2,
  opened int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS pack_opens (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  tier text NOT NULL,
  seed text NOT NULL UNIQUE,
  player_ids text[] NOT NULL,
  coins_from_dupes int NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lineups (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  player_ids text[] NOT NULL CHECK (cardinality(player_ids) = 5),
  roles text[] NOT NULL CHECK (cardinality(roles) = 5),
  star_player_id text,
  style text NOT NULL DEFAULT 'balanced',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seasons (
  id serial PRIMARY KEY,
  month date NOT NULL UNIQUE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS season_rules (
  season_id int PRIMARY KEY REFERENCES seasons(id),
  points_json jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS majors (
  id bigserial PRIMARY KEY,
  season_id int NOT NULL REFERENCES seasons(id),
  user_id uuid NOT NULL REFERENCES users(id),
  room_code text NOT NULL,
  seed text NOT NULL,
  lobby_size int NOT NULL,
  ranked boolean NOT NULL,
  counted boolean NOT NULL,
  placement text NOT NULL,
  champion boolean NOT NULL,
  points int NOT NULL,
  avg_rating numeric,
  awards jsonb NOT NULL DEFAULT '[]'::jsonb,
  played_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_code, seed, user_id)
);
CREATE INDEX IF NOT EXISTS majors_user_day_idx ON majors (user_id, played_at);
CREATE TABLE IF NOT EXISTS season_standings (
  season_id int NOT NULL REFERENCES seasons(id),
  user_id uuid NOT NULL REFERENCES users(id),
  majors_won int NOT NULL DEFAULT 0,
  majors_played int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0,
  avg_rating numeric,
  PRIMARY KEY (season_id, user_id)
);
CREATE TABLE IF NOT EXISTS awards (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  ref_id text,
  season_id int REFERENCES seasons(id),
  detail jsonb,
  earned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS awards_user_kind_idx ON awards (user_id, kind);
CREATE TABLE IF NOT EXISTS award_rules (
  kind text PRIMARY KEY,
  coins int NOT NULL,
  points int NOT NULL DEFAULT 0,
  once_per_season boolean NOT NULL DEFAULT false
);
`
  },
  {
    id: 2,
    sql: `
INSERT INTO award_rules (kind, coins, points, once_per_season) VALUES
  ('major_title', 200, 0, false), ('major_mvp', 150, 0, false), ('top10_player', 50, 0, false),
  ('flawless_map', 80, 0, false), ('perfect_series', 60, 0, false), ('undefeated_major', 250, 1, false), ('overtime_king', 80, 0, false),
  ('comeback_map', 70, 0, false), ('comeback_series', 120, 0, false),
  ('giant_killer', 100, 0, false), ('budget_champion', 300, 1, false), ('common_hero', 150, 0, false),
  ('star_delivered', 80, 0, false), ('carried', 100, 0, false), ('streak_3', 300, 2, true),
  ('first_pack', 100, 0, true), ('collection_50', 200, 0, true), ('collection_100', 400, 0, true), ('collection_250', 1000, 0, true),
  ('goat_pull', 50, 0, false), ('full_era', 150, 0, true),
  ('season_top1', 2000, 0, true), ('season_top3', 1000, 0, true), ('season_top10', 400, 0, true)
ON CONFLICT (kind) DO NOTHING;
`
  },
  {
    id: 3,
    sql: `
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  coins int NOT NULL,
  price_cents int NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS purchases (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  product_id text NOT NULL REFERENCES products(id),
  provider text NOT NULL,
  external_id text NOT NULL,
  preference_id text,
  status text NOT NULL,
  amount_cents int,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  credited_at timestamptz,
  refunded_at timestamptz,
  UNIQUE (provider, external_id)
);
`
  }
  ,
  {
    id: 4,
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS team_name text;`
  },
  {
    id: 5,
    sql: `
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_reason_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_reason_check CHECK (reason IN ('pack_open','duplicate','sell','buy_pack','match_reward','season_prize','award','purchase','refund','chargeback','welcome'));
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS coach_id text;
INSERT INTO wallets (user_id) SELECT id FROM users WHERE verified_at IS NOT NULL ON CONFLICT DO NOTHING;
WITH paid AS (
  INSERT INTO ledger (user_id, delta, reason, ref_id)
  SELECT u.id, 10000, 'welcome', 'welcome' FROM users u
  WHERE u.verified_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.user_id = u.id AND l.reason = 'welcome')
  RETURNING user_id
)
UPDATE wallets SET coins = coins + 10000, updated_at = now() WHERE user_id IN (SELECT user_id FROM paid);
`
  },
  {
    id: 6,
    // Coin packs sold through Mercado Pago. Bigger packs never give fewer coins per real than smaller ones.
    sql: `
INSERT INTO products (id, coins, price_cents, currency, active) VALUES
  ('coins_3k', 3000, 100, 'BRL', true),
  ('coins_16k', 16000, 500, 'BRL', true),
  ('coins_35k', 35000, 1000, 'BRL', true),
  ('coins_95k', 95000, 2500, 'BRL', true)
ON CONFLICT (id) DO UPDATE SET coins = EXCLUDED.coins, price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency, active = EXCLUDED.active;
`
  },
  {
    id: 7,
    // Cheaper coin table; old ids retired (kept for purchase history).
    sql: `
UPDATE products SET active = false WHERE id IN ('coins_3k', 'coins_16k', 'coins_35k', 'coins_95k');
INSERT INTO products (id, coins, price_cents, currency, active) VALUES
  ('coins_2k', 2000, 100, 'BRL', true),
  ('coins_10k5', 10500, 500, 'BRL', true),
  ('coins_22k', 22000, 1000, 'BRL', true),
  ('coins_60k', 60000, 2500, 'BRL', true)
ON CONFLICT (id) DO UPDATE SET coins = EXCLUDED.coins, price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency, active = EXCLUDED.active;
`
  },
  {
    id: 8,
    // A purchase freezes what it pays (coins) and remembers its checkout, so it can be reopened and re-checked.
    sql: `
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS coins int;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS checked_at timestamptz;
UPDATE purchases p SET coins = pr.coins FROM products pr WHERE pr.id = p.product_id AND p.coins IS NULL;
ALTER TABLE purchases ALTER COLUMN coins SET NOT NULL;
CREATE INDEX IF NOT EXISTS purchases_pending_idx ON purchases (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS purchases_user_idx ON purchases (user_id, created_at DESC);
`
  },
  {
    id: 9,
    // Support requests and rating reports. Stored first, e-mailed after: a mail outage never loses a ticket.
    sql: `
CREATE TABLE IF NOT EXISTS support_tickets (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('contact', 'rating')),
  user_id uuid REFERENCES users(id),
  email text NOT NULL,
  payload jsonb NOT NULL,
  mailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_unmailed_idx ON support_tickets (created_at) WHERE mailed_at IS NULL;
`
  },
  {
    id: 10,
    // Season points for every placement, bigger match rewards: each run keeps its own breakdown for the end screen,
    // match awards pay 30% more and score season points (collection milestones and season prizes unchanged).
    sql: `
ALTER TABLE majors ADD COLUMN IF NOT EXISTS base_points int NOT NULL DEFAULT 0;
ALTER TABLE majors ADD COLUMN IF NOT EXISTS reward_coins int NOT NULL DEFAULT 0;
ALTER TABLE majors ADD COLUMN IF NOT EXISTS award_coins int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS majors_user_room_idx ON majors (user_id, room_code, played_at DESC);
UPDATE award_rules SET coins = (round(coins * 1.3 / 5) * 5)::int
WHERE kind IN ('major_title', 'major_mvp', 'top10_player', 'flawless_map', 'perfect_series', 'undefeated_major', 'overtime_king', 'comeback_map', 'comeback_series', 'giant_killer', 'budget_champion', 'common_hero', 'star_delivered', 'carried', 'streak_3');
-- Match awards also score season points (only in runs that count); the title itself is already paid by placement.
UPDATE award_rules SET points = v.points FROM (VALUES
  ('major_mvp', 2), ('top10_player', 1), ('flawless_map', 1), ('perfect_series', 1), ('undefeated_major', 2), ('overtime_king', 1),
  ('comeback_map', 1), ('comeback_series', 1), ('giant_killer', 1), ('budget_champion', 2), ('common_hero', 1), ('star_delivered', 1),
  ('carried', 1), ('streak_3', 3)
) AS v(kind, points) WHERE award_rules.kind = v.kind;
`
  },
  {
    id: 11,
    // The three maps a collection team plays (null: the server picks the default for the five cards).
    sql: `ALTER TABLE lineups ADD COLUMN IF NOT EXISTS map_preferences text[];`
  },
  {
    id: 12,
    // Active seasons rescored with the current rules, so runs played under the old table (title only, one a day) are
    // worth the same as runs played now: every placement scores, by lobby size, first three runs of each day count,
    // and match awards add their points. Runs with two or more humans count as ranked. Coins already paid stay as paid.
    sql: `
WITH scoped AS (
  SELECT m.id, m.user_id, m.season_id, m.placement, m.lobby_size, m.awards,
    (m.ranked OR m.lobby_size >= 2) AS is_ranked,
    row_number() OVER (PARTITION BY m.user_id, (m.played_at AT TIME ZONE 'UTC' - interval '3 hours')::date ORDER BY m.played_at, m.id) AS run_of_day
  FROM majors m JOIN seasons s ON s.id = m.season_id WHERE s.status = 'active' AND m.lobby_size >= 2
), scored AS (
  SELECT sc.id, sc.is_ranked, (sc.is_ranked AND sc.run_of_day <= 3) AS is_counted,
    CASE sc.placement WHEN 'placementChampion' THEN 10 WHEN 'placementRunnerUp' THEN 7 WHEN 'placement3to4' THEN 5 WHEN 'placement5to8' THEN 3 ELSE 1 END AS full_points,
    sc.lobby_size,
    coalesce((SELECT sum(r.points) FROM jsonb_array_elements(sc.awards) a
      JOIN award_rules r ON r.kind = CASE WHEN jsonb_typeof(a) = 'string' THEN a #>> '{}' ELSE a ->> 'kind' END), 0)::int AS award_points
  FROM scoped sc
), final AS (
  SELECT id, is_ranked, is_counted,
    CASE WHEN NOT is_counted THEN 0
      WHEN lobby_size >= 4 THEN full_points
      WHEN lobby_size = 3 THEN ceil(full_points / 2.0)::int
      ELSE round(full_points / 3.0)::int END AS base_points,
    CASE WHEN is_counted THEN award_points ELSE 0 END AS award_points
  FROM scored
)
UPDATE majors m SET ranked = f.is_ranked, counted = f.is_counted, base_points = f.base_points, points = f.base_points + f.award_points
FROM final f WHERE f.id = m.id;

UPDATE season_standings st SET points = agg.points, majors_won = agg.won
FROM (
  SELECT m.season_id, m.user_id, sum(m.points)::int AS points, count(*) FILTER (WHERE m.champion AND m.ranked)::int AS won
  FROM majors m JOIN seasons s ON s.id = m.season_id WHERE s.status = 'active' GROUP BY m.season_id, m.user_id
) agg WHERE agg.season_id = st.season_id AND agg.user_id = st.user_id;
`
  },
  {
    id: 13,
    // Titles decide the season again: match awards add at most 3 points per Major (they repeat inside a run), and the
    // day's ten BEST runs count instead of the first three. Every run keeps what it would be worth (potential_points)
    // so a later, better run can take the place of a weaker one. Active seasons are rescored; coins stay as paid.
    sql: `
ALTER TABLE majors ADD COLUMN IF NOT EXISTS potential_points int NOT NULL DEFAULT 0;
UPDATE majors SET potential_points = points WHERE potential_points = 0;

WITH scored AS (
  SELECT m.id,
    CASE m.placement WHEN 'placementChampion' THEN 10 WHEN 'placementRunnerUp' THEN 7 WHEN 'placement3to4' THEN 5 WHEN 'placement5to8' THEN 3 ELSE 1 END AS full_points,
    m.lobby_size, m.ranked,
    coalesce((SELECT sum(r.points) FROM jsonb_array_elements(m.awards) a
      JOIN award_rules r ON r.kind = CASE WHEN jsonb_typeof(a) = 'string' THEN a #>> '{}' ELSE a ->> 'kind' END), 0)::int AS award_points
  FROM majors m JOIN seasons s ON s.id = m.season_id WHERE s.status = 'active'
), worth AS (
  SELECT id, ranked,
    CASE WHEN NOT ranked OR lobby_size < 2 THEN 0
      WHEN lobby_size >= 4 THEN full_points
      WHEN lobby_size = 3 THEN ceil(full_points / 2.0)::int
      ELSE round(full_points / 3.0)::int END AS base_points,
    CASE WHEN ranked AND lobby_size >= 2 THEN least(3, award_points) ELSE 0 END AS award_points
  FROM scored
)
UPDATE majors m SET base_points = w.base_points, potential_points = w.base_points + w.award_points
FROM worth w WHERE w.id = m.id;

WITH day_runs AS (
  SELECT m.id, row_number() OVER (PARTITION BY m.user_id, (m.played_at AT TIME ZONE 'UTC' - interval '3 hours')::date ORDER BY m.potential_points DESC, m.played_at, m.id) AS place
  FROM majors m JOIN seasons s ON s.id = m.season_id WHERE s.status = 'active' AND m.ranked
)
UPDATE majors m SET counted = d.place <= 10, points = CASE WHEN d.place <= 10 THEN m.potential_points ELSE 0 END
FROM day_runs d WHERE d.id = m.id;
UPDATE majors m SET counted = false, points = 0 FROM seasons s WHERE s.id = m.season_id AND s.status = 'active' AND NOT m.ranked;

UPDATE season_standings st SET points = agg.points
FROM (
  SELECT m.season_id, m.user_id, sum(m.points)::int AS points
  FROM majors m JOIN seasons s ON s.id = m.season_id WHERE s.status = 'active' GROUP BY m.season_id, m.user_id
) agg WHERE agg.season_id = st.season_id AND agg.user_id = st.user_id;
`
  },
  {
    id: 14,
    // Owner's ruling (2026-09-18): five titles of one account and two of another are annulled, the ones won in the
    // smallest lobbies first. Nothing is deleted: the runs and their awards are flagged `voided`, stop scoring and stop
    // counting as titles; coins already paid stay. Runs only by id, so the ruling can never catch another account.
    sql: `
ALTER TABLE majors ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;

WITH ruling(user_id, titles) AS (VALUES ('3bbabac9-16f1-4272-9d7d-5b5b0c508768'::uuid, 5), ('b08bf2fb-1f37-40d8-bf87-904796a50441'::uuid, 2)),
picked AS (
  SELECT m.id, row_number() OVER (PARTITION BY m.user_id ORDER BY m.lobby_size, m.potential_points, m.played_at, m.id) AS place, r.titles
  FROM majors m JOIN seasons s ON s.id = m.season_id JOIN ruling r ON r.user_id = m.user_id
  WHERE s.status = 'active' AND m.champion AND m.ranked AND NOT m.voided
)
UPDATE majors m SET voided = true, counted = false, points = 0 FROM picked p WHERE p.id = m.id AND p.place <= p.titles;

UPDATE awards a SET voided = true FROM majors m
WHERE m.voided AND a.user_id = m.user_id AND a.ref_id = m.room_code || ':' || m.seed AND NOT a.voided;

WITH day_runs AS (
  SELECT m.id, row_number() OVER (PARTITION BY m.user_id, (m.played_at AT TIME ZONE 'UTC' - interval '3 hours')::date ORDER BY m.potential_points DESC, m.played_at, m.id) AS place
  FROM majors m JOIN seasons s ON s.id = m.season_id
  WHERE s.status = 'active' AND m.ranked AND NOT m.voided AND m.user_id IN ('3bbabac9-16f1-4272-9d7d-5b5b0c508768', 'b08bf2fb-1f37-40d8-bf87-904796a50441')
)
UPDATE majors m SET counted = d.place <= 10, points = CASE WHEN d.place <= 10 THEN m.potential_points ELSE 0 END
FROM day_runs d WHERE d.id = m.id;

UPDATE season_standings st SET points = agg.points, majors_won = agg.won
FROM (
  SELECT m.season_id, m.user_id, sum(m.points)::int AS points, count(*) FILTER (WHERE m.champion AND m.ranked AND NOT m.voided)::int AS won
  FROM majors m JOIN seasons s ON s.id = m.season_id WHERE s.status = 'active' GROUP BY m.season_id, m.user_id
) agg WHERE agg.season_id = st.season_id AND agg.user_id = st.user_id
  AND st.user_id IN ('3bbabac9-16f1-4272-9d7d-5b5b0c508768', 'b08bf2fb-1f37-40d8-bf87-904796a50441');
`
  },
  {
    id: 15,
    // Owner's ruling on his own account (2026-09-18): only three titles stand, the two flawless ones (champion without
    // dropping a single map: every series a sweep) and the most recent title. Every other title of the account is
    // annulled, including re-deciding the ones ruling 14 had picked. Flags only; nothing deleted, coins stay.
    sql: `
WITH titles AS (
  SELECT m.id, m.played_at, m.lobby_size,
    (SELECT count(*) FROM jsonb_array_elements(m.awards) a WHERE (CASE WHEN jsonb_typeof(a) = 'string' THEN a #>> '{}' ELSE a ->> 'kind' END) = 'perfect_series') AS sweeps,
    (SELECT max((w.detail ->> 'series')::int) FROM awards w WHERE w.user_id = m.user_id AND w.kind = 'undefeated_major' AND w.ref_id = m.room_code || ':' || m.seed) AS series
  FROM majors m JOIN seasons s ON s.id = m.season_id
  WHERE s.status = 'active' AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND m.champion AND m.ranked
), flawless AS (
  SELECT id FROM titles WHERE series IS NOT NULL AND sweeps >= series ORDER BY lobby_size DESC, played_at DESC, id DESC LIMIT 2
), latest AS (
  SELECT id FROM titles WHERE id NOT IN (SELECT id FROM flawless) ORDER BY played_at DESC, id DESC LIMIT 1
), keep AS (SELECT id FROM flawless UNION SELECT id FROM latest)
UPDATE majors m SET voided = (m.id NOT IN (SELECT id FROM keep)) FROM titles t WHERE t.id = m.id;

UPDATE awards a SET voided = m.voided FROM majors m
WHERE m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND a.user_id = m.user_id AND a.ref_id = m.room_code || ':' || m.seed AND a.voided IS DISTINCT FROM m.voided;

UPDATE majors m SET counted = false, points = 0 FROM seasons s
WHERE s.id = m.season_id AND s.status = 'active' AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND m.voided;

WITH day_runs AS (
  SELECT m.id, row_number() OVER (PARTITION BY (m.played_at AT TIME ZONE 'UTC' - interval '3 hours')::date ORDER BY m.potential_points DESC, m.played_at, m.id) AS place
  FROM majors m JOIN seasons s ON s.id = m.season_id
  WHERE s.status = 'active' AND m.ranked AND NOT m.voided AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768'
)
UPDATE majors m SET counted = d.place <= 10, points = CASE WHEN d.place <= 10 THEN m.potential_points ELSE 0 END
FROM day_runs d WHERE d.id = m.id;

UPDATE season_standings st SET points = agg.points, majors_won = agg.won
FROM (
  SELECT m.season_id, m.user_id, sum(m.points)::int AS points, count(*) FILTER (WHERE m.champion AND m.ranked AND NOT m.voided)::int AS won
  FROM majors m JOIN seasons s ON s.id = m.season_id
  WHERE s.status = 'active' AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' GROUP BY m.season_id, m.user_id
) agg WHERE agg.season_id = st.season_id AND agg.user_id = st.user_id;
`
  },
  {
    id: 16,
    // Missões diárias, semanais, da season e solo (Entrega 1): progresso por período, sequência solo e o motivo mission_reward.
    sql: `
CREATE TABLE IF NOT EXISTS mission_progress (
  user_id uuid NOT NULL REFERENCES users(id),
  mission_id text NOT NULL,
  period_key text NOT NULL,
  progress int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  PRIMARY KEY (user_id, mission_id, period_key)
);
CREATE TABLE IF NOT EXISTS solo_streaks (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  current int NOT NULL DEFAULT 0,
  best int NOT NULL DEFAULT 0
);
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_reason_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_reason_check CHECK (reason IN ('pack_open','duplicate','sell','buy_pack','match_reward','season_prize','award','purchase','refund','chargeback','welcome','mission_reward'));
`
  },
  {
    id: 17,
    // Upgrader (Entrega 2): cada aposta com a seed sorteada no servidor; a carta que entra por ele tem origem 'upgrade'.
    sql: `
CREATE TABLE IF NOT EXISTS upgrades (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  stake text[] NOT NULL CHECK (cardinality(stake) BETWEEN 1 AND 6),
  target text NOT NULL,
  stake_value int NOT NULL,
  target_value int NOT NULL,
  chance double precision NOT NULL CHECK (chance >= 0 AND chance <= 0.75),
  seed text NOT NULL UNIQUE,
  roll double precision NOT NULL,
  won boolean NOT NULL,
  returned text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upgrades_user_idx ON upgrades (user_id, created_at DESC);
ALTER TABLE collection DROP CONSTRAINT IF EXISTS collection_source_check;
ALTER TABLE collection ADD CONSTRAINT collection_source_check CHECK (source IN ('pack','reward','upgrade'));
`
  },
  {
    id: 18,
    // Promoções diárias (Entrega 3): cada conta compra cada promoção uma vez por dia (Brasília).
    sql: `
CREATE TABLE IF NOT EXISTS promo_purchases (
  user_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  tier text NOT NULL CHECK (tier IN ('promo_elite','promo_superstar','promo_legend')),
  seed text NOT NULL,
  bought_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, tier)
);
`
  },
  {
    id: 19,
    // Trocas diretas (Entrega 4): carta por carta, com coins opcionais do proponente; motivo 'trade' no ledger e origem 'trade' na coleção.
    sql: `
CREATE TABLE IF NOT EXISTS trades (
  id bigserial PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES users(id),
  to_user uuid NOT NULL REFERENCES users(id),
  offered_card text NOT NULL,
  requested_card text NOT NULL,
  coins int NOT NULL DEFAULT 0 CHECK (coins >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE INDEX IF NOT EXISTS trades_to_idx ON trades (to_user, status);
CREATE INDEX IF NOT EXISTS trades_from_idx ON trades (from_user, status);
ALTER TABLE collection DROP CONSTRAINT IF EXISTS collection_source_check;
ALTER TABLE collection ADD CONSTRAINT collection_source_check CHECK (source IN ('pack','reward','upgrade','trade'));
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_reason_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_reason_check CHECK (reason IN ('pack_open','duplicate','sell','buy_pack','match_reward','season_prize','award','purchase','refund','chargeback','welcome','mission_reward','trade'));
`
  },
  {
    id: 20,
    // Upgrader provably fair: a seed do servidor ainda não usada (só o hash é publicado) e o nonce de cada conta;
    // cada aposta guarda a seed revelada, o hash publicado antes, a client seed e o nonce. `roll` já existia (17).
    sql: `
CREATE TABLE IF NOT EXISTS upgrader_seeds (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  server_seed text NOT NULL,
  nonce int NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upgrades ADD COLUMN IF NOT EXISTS server_seed text;
ALTER TABLE upgrades ADD COLUMN IF NOT EXISTS server_seed_hash text;
ALTER TABLE upgrades ADD COLUMN IF NOT EXISTS client_seed text CHECK (client_seed IS NULL OR char_length(client_seed) BETWEEN 1 AND 64);
ALTER TABLE upgrades ADD COLUMN IF NOT EXISTS nonce int;
ALTER TABLE upgrades ADD COLUMN IF NOT EXISTS roll double precision;
`
  },
  {
    id: 21,
    // Promoção diária de 4 cartas fixas (iguais para todas as contas): nova oferta de coach e registro da carta e do
    // preço cobrado. As linhas antigas (carta surpresa) continuam válidas; card_id e price ficam nulos nelas.
    sql: `
ALTER TABLE promo_purchases DROP CONSTRAINT IF EXISTS promo_purchases_tier_check;
ALTER TABLE promo_purchases ADD CONSTRAINT promo_purchases_tier_check CHECK (tier IN ('promo_elite','promo_superstar','promo_legend','promo_coach'));
ALTER TABLE promo_purchases ADD COLUMN IF NOT EXISTS card_id text;
ALTER TABLE promo_purchases ADD COLUMN IF NOT EXISTS price int CHECK (price IS NULL OR price > 0);
`
  },
  {
    id: 22,
    // Pacotes grátis por conta: um Prata por semana ISO e um Ouro por mês (fuso de Brasília). A chave primária faz
    // cada período valer uma vez só; a abertura em si fica em pack_opens, como a de qualquer pacote.
    sql: `
CREATE TABLE IF NOT EXISTS free_pack_claims (
  user_id uuid NOT NULL REFERENCES users(id),
  tier text NOT NULL CHECK (tier IN ('prata','ouro')),
  period_key text NOT NULL CHECK (char_length(period_key) BETWEEN 7 AND 8),
  seed text NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tier, period_key)
);
`
  },
  {
    id: 23,
    // Decisão do dono (2026-09-19) sobre a própria conta, depois do rebalanceamento da economia.
    // Ranking: tudo o que ele jogou antes das 18h de Brasília de 18/09 era teste e sai. Das partidas seguintes ficam no
    // máximo cinco Majors (os dois títulos invictos, um Major com 4+ jogadores e as mais recentes sem título), valendo
    // só os pontos da colocação, sem bônus de prêmio, e o total não passa a pontuação da Peka das Bebe. Só flags.
    // Conta: coleção e time zerados (cartas vindas de coins adicionadas à mão e upgrades da regra antiga), trocas
    // pendentes canceladas e carteira em 40.000 coins, com o ajuste registrado no ledger.
    sql: `
UPDATE majors m SET voided = true, counted = false, points = 0 FROM seasons s
WHERE s.id = m.season_id AND s.status = 'active' AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND m.played_at < '2026-09-18 21:00:00+00' AND NOT m.voided;

WITH runs AS (
  SELECT m.id, m.played_at, m.lobby_size, m.champion, m.base_points,
    EXISTS (SELECT 1 FROM awards w WHERE w.user_id = m.user_id AND w.kind = 'undefeated_major' AND w.ref_id = m.room_code || ':' || m.seed) AS unbeaten
  FROM majors m JOIN seasons s ON s.id = m.season_id
  WHERE s.status = 'active' AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND m.ranked AND NOT m.voided
), unbeaten AS (
  SELECT id, 1 AS prio FROM runs WHERE champion AND unbeaten ORDER BY lobby_size DESC, played_at DESC, id DESC LIMIT 2
), big AS (
  SELECT id, 2 AS prio FROM runs WHERE id NOT IN (SELECT id FROM unbeaten) AND lobby_size >= 4 ORDER BY champion DESC, played_at DESC, id DESC LIMIT 1
), rest AS (
  SELECT id, 3 AS prio FROM runs WHERE id NOT IN (SELECT id FROM unbeaten UNION SELECT id FROM big) AND NOT champion
  ORDER BY played_at DESC, id DESC LIMIT (SELECT 5 - (SELECT count(*) FROM unbeaten) - (SELECT count(*) FROM big))
), cap AS (
  SELECT coalesce((SELECT st.points FROM season_standings st JOIN seasons s ON s.id = st.season_id AND s.status = 'active' WHERE st.user_id = 'b08bf2fb-1f37-40d8-bf87-904796a50441'), 2147483647) AS points
), ranked_keep AS (
  SELECT r.id, sum(r.base_points) OVER (ORDER BY c.prio, r.played_at DESC, r.id DESC) AS running
  FROM (SELECT * FROM unbeaten UNION ALL SELECT * FROM big UNION ALL SELECT * FROM rest) c JOIN runs r ON r.id = c.id
), keep AS (SELECT id FROM ranked_keep WHERE running <= (SELECT points FROM cap))
UPDATE majors m SET voided = (m.id NOT IN (SELECT id FROM keep)), counted = (m.id IN (SELECT id FROM keep)),
  points = CASE WHEN m.id IN (SELECT id FROM keep) THEN m.base_points ELSE 0 END
FROM runs r WHERE r.id = m.id;

UPDATE awards a SET voided = true FROM majors m
WHERE m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND m.voided AND a.user_id = m.user_id AND a.ref_id = m.room_code || ':' || m.seed AND NOT a.voided;

UPDATE season_standings st SET points = agg.points, majors_won = agg.won, majors_played = agg.played
FROM (
  SELECT m.season_id, m.user_id, sum(m.points)::int AS points, count(*) FILTER (WHERE m.champion AND m.ranked AND NOT m.voided)::int AS won, count(*) FILTER (WHERE m.ranked AND NOT m.voided)::int AS played
  FROM majors m JOIN seasons s ON s.id = m.season_id
  WHERE s.status = 'active' AND m.user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' GROUP BY m.season_id, m.user_id
) agg WHERE agg.season_id = st.season_id AND agg.user_id = st.user_id;

UPDATE trades SET status = 'cancelled', resolved_at = now()
WHERE status = 'pending' AND (from_user = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' OR to_user = '3bbabac9-16f1-4272-9d7d-5b5b0c508768');
DELETE FROM lineups WHERE user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768';
DELETE FROM collection WHERE user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768';
INSERT INTO wallets (user_id, coins) SELECT id, 0 FROM users WHERE id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' ON CONFLICT (user_id) DO NOTHING;
INSERT INTO ledger (user_id, delta, reason, ref_id)
SELECT user_id, 40000 - coins, 'refund', 'reset-conta-dono-2026-09-19' FROM wallets
WHERE user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768' AND coins <> 40000;
UPDATE wallets SET coins = 40000, updated_at = now() WHERE user_id = '3bbabac9-16f1-4272-9d7d-5b5b0c508768';
`
  }
];

const LOCK_KEY = 7130;

export async function runMigrations(db: Db): Promise<number[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  return db.tx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    const applied = new Set((await tx.query<{ id: number }>('SELECT id FROM schema_migrations')).map((row) => row.id));
    const done: number[] = [];
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      await tx.query(migration.sql);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      done.push(migration.id);
    }
    return done;
  });
}
