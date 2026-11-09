// tests/playerCareerTierTexts.test.ts
// Os textos que o jogador lê falam a régua de letras: acontecimentos e dilemas da planilha (traduzidos na leitura),
// a meta do coach, o veredito e os arquétipos. Régua da D5 revisada: o antigo Tier 1 (nível 1) é Tier S, o antigo
// Tier 2 (nível 2) é Tier A e o antigo Challenger (nível 3) é Tier B.
import { describe, expect, it } from 'vitest';
import { ALL_HAPPENINGS, HAPPENING_BY_ID } from '../src/lib/game/playerCareer/happenings';
import { DILEMMA_BY_ID, DILEMMAS } from '../src/lib/game/playerCareer/dilemmas';
import { ARCHETYPES, createPlayerCareer, retire, startSeason, type PlayerCareerState, type SeasonLog } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { seasonTalk } from '../src/lib/game/playerCareer/talks';
import { retier } from '../src/lib/game/playerCareer/tiers';

const OLD = /\b[Tt]ier [12]\b/;

describe('textos na régua de letras', () => {
  it('retier troca Tier 1/Tier 2 por Tier S/Tier A e não mexe no resto', () => {
    expect(retier('Rumo ao Tier 1')).toBe('Rumo ao Tier S');
    expect(retier('Tier 2 consolidado')).toBe('Tier A consolidado');
    expect(retier('Ano sem evolução no tier 2')).toBe('Ano sem evolução no Tier A');
    expect(retier('Tier S e legado')).toBe('Tier S e legado');
    expect(retier('Tier 10')).toBe('Tier 10');
  });

  it('acontecimentos e dilemas não mostram Tier 1 nem Tier 2', () => {
    for (const event of ALL_HAPPENINGS) {
      expect(event.phase).not.toMatch(OLD);
      expect(event.situation).not.toMatch(OLD);
      for (const choice of event.choices) {
        expect(choice.text).not.toMatch(OLD);
        expect(choice.consequence ?? '').not.toMatch(OLD);
      }
    }
    for (const dilemma of DILEMMAS) expect(dilemma.title).not.toMatch(OLD);
    expect(HAPPENING_BY_ID.get('EV081')!.situation).toBe('Um time de Tier S quer contratar seu rifler');
    expect(HAPPENING_BY_ID.get('EXT030')!.situation).toBe('Seu time vence um torneio menor, mas a torcida exige largar o circuito Tier A imediatamente');
    expect(DILEMMA_BY_ID.get('dilema-020')!.title).toBe('Ano sem evolução no Tier A');
  });

  it('a condição "tier 2" do dilema continua valendo (é chave de regra, não texto)', () => {
    expect(DILEMMA_BY_ID.get('dilema-020')!.condition).toContain('tier 2');
  });

  it('o coach de um time do nível 2 fala de campeonato de Tier B (o tier de campeonato que o calendário dele tem)', () => {
    const org = sceneOrgs.find((candidate) => candidate.level === 2)!;
    const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: 'goal-b' });
    const state = startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
    expect(seasonTalk(state)!.line).toBe('A meta é ganhar campeonato de Tier B e chamar a atenção de quem está em cima.');
  });

  it('veredito e arquétipos falam Tier S, A e B', () => {
    const org = sceneOrgs.find((candidate) => candidate.level === 2)!;
    const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: 'verdict-b' });
    const log = (orgLevel: number): SeasonLog => ({ seasonNumber: 1, year: 2026, orgId: org.id, orgName: org.name, orgLevel, tournaments: [], seasonRating: 1, overallBefore: 70, overallAfter: 72, titles: 0, injury: null, agingNote: null });
    const at = (orgLevel: number): PlayerCareerState => ({ ...base, pendingDraw: null, drawDone: true, history: [log(orgLevel)] });
    expect(retire(at(2)).verdict!.line).toBe('Chegou ao Tier A e deixou nome.');
    expect(retire(at(3)).verdict!.line).toBe('Carreira sólida no Tier B.');
    expect(ARCHETYPES.solido.blurb).toBe('Carreira estável no circuito. Chegar ao Tier S é raro.');
    expect(ARCHETYPES.tardio.blurb).toBe('Chega mais velho e pronto. Janela curta: sobe logo ou fica no Tier B.');
  });
});
