// src/lib/game/playerCareer/tiers.ts
// A régua única de tiers da Carreira (D5): times e campeonatos falam a mesma língua (Tier S, A, B, C e Lan House) e
// um lugar só decide o nível de um time hoje. Tela, chave, convites e ofertas leem `currentLevelOf`; a evolução do
// mundo (world.ts, sceneWorld) continua no nível base do catálogo, para uma temporada não depender da outra (D6).
// Hoje a regra é a de sempre: o nível que o seu time ganhou ou perdeu nesta carreira (orgLevels), senão o do
// catálogo. O plano 3 troca o miolo de `currentLevelOf` pelo tier do ranking, sem mudar a assinatura.
// Os níveis 0 e 1 são os dois o Tier S (top 16); o nível 0 (top 8) leva o selo "Elite" dentro dele.
import { TIER_LABEL, type EventTier } from './calendar';
import { sceneOrgById } from './data';
import type { PlayerCareerState } from './engine';

export type TeamTier = 'S' | 'A' | 'B' | 'C' | 'LAN';

export const TEAM_TIER_BY_LEVEL: Record<number, TeamTier> = { 0: 'S', 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'LAN' };
export const TEAM_TIER_LABEL: Record<TeamTier, string> = { S: 'Tier S', A: 'Tier A', B: 'Tier B', C: 'Tier C', LAN: 'Lan House' };

/** O que cada tier é na cena (texto do dono, D5): aparece na pirâmide e na ficha do time. */
export const TEAM_TIER_ABOUT: Record<TeamTier, string> = {
  S: 'A elite global: IEM, BLAST, Pro League e o Major, com estrutura de ponta. O top 8 leva o selo Elite.',
  A: 'Bate de frente com o Tier S, mas oscila. Joga os torneios grandes e cai cedo na chave.',
  B: 'O celeiro de talentos: times profissionais fortes na região, em ligas online e qualificatórias do Major.',
  C: 'O cenário de acesso: times em formação em qualificatórias abertas e ligas semiprofissionais.',
  LAN: 'O começo amador.'
};

/** O top 8 da cena (nível 0): o selo Elite dentro do Tier S. */
export const isEliteLevel = (level: number): boolean => level === 0;

/** "Tier S" até "Lan House" pelo nível (0 a 5); fora da régua, "Nível N". */
export function teamTierLabel(level: number): string {
  const tier: TeamTier | undefined = TEAM_TIER_BY_LEVEL[level];
  return tier ? TEAM_TIER_LABEL[tier] : `Nível ${level}`;
}

/** O rótulo com o selo: "Tier S · Elite" para o top 8, senão o mesmo de `teamTierLabel`. Para ficha, pirâmide e ofertas. */
export const teamTierTitle = (level: number): string => (isEliteLevel(level) ? `${teamTierLabel(level)} · Elite` : teamTierLabel(level));

/** A descrição do tier do nível (TEAM_TIER_ABOUT); fora da régua, vazio. */
export const teamTierAbout = (level: number): string => {
  const tier: TeamTier | undefined = TEAM_TIER_BY_LEVEL[level];
  return tier ? TEAM_TIER_ABOUT[tier] : '';
};

const LAN_HOUSE_ID = 'lan-house';

/** O nível do catálogo (data.ts), sem nada desta carreira. Para o mundo (sceneWorld) e para ler save antigo. */
export function baseLevelOf(orgId: string): number {
  return orgId === LAN_HOUSE_ID ? 5 : sceneOrgById.get(orgId)?.level ?? 5;
}

/** Nível atual de um time: a fonte única para tela, chave, convites e ofertas (nunca para sceneWorld). */
export function currentLevelOf(state: PlayerCareerState, orgId: string): number {
  return state.orgLevels?.[orgId] ?? baseLevelOf(orgId);
}

/** O tier de campeonato que o nível jogava antes de o calendário guardar `tier` (saves anteriores a 10202f2). */
export const legacyEventTier = (level: number): EventTier => (level <= 1 ? 'A' : level === 2 ? 'B' : 'C');

/** Rótulo do tier de um campeonato; sem tier salvo, o tier de campeonato que o nível do time joga. */
export const eventTierLabel = (tier: EventTier | undefined, teamLevel: number): string => TIER_LABEL[tier ?? legacyEventTier(teamLevel)];
