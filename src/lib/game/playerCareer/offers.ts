// src/lib/game/playerCareer/offers.ts
// Quem faz proposta para você (D11): toda org da cena, de qualquer região, desde que esteja na faixa de nível da
// janela, continue com a cara dela com você na vaga (D3) e passe na régua de idioma da call. O sorteio tem peso e não
// repete: o nível principal da janela pesa mais, quem tem a vaga da sua função pesa mais, call que você não fala pesa
// menos e quem já te fez proposta nesta temporada ou na anterior pesa bem menos. O nível é o de hoje (levelIn, que lê
// currentLevelOf e o ranking); o sorteio usa o rng da carreira (createSeededRng), então a mesma carreira tem as
// mesmas propostas.
import { ENGLISH_REQUIRED, levelIn, offerFrom, seatToTake, type CareerOffer, type PlayerCareerState } from './engine';
import { keepsIdentity, memberNick, orgLanguage, sceneOrgs, type SceneOrg, type SceneRosterMember } from './data';
import { orgIn } from './world';
import { myFluency, type Language } from './language';

/** Um pedaço da janela: os níveis (o primeiro é o principal), quantas propostas no máximo e o ajuste de salário. */
export interface OfferGroup { levels: number[]; count: number; bump: number }
export interface RecentOffer { orgId: string; season: number }

/** Peso de quem está no segundo nível da janela (um degrau abaixo do principal). */
export const SECOND_LEVEL_WEIGHT = 0.5;
/** Peso de time sem jogador da sua função (você entra no lugar de outro e alguém muda de função). */
export const OFF_ROLE_WEIGHT = 0.6;
/** Peso de time de call numa língua que você não fala bem (abaixo de 70) e que não é o inglês. */
export const FOREIGN_CALL_WEIGHT = 0.4;
/** Peso de quem já te fez proposta nesta temporada ou na anterior. */
export const RECENT_OFFER_WEIGHT = 0.25;
/** Quantas propostas a memória guarda. */
const RECENT_OFFER_LIMIT = 24;

/** A régua de idioma da call (D3 e ENGLISH_REQUIRED): no Tier S e no Tier A o time exige a língua da call dele, seja
 *  ela qual for. null: não exige ou você já fala o bastante. */
export function languageGate(state: PlayerCareerState, org: SceneOrg): { language: Language; need: number } | null {
  const need = ENGLISH_REQUIRED[levelIn(state, org)];
  if (!need) return null;
  const language = orgLanguage(org);
  return myFluency(state, language) >= need ? null : { language, need };
}

/** O time continua com a cara dele (D3) com você no lugar de quem perde a vaga (seatToTake)? */
export function seatKeepsIdentity(state: Pick<PlayerCareerState, 'nick' | 'country' | 'role'>, org: SceneOrg): boolean {
  const seat = seatToTake(org, state.role);
  const me: SceneRosterMember = { nick: state.nick, country: state.country, birthDate: null, roles: [state.role], catalogBaseId: null, prospect: null };
  const index = org.roster.findIndex((member) => memberNick(member) === seat.nick);
  const after = index < 0 ? [...org.roster, me] : org.roster.map((member, position) => (position === index ? me : member));
  return keepsIdentity(org.id, org.roster, after);
}

/** Quem já te fez proposta nesta temporada ou na anterior. */
const offeredRecently = (state: PlayerCareerState, orgId: string): boolean =>
  (state.recentOffers ?? []).some((entry) => entry.orgId === orgId && entry.season >= state.seasonNumber - 1);

/** O peso de uma org no sorteio da janela. */
export function offerWeight(state: PlayerCareerState, org: SceneOrg, primary: boolean): number {
  const language = orgLanguage(org);
  const speaks = language === 'en' || myFluency(state, language) >= 70;
  return (primary ? 1 : SECOND_LEVEL_WEIGHT)
    * (seatToTake(org, state.role).viaRole ? 1 : OFF_ROLE_WEIGHT)
    * (speaks ? 1 : FOREIGN_CALL_WEIGHT)
    * (offeredRecently(state, org.id) ? RECENT_OFFER_WEIGHT : 1);
}

/**
 * Sorteia as propostas da janela, grupo por grupo, sem repetir org e no máximo `max` (3). `season` é a temporada do
 * elenco em que você entraria (a vaga e a identidade são as de lá). Time de call em inglês que te barra pelo idioma
 * entra em `blocked` (a tela avisa); os de outra língua só não fazem proposta.
 */
export function pickOffers(
  state: PlayerCareerState,
  rng: () => number,
  groups: OfferGroup[],
  options: { season: number; max?: number; exclude?: (org: SceneOrg) => boolean; blocked?: Array<{ orgName: string; need: number }> }
): CareerOffer[] {
  const max = options.max ?? 3;
  const offers: CareerOffer[] = [];
  for (const group of groups) {
    const levels = group.levels.filter((level) => level >= 0 && level <= 4);
    if (!levels.length || offers.length >= max) continue;
    const entries: Array<{ org: SceneOrg; weight: number }> = [];
    for (const base of sceneOrgs) {
      if (base.id === state.orgId || offers.some((offer) => offer.orgId === base.id) || options.exclude?.(base)) continue;
      const level = levelIn(state, base);
      if (!levels.includes(level)) continue;
      const org = orgIn(state.seed, options.season, base.id) ?? base;
      if (!seatKeepsIdentity(state, org)) continue;
      const gate = languageGate(state, org);
      if (gate) {
        if (gate.language === 'en' && options.blocked && !options.blocked.some((entry) => entry.orgName === org.name)) options.blocked.push({ orgName: org.name, need: gate.need });
        continue;
      }
      entries.push({ org, weight: offerWeight(state, org, level === levels[0]) });
    }
    for (let taken = 0; taken < group.count && offers.length < max && entries.length; taken += 1) {
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = rng() * total;
      let index = entries.findIndex((entry) => (roll -= entry.weight) < 0);
      if (index < 0) index = entries.length - 1;
      offers.push(offerFrom(entries[index].org, state, group.bump));
      entries.splice(index, 1);
    }
  }
  return offers;
}

/** A memória de propostas depois desta janela: as desta temporada e da anterior, mais as novas. */
export function rememberOffers(state: PlayerCareerState, offers: CareerOffer[]): RecentOffer[] {
  const kept = (state.recentOffers ?? []).filter((entry) => entry.season >= state.seasonNumber - 1);
  return [...kept, ...offers.map((offer) => ({ orgId: offer.orgId, season: state.seasonNumber }))].slice(-RECENT_OFFER_LIMIT);
}
