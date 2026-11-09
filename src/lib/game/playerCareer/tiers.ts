// src/lib/game/playerCareer/tiers.ts
// A régua única de tiers da Carreira (D5): times e campeonatos falam a mesma língua (Tier S, A, B, C e Lan House) e
// um lugar só decide o nível de um time hoje. Tela, chave, convites e ofertas leem `currentLevelOf`; a evolução do
// mundo (world.ts, sceneWorld) continua no nível base do catálogo, para uma temporada não depender da outra (D6).
// Os times da cena seguem o ranking de times (ranking.ts, D7); o seu time segue o nível de temporada (orgLevels ou o
// catálogo), que só muda na virada.
// Os níveis 0 e 1 são os dois o Tier S (top 16); o nível 0 (top 8) leva o selo "Elite" dentro dele.
import { TIER_LABEL, type EventTier } from './calendar';
import { sceneOrgById } from './data';
import type { PlayerCareerState, SeasonLog } from './engine';
import { teamRankOf } from './ranking';

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

/** O nível que esta carreira deu ao time (o acesso e o rebaixamento do seu time, ou o nível com que você assinou) ou o
 *  do catálogo. Não olha o ranking: é o nível de temporada do seu time e o piso dos times da cena fora do top 16. */
export function homeLevelOf(state: Pick<PlayerCareerState, 'orgLevels'> | null | undefined, orgId: string): number {
  return state?.orgLevels?.[orgId] ?? baseLevelOf(orgId);
}

/** Nível pelo ranking (D5 e D7): 1 a 8 é o Tier S com o selo Elite (nível 0), 9 a 16 o resto do Tier S (nível 1);
 *  abaixo, o nível de casa, nunca acima do Tier A (nível 2). */
export function levelFromRank(rank: number | null, homeLevel: number): number {
  if (rank !== null && rank <= 8) return 0;
  if (rank !== null && rank <= 16) return 1;
  return Math.max(2, homeLevel);
}

const sameOrg = (a: string, b: string) => (sceneOrgById.get(a)?.id ?? a) === (sceneOrgById.get(b)?.id ?? b);
let resolving = false;

/**
 * Nível atual de um time: a fonte única para tela, chave, convites e ofertas (nunca para sceneWorld). Os times da cena
 * seguem o ranking (ranking.ts): 1 a 16 Tier S (1 a 8 com o selo Elite), abaixo o nível de casa. O seu time segue o
 * nível de temporada (homeLevelOf): o circuito que você joga só muda na virada (engine.ts finishSeason, com o acesso
 * pelos títulos e a promoção pelo ranking do fim do ano).
 */
export function currentLevelOf(state: PlayerCareerState, orgId: string): number {
  const home = homeLevelOf(state, orgId);
  if (!state?.seed || !Array.isArray(state.history) || !sceneOrgById.get(orgId) || sameOrg(orgId, state.orgId)) return home;
  // O ranking é a fonte do nível: se ele perguntar o nível de alguém, é recursão, e o erro aparece aqui, na hora.
  if (resolving) throw new Error('currentLevelOf chamado de dentro do ranking');
  resolving = true;
  try {
    return levelFromRank(teamRankOf(state, orgId), home);
  } finally {
    resolving = false;
  }
}

/** O tier de campeonato que o nível jogava antes de o calendário guardar `tier` (saves anteriores a 10202f2). */
export const legacyEventTier = (level: number): EventTier => (level <= 1 ? 'A' : level === 2 ? 'B' : 'C');

/** Rótulo do tier de um campeonato; sem tier salvo, o tier de campeonato que o nível do time joga. */
export const eventTierLabel = (tier: EventTier | undefined, teamLevel: number): string => TIER_LABEL[tier ?? legacyEventTier(teamLevel)];

/**
 * O nível em que a temporada foi jogada, na régua de hoje. Antes do Tier S (commit 10202f2) a elite inteira era o
 * nível 1 e nenhum resultado guardava `tier`: nessas temporadas, o time que hoje é nível 0 (Elite) no catálogo
 * aparece no nível 0. O save não é reescrito; quem traduz é a leitura.
 */
export function seasonLevelOf(log: Pick<SeasonLog, 'orgId' | 'orgLevel' | 'tournaments'>): number {
  const legacy = log.orgLevel === 1 && log.tournaments.length > 0 && log.tournaments.every((result) => !result.tier);
  return legacy && baseLevelOf(log.orgId) === 0 ? 0 : log.orgLevel;
}

/** A planilha de conteúdo (acontecimentos e dilemas) ainda fala a régua antiga, em que "Tier 1" era o nível 1 e
 *  "Tier 2" o nível 2: na leitura vira Tier S e Tier A. Os JSON não mudam; chaves de regra (como a condição
 *  "tier 2") não passam por aqui. */
export const retier = (text: string): string => text.replace(/\b[Tt]ier ([12])\b/g, (_match, digit: string) => (digit === '1' ? 'Tier S' : 'Tier A'));
