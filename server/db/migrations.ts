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
