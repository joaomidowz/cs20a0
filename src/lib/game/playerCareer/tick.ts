// src/lib/game/playerCareer/tick.ts
// O tempo entre um campeonato e o próximo: a vida fora do servidor anda (Mental, saudade, adaptação, pressão,
// condição física) com o idioma do time, a relação com o elenco, o tier e o resultado. Um lugar só, usado pela tela e
// pelas simulações longas, para os dois caminhos andarem igual.
import { orgOf, type PlayerCareerState, type TournamentResult } from './engine';
import { advanceLife, lifeOf, livesAbroad, mindBump } from './life';
import { matesOf, myLanguageFit, myPlayerOf } from './squad';

export function tickLife(state: PlayerCareerState, result: TournamentResult | null): { state: PlayerCareerState; notes: string[] } {
  if (state.status !== 'ACTIVE') return { state, notes: [] };
  const org = orgOf(state.orgId, state) as { level: number; region?: string };
  const mates = state.orgId === 'lan-house' ? [] : matesOf(state);
  const avgRelationship = mates.length ? mates.reduce((sum, mate) => sum + mate.relationship, 0) / mates.length : 60;
  const fit = state.orgId === 'lan-house' ? null : myLanguageFit(state);
  const advanced = advanceLife(state, {
    abroad: livesAbroad(state, org.region),
    teamFluency: fit?.fluency ?? 100,
    avgRelationship,
    level: org.level,
    fame: state.fame ?? 0,
    result: result && !result.skipped && !result.benched ? result : null,
    // O Mental da carta sem o empurrão que a própria Cabeça dá (senão ela se puxaria para cima sozinha).
    mentalSkill: Number(myPlayerOf(state).mental ?? 80) - mindBump(lifeOf(state).mind)
  });
  const morale = Math.max(0, Math.min(100, (state.morale ?? 60) + advanced.moraleDelta));
  return { state: { ...state, life: advanced.life, morale }, notes: advanced.notes };
}
