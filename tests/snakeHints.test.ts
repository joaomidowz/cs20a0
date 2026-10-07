// tests/snakeHints.test.ts
// Fila Draft: dicas de sinergia durante o snake — funções centrais que faltam, temas que se formam e o que cada carta acrescenta.
import { describe, expect, it } from 'vitest';
import { collectionPlayerById } from '../src/lib/game/online/collection-pool';
import { snakeCardHint, snakeCardHints, snakeLineHints } from '../src/lib/game/online/snake-hints';
import type { SelectedPlayer } from '../src/lib/game/types';

const lookup = (id: string) => collectionPlayerById.get(id);
const pick = (playerId: string, role: SelectedPlayer['selectedSlotRole']): SelectedPlayer => ({ playerId, selectedSlotRole: role });
const astralis = [pick('device-2018', 'awper'), pick('dupreeh-2018', 'entry'), pick('gla1ve-2018', 'igl'), pick('magisk-2018', 'support'), pick('xyp9x-2018', 'lurker')];

describe('dicas da line', () => {
  it('line vazia: faltam IGL, AWPer e suporte, sem tema nem química', () => {
    const hints = snakeLineHints([], lookup);
    expect(hints.picks).toBe(0);
    expect(hints.missingCore).toEqual(['igl', 'awper', 'support']);
    expect(hints.themes).toEqual([]);
    expect(hints.chemistry).toBe(false);
  });

  it('duas cartas da Astralis 2018 formam o tema sem fechar química; a terceira fecha', () => {
    const two = snakeLineHints(astralis.slice(0, 2), lookup);
    const team = two.themes.find((line) => line.key === 'theme_team')!;
    expect(team).toBeDefined();
    expect(team.count).toBe(2);
    expect(team.exact).toBe(true);
    expect(team.locks).toBe(false);
    expect(two.chemistry).toBe(false);
    expect(two.missingCore).toEqual(['igl', 'support']);
    const three = snakeLineHints(astralis.slice(0, 3), lookup);
    expect(three.themes.find((line) => line.key === 'theme_team')!.locks).toBe(true);
    expect(three.chemistry).toBe(true);
    expect(three.missingCore).toEqual(['support']);
  });

  it('line completa não tem função faltando', () => {
    const full = snakeLineHints(astralis, lookup);
    expect(full.picks).toBe(5);
    expect(full.missingCore).toEqual([]);
    expect(full.chemistry).toBe(true);
  });
});

describe('dicas por carta', () => {
  it('um IGL preenche a função que falta; um colega de time engrossa o tema', () => {
    const lineup = astralis.slice(0, 2);
    const hints = snakeLineHints(lineup, lookup);
    const gla1ve = snakeCardHint(lookup('gla1ve-2018')!, lineup, lookup, hints);
    expect(gla1ve.fills).toBe('igl');
    expect(gla1ve.theme?.key).toBe('theme_team');
    expect(gla1ve.theme?.count).toBe(3);
    expect(gla1ve.theme?.locks).toBe(true);
  });

  it('carta sem relação não engrossa tema; o mapa do pool só traz quem acrescenta algo', () => {
    const lineup = astralis.slice(0, 2);
    const hints = snakeLineHints(lineup, lookup);
    const stranger = [...collectionPlayerById.values()].find((player) => player.teamId && !player.teamId.startsWith('astralis') && player.year !== 2018 && player.year !== 2017 && player.year !== 2019 && !player.id.includes('device') && player.eligibleSlotRoles?.every((role) => role === 'rifler'))!;
    expect(stranger).toBeDefined();
    const hint = snakeCardHint(stranger, lineup, lookup, hints);
    expect(hint.fills).toBeNull();
    expect(hint.theme).toBeNull();
    const map = snakeCardHints([stranger, lookup('gla1ve-2018')!, lookup('device-2018')!], lineup, lookup);
    expect(map.has(stranger.id)).toBe(false);
    expect(map.has('device-2018')).toBe(false);
    expect(map.get('gla1ve-2018')?.fills).toBe('igl');
  });

  it('line cheia não sugere nada', () => {
    const hints = snakeLineHints(astralis, lookup);
    expect(snakeCardHint(lookup('s1mple-2021')!, astralis, lookup, hints)).toEqual({ fills: null, theme: null });
  });
});
