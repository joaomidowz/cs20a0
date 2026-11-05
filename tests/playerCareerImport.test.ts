// tests/playerCareerImport.test.ts
// O conteúdo das planilhas entra sem duplicata, com ids íntegros, e toda condição tem regra no jogo (fato, momento,
// premissa ou não suportado). O relatório de importação lista o que ficou de fora.
import { describe, expect, it } from 'vitest';
import week from '../src/lib/data/cs/career-week.game.json';
import dilemmas from '../src/lib/data/cs/career-dilemmas.game.json';
import events from '../src/lib/data/cs/career-events-v3.game.json';
import revivals from '../src/lib/data/cs/career-revivals.game.json';
import lines from '../src/lib/data/cs/career-lines.game.json';
import report from '../src/lib/data/cs/career-import-report.game.json';
import { kindOf } from '../src/lib/game/playerCareer/conditions';
import { AGENDA } from '../src/lib/game/playerCareer/agenda';
import { HAPPENINGS } from '../src/lib/game/playerCareer/happenings';

describe('importação do conteúdo', () => {
  it('semana: 63 originais (os do jogo) + 194 novas, sem id repetido nem colidindo com o jogo', () => {
    expect(week.originals).toHaveLength(63);
    expect(week.activities).toHaveLength(194);
    const ids = new Set(AGENDA.map((action) => action.id));
    for (const original of week.originals) expect(ids.has(original.id), original.id).toBe(true);
    const all = [...week.originals.map((item) => item.id), ...week.activities.map((item) => item.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('acontecimentos: 150 legados batem com os do jogo; 200 novos sem colidir', () => {
    expect(Object.keys(events.legacy)).toHaveLength(150);
    for (const id of Object.keys(events.legacy)) expect(HAPPENINGS.some((event) => event.id === id), id).toBe(true);
    expect(events.events).toHaveLength(200);
    expect(new Set(events.events.map((event) => event.id)).size).toBe(200);
    for (const event of events.events) expect(event.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('dilemas, retornos e falas', () => {
    expect(dilemmas.dilemmas).toHaveLength(24);
    expect(revivals.revivals).toHaveLength(20);
    expect(lines.contextual).toHaveLength(160);
    expect(report.campeonatos.recusados).toEqual([]);
  });

  it('toda condição das planilhas tem regra no jogo (nenhuma fica sem tipo)', () => {
    const clauses = new Set([
      ...[...week.activities, ...week.originals].flatMap((item) => item.condition),
      ...dilemmas.dilemmas.flatMap((item) => item.condition),
      ...events.events.flatMap((item) => item.conditions)
    ]);
    const missing = [...clauses].filter((clause) => kindOf(clause) === null);
    expect(missing).toEqual([]);
  });
});
