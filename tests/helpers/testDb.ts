// tests/helpers/testDb.ts
// Cada arquivo de teste de banco usa um schema próprio: o vitest roda arquivos em paralelo e um DROP SCHEMA compartilhado derruba o vizinho.
import { createDb, type Db } from '../../server/db/client';

export async function createTestDb(url: string, schema: string): Promise<Db> {
  const admin = createDb(url);
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.close();
  const scoped = new URL(url);
  scoped.searchParams.set('options', `-c search_path=${schema},public`);
  return createDb(scoped.toString());
}
