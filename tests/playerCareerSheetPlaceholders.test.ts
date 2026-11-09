// tests/playerCareerSheetPlaceholders.test.ts
// Nicks de vaga da planilha ("cpc_igl", "pela_rif") não são jogadores: viram nicks gerados, com a função e o país
// da vaga, e um save que já estava num desses times continua abrindo com o elenco completo.
import { describe, expect, it } from 'vitest';
import { sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { isPlaceholderNick } from '../src/lib/game/playerCareer/extraTeams';
import { createPlayerCareer, ensureDraw, startSeason } from '../src/lib/game/playerCareer/engine';
import { ensureSquad, matesOf } from '../src/lib/game/playerCareer/squad';

describe('vagas da planilha', () => {
  it('reconhece só o formato de vaga', () => {
    expect(isPlaceholderNick('cpc_igl')).toBe(true);
    expect(isPlaceholderNick('pela_rif')).toBe(true);
    expect(isPlaceholderNick('KSCERATO')).toBe(false);
    expect(isPlaceholderNick('slaxz-')).toBe(false);
    expect(isPlaceholderNick(null)).toBe(false);
  });

  it('nenhum time da cena joga com nick de vaga', () => {
    const left = sceneOrgs.flatMap((org) => org.roster.filter((member) => isPlaceholderNick(member.nick)).map((member) => `${org.name}: ${member.nick}`));
    expect(left).toEqual([]);
  });

  it('o CPC Curralzinho tem 5 nicks gerados, brasileiros, com as funções da planilha', () => {
    const cpc = sceneOrgById.get('cpc-curralzinho-esports-2026')!;
    expect(cpc.roster).toHaveLength(5);
    expect(cpc.roster.every((member) => member.generated && member.country === 'Brazil')).toBe(true);
    expect(cpc.roster.map((member) => member.roles[0]).sort()).toEqual(['awp', 'entry', 'igl', 'lurker', 'rifler']);
  });

  it('save que já estava no CPC abre com 4 parceiros', () => {
    const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed: 'cpc-save' });
    const career = startSeason({ ...base, orgId: 'cpc-curralzinho-esports-2026', pendingDraw: null, drawDone: true, seatsTaken: [{ orgId: 'cpc-curralzinho-esports-2026', orgName: 'CPC Curralzinho Esports', nick: 'cpc_rif', viaRole: true, season: 1 }] });
    const loaded = ensureSquad(ensureDraw(JSON.parse(JSON.stringify(career))));
    const mates = matesOf(loaded);
    expect(mates).toHaveLength(4);
    expect(mates.some((mate) => isPlaceholderNick(mate.player.nickname))).toBe(false);
  });
});
