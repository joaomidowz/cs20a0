import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/** Minimal handle the services depend on; a test can hand in a pool of a throwaway database. */
export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs `fn` inside BEGIN/COMMIT; any throw rolls back. */
  tx<T>(fn: (client: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface Tx {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
}

const wrap = (client: PoolClient | Pool): Tx => ({
  async query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
    const result = await client.query<T>(text, params);
    return result.rows;
  }
});

export function createDb(connectionString: string): Db {
  const needsSsl = /railway|sslmode=require/.test(connectionString);
  const pool = new Pool({ connectionString, max: 5, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
  const base = wrap(pool);
  return {
    query: base.query,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };
}
