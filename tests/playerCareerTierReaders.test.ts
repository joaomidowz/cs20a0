// tests/playerCareerTierReaders.test.ts
// Quem lê nível de time fora do motor também passa por currentLevelOf: o time do motor na chave (a Elite do Tier S
// não vira underdog), o Top 20 da HLTV, o contato da semana e a busca.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { memberRoles, sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { sceneOrgEnginePlayers, sceneOrgToEngineTeam } from '../src/lib/game/playerCareer/live';
import { seasonAwards } from '../src/lib/game/playerCareer/awards';
import { AGENDA_BY_ID, contactOf } from '../src/lib/game/playerCareer/agenda';
import { scoutPlayers } from '../src/lib/game/playerCareer/scout';
import { orgIn } from '../src/lib/game/playerCareer/world';
import { currentLevelOf } from '../src/lib/game/playerCareer/tiers';

describe('leitores de nível fora do motor', () => {
  it('time da Elite (nível 0) fora do Major entra no motor como S, não como underdog', () => {
    const elite = sceneOrgs.find((org) => org.level === 0)!;
    const players = sceneOrgEnginePlayers(elite, 'tier-engine');
    expect(sceneOrgToEngineTeam(elite, players).tier).toBe('S');
    expect(sceneOrgToEngineTeam(elite, players, 3).tier).toBe('playoff-team');
  });

  it('o Top 20 lê o nível de hoje: time do nível 1 levado à Elite ganha o peso da Elite', () => {
    const state: PlayerCareerState = { ...createPlayerCareer({ nick: 'Probe', country: 'Brazil', role: 'rifler', seed: 'probe-1' }), pendingDraw: null, drawDone: true };
    const base = seasonAwards(state, 5, 'Lan House').hltvTop;
    const levelOne = base.find((player) => sceneOrgById.get(player.teamId ?? '')?.level === 1)!;
    expect(levelOne).toBeDefined();
    const promoted = seasonAwards({ ...state, orgLevels: { [levelOne.teamId!]: 0 } }, 5, 'Lan House').hltvTop.find((player) => player.nick === levelOne.nick)!;
    expect(promoted.score).toBeCloseTo(levelOne.score + 0.03, 2);
  });

  it('o contato da semana sai de time da sua região num tier perto do seu, pelo nível de hoje', () => {
    const duo = AGENDA_BY_ID.get('sem-duo-com-awper-profissional')!;
    const mibr = sceneOrgs.find((org) => org.name === 'MIBR')!;
    const base = startSeason({ ...createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: 'week-contact-tier' }), orgId: mibr.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
    const level = currentLevelOf(base, mibr.id);
    const others = sceneOrgs.filter((org) => org.region === 'sa' && org.id !== mibr.id);
    // Um time longe do seu degrau no catálogo (diferença de mais de 1) e com AWPer: pelo catálogo, nunca seria o contato.
    const target = others.find((org) => Math.abs(org.level - level) > 1 && orgIn(base.seed, base.seasonNumber, org.id)!.roster.some((member) => memberRoles(member).includes('awper')))!;
    const orgLevels = Object.fromEntries(others.map((org) => [org.id, org.id === target.id ? level : 5]));
    expect(contactOf({ ...base, orgLevels }, duo)?.org).toBe(target.name);
  });

  it('a busca marca você no nível de hoje do seu time', () => {
    const org = sceneOrgs.find((candidate) => candidate.level === 3)!;
    const base = createPlayerCareer({ nick: 'zzscout', country: 'Brazil', role: 'rifler', seed: 'scout-tier' });
    const state: PlayerCareerState = { ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [], orgLevels: { [org.id]: 2 } };
    const me = scoutPlayers(state, 'zzscout').find((hit) => hit.status === 'voce')!;
    expect(me.level).toBe(2);
  });
});
