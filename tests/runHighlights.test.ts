import { describe, expect, it } from 'vitest';
import { collectRunHighlights, highlightHeadshotRate } from '../src/lib/game/runHighlights';
import type { RoundDetail, SeriesResult } from '../src/lib/game/types';

const kill = (killerId: string, victimId: string, killerSide: 'a' | 'b', headshot = false, second = 10) => ({
  killerId, killerName: killerId, killerSide, victimId, victimName: victimId, weapon: 'ak47' as const, headshot, second
});

const round = (number: number, winner: 'a' | 'b', kills: RoundDetail['kills'], tags: RoundDetail['tags'] = []): RoundDetail => ({
  number, winner, sideA: 'ct', overtime: false,
  economy: { a: { buy: 'full', awp: false, money: 5000 }, b: { buy: 'full', awp: false, money: 5000 } },
  kills, ending: 'elimination', tags
});

const series = (details: RoundDetail[]): SeriesResult => ({
  id: 's1', phase: 'stage3', bestOf: 3,
  teamA: { id: 'user', name: 'Your Org', power: 80, mental: 80, clutch: 80, experience: 80, isUser: true },
  teamB: { id: 'bot', name: 'Bot 2020', power: 80, mental: 80, clutch: 80, experience: 80 },
  scoreA: 1, scoreB: 0, winnerId: 'user',
  maps: [{ map: 1, mapId: 'inferno', scoreA: 13, scoreB: 5, winnerId: 'user', rounds: [], overtime: false, details }],
  userMatch: true
});

describe('destaques lidos dos rounds jogados', () => {
  it('conta ace, clutch, abertura e headshots do time do usuário', () => {
    const highlights = collectRunHighlights([series([
      round(1, 'a', [kill('ana', 'x1', 'a', true), kill('ana', 'x2', 'a'), kill('ana', 'x3', 'a'), kill('ana', 'x4', 'a'), kill('ana', 'x5', 'a')]),
      round(2, 'a', [kill('y1', 'ana', 'b'), kill('bia', 'y1', 'a'), kill('bia', 'y2', 'a')], ['clutch']),
      round(3, 'b', [kill('y2', 'bia', 'b', true)])
    ])], 'user');

    const ana = highlights.players.find((player) => player.playerId === 'ana')!;
    expect(ana).toMatchObject({ kills: 5, aces: 1, openingKills: 1, headshots: 1, deaths: 1 });
    expect(highlightHeadshotRate(ana)).toBe(20);

    const bia = highlights.players.find((player) => player.playerId === 'bia')!;
    expect(bia).toMatchObject({ clutches: 1, kills: 2, deaths: 1 });

    expect(highlights.totals).toMatchObject({ rounds: 3, aces: 1, clutches: 1, kills: 7 });
    expect(highlights.moments[0]).toMatchObject({ kind: 'ace', name: 'ana', round: 1 });
    expect(highlights.moments.some((moment) => moment.kind === 'clutch' && moment.name === 'bia')).toBe(true);
  });

  it('ignora séries que não terminaram e não inventa nada sem rounds', () => {
    const unfinished = { ...series([]), winnerId: '' };
    expect(collectRunHighlights([unfinished], 'user')).toMatchObject({ players: [], moments: [], totals: { rounds: 0 } });
  });

  it('elege a arma mais usada por cada jogador', () => {
    const highlights = collectRunHighlights([series([
      round(1, 'a', [{ ...kill('ana', 'x1', 'a'), weapon: 'awp' }, { ...kill('ana', 'x2', 'a'), weapon: 'awp' }, kill('ana', 'x3', 'a')])
    ])], 'user');
    expect(highlights.players[0]).toMatchObject({ bestWeapon: 'awp', bestWeaponKills: 2 });
  });
});
