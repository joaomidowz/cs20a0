// tests/lineupLockContract.test.ts
// Contrato de fonte: upgrader e trocas escondem as cartas de TODAS as lineups salvas, não só a ativa — o
// servidor devolve IN_LINEUP para carta escalada em qualquer slot (lineupCardIds consulta lineup_slots inteira).
// Nasceu do reporte de 2026-09-22: com 3 lineups, a roleta do upgrader listava as cartas das linhas 2 e 3
// e o giro falhava com "Tire a carta do time antes de apostar" para carta que não joga.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineupLockedIds, type CollectionState } from '../src/lib/game/online/collection';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const STORE_PAGES = [
  'src/routes/online/store/upgrader/+page.svelte',
  'src/routes/online/store/trocas/+page.svelte'
];

describe('contrato: cartas escaladas em qualquer lineup não aparecem para apostar/trocar', () => {
  it('as duas páginas da store derivam lockedIds de lineupLockedIds (todas as lineups)', () => {
    for (const page of STORE_PAGES) {
      const source = read(page);
      expect(source, `${page}: use lineupLockedIds`).toContain('lineupLockedIds');
      expect(source, `${page}: nunca derive de state.lineup (ativa) direto`).not.toMatch(/state\??\.lineup\b/);
    }
  });

  it('lineupLockedIds junta jogadores + coach de todas as lineups, cai para a ativa sem lineups e trata null', () => {
    const state = {
      lineup: { playerIds: ['ativa'], roles: [], starPlayerId: null, coachId: 'coach-ativa', style: 'balanced', starEffective: true },
      lineups: [
        { playerIds: ['a', 'b', 'c', 'd', 'e'], roles: [], starPlayerId: null, coachId: 'coach-1', style: 'balanced', starEffective: true },
        { playerIds: ['e', 'f', 'g', 'h', 'i'], roles: [], starPlayerId: null, coachId: null, style: 'balanced', starEffective: true }
      ]
    } as unknown as CollectionState;
    // Quem consome monta Set, então a carta em duas lineups pode repetir; coach também trava.
    expect(lineupLockedIds(state)).toEqual(['a', 'b', 'c', 'd', 'e', 'coach-1', 'e', 'f', 'g', 'h', 'i']);
    // Servidor velho, sem lineups[]: o estado ainda traz a ativa.
    expect(lineupLockedIds({ lineup: state.lineup } as CollectionState)).toEqual(['ativa', 'coach-ativa']);
    expect(lineupLockedIds(null)).toEqual([]);
  });
});
