// tests/playerCareerTrophyArt.test.ts
// Um troféu 3D por organizador: o campeonato acha o dele pelo nome (Major ou Tier S); sem troféu próprio, a taça genérica.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { worldCircuitOf } from '../src/lib/game/playerCareer/calendar';
import { trophyArt, trophyOrganizerOf } from '../src/lib/game/playerCareer/trophyArt';

describe('troféu por organizador', () => {
  it('pelo nome do campeonato, na versão do tier', () => {
    expect(trophyArt('title', 'Major', 'IEM Cologne Major 2027').art).toBe('iem-major');
    expect(trophyArt('title', 'S', 'Intel Extreme Masters Kraków 2026').art).toBe('iem-s');
    expect(trophyArt('title', 'Major', 'PGL Major Copenhagen 2026').art).toBe('pgl-major');
    expect(trophyArt('title', 'S', 'CS Asia Championships 2027').art).toBe('perfectworld-s');
    expect(trophyArt('title', 'S', 'Esports World Cup 2027').art).toBe('ewc-s');
    expect(trophyOrganizerOf('BLAST.tv Austin Major 2026')).toBe('blast');
    // Sem troféu próprio: a taça genérica do tier; medalha é sempre a do prêmio.
    expect(trophyArt('title', 'S', 'Copa Desconhecida 2030').art).toBe('s');
    expect(trophyArt('title', 'Major', 'Major Desconhecido 2030').art).toBe('major');
    expect(trophyArt('mvp', 'Major', 'IEM Cologne Major 2027').art).toBe('mvp');
  });

  it('todo Major e Tier S do circuito tem troféu do organizador e a imagem existe', () => {
    for (let year = 2026; year <= 2045; year += 1) {
      for (const event of worldCircuitOf(year).filter((entry) => entry.tier === 'Major' || entry.tier === 'S')) {
        const { art, height } = trophyArt('title', event.tier, event.name);
        expect(art.includes('-'), event.name).toBe(true);
        expect(height).toBeGreaterThan(0);
        expect(existsSync(new URL(`../static/career/trophies/${art}.webp`, import.meta.url)), art).toBe(true);
      }
    }
  });
});
