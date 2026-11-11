// src/lib/game/playerCareer/roleOffers.ts
// Proposta para trocar de função: nasce de um motivo real do seu time nos últimos dois campeonatos e o texto diz qual
// (nome e número). Sem motivo, não tem proposta. Os motivos, do mais forte para o mais fraco:
//   1. vaga: o time está sem ninguém na função;
//   2. má fase: o titular da função foi o pior do time nos dois últimos campeonatos e ficou abaixo de 0,90, os dois
//      medidos contra o que a função costuma render (IGL e suporte rendem menos: ROLE_META.ratingBias);
//   3. você: o seu rating ficou abaixo de 0,95 e o treino deixou o atributo de outra função perto do da sua;
//   4. veterano: 27 anos ou mais e atributo de IGL no nível do overall, com o IGL do time abaixo de 1,00.
// A sua carta precisa não ser ruim na função nova (atributo até 8 abaixo do overall). Aceitar troca você com o colega
// da função (ele vai para a sua antiga), então o time segue com os papéis cobertos. Uma proposta por temporada, nenhuma
// na temporada em que você já trocou; "testar em scrims" deixa o coach voltar ao assunto dois campeonatos depois.
import { ROLE_META, type PlayerCareerState, type PlayerRole, type TournamentResult } from './engine';
import { SLOTS } from './live';
import { bestOtherRole, matesOf, planOf, roleSkillOf, takeRole, type SquadMate } from './squad';

export type RoleOfferMotive = 'vaga' | 'ma-fase' | 'voce' | 'veterano';
export interface RoleOffer {
  role: PlayerRole;
  motive: RoleOfferMotive;
  /** O colega que troca de função com você (vai para a sua antiga). */
  mateNick?: string;
  text: string;
}
export type RoleOfferAnswer = 'aceitou' | 'testar' | 'recusou';
/** A última proposta: temporada, função, a sua resposta e em que campeonato da carreira ela veio. */
export interface RoleOfferRecord { season: number; role: PlayerRole; answer: RoleOfferAnswer; at: number }

const ROLE_NAME: Record<PlayerRole, string> = { igl: 'IGL', awper: 'AWPer', entry: 'entry', lurker: 'lurker', support: 'suporte', rifler: 'rifler' };
const ATTRIBUTE_NAME: Record<PlayerRole, string> = { igl: 'leitura de jogo', awper: 'AWP', entry: 'entrada', lurker: 'clutch', support: 'utilitária', rifler: 'mira' };
const VACANCY_LINE: Record<PlayerRole, string> = {
  igl: 'O coach quer você nas calls.',
  awper: 'O coach quer você com a AWP.',
  entry: 'O coach quer você abrindo os bombs.',
  lurker: 'O coach quer você fechando os flancos.',
  support: 'O coach quer você nas granadas e no trade.',
  rifler: 'O coach quer você na linha, só matando.'
};
const rating = (value: number) => value.toFixed(2).replace('.', ',');

/** Os dois últimos campeonatos que você jogou nesta temporada (sem banco e sem qualificatória pulada). */
function lastTwo(state: PlayerCareerState): TournamentResult[] {
  return (state.calendar ?? [])
    .filter((entry) => entry.status === 'PLAYED' && entry.result && !entry.result.skipped && !entry.result.benched)
    .map((entry) => entry.result!)
    .slice(-2);
}

/** O rating de alguém no campeonato (null sem linha ou com menos de 20 rounds: jogou pouco para julgar). */
const ratingOf = (result: TournamentResult, nick: string) => {
  const line = result.lines?.find((entry) => entry.nick.toLowerCase() === nick.toLowerCase());
  return line && line.rounds >= 20 ? line.rating : null;
};

/** Média do rating de alguém nos campeonatos (null se faltar a linha dele em algum). */
function averageOf(results: TournamentResult[], nick: string): number | null {
  const values = results.map((result) => ratingOf(result, nick));
  return values.some((value) => value === null) ? null : (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
}

/** Rating contra o que a função costuma render (o IGL que faz 0,95 está no normal dele). */
const againstRole = (value: number, role: PlayerRole) => value - ROLE_META[role].ratingBias;

/** Ele foi o pior do time (você incluído) em todos os campeonatos, cada um medido contra a própria função. */
function worstEveryTime(results: TournamentResult[], nick: string, team: Array<{ nick: string; role: PlayerRole }>): boolean {
  const roleOf = (who: string) => team.find((member) => member.nick.toLowerCase() === who.toLowerCase())?.role ?? 'rifler';
  return results.every((result) => {
    const mine = ratingOf(result, nick);
    if (mine === null) return false;
    const own = againstRole(mine, roleOf(nick));
    return team.every((other) => {
      if (other.nick.toLowerCase() === nick.toLowerCase()) return true;
      const theirs = ratingOf(result, other.nick);
      return theirs === null || againstRole(theirs, other.role) > own;
    });
  });
}

const teamOf = (state: PlayerCareerState, mates: SquadMate[] = matesOf(state)) =>
  [{ nick: state.nick, role: state.role }, ...mates.map((mate) => ({ nick: mate.player.nickname ?? '', role: (mate.player.role ?? 'rifler') as PlayerRole }))];

/** Você foi o pior rating do time nos dois últimos campeonatos. */
export function youWereWorst(state: PlayerCareerState): boolean {
  const results = lastTwo(state);
  if (results.length < 2) return false;
  return worstEveryTime(results, state.nick, teamOf(state));
}

const playedCount = (state: PlayerCareerState) =>
  state.history.reduce((sum, log) => sum + log.tournaments.length, 0) + (state.calendar ?? []).filter((entry) => entry.status === 'PLAYED').length;

/** Pode vir proposta agora? Uma por temporada (o "testar" não conta), nenhuma na temporada em que você já trocou. */
export function roleOfferAllowed(state: PlayerCareerState): boolean {
  if (state.status !== 'ACTIVE' || state.roleChange?.season === state.seasonNumber) return false;
  const last = state.lastRoleOffer;
  if (!last || last.season !== state.seasonNumber) return true;
  return last.answer === 'testar' && playedCount(state) - last.at >= 2;
}

/** A proposta que o momento do time justifica (ou nenhuma). */
export function roleOfferFor(state: PlayerCareerState): RoleOffer | null {
  if (!roleOfferAllowed(state)) return null;
  const results = lastTwo(state);
  const mates = matesOf(state);
  const team = teamOf(state, mates);
  const fits = (role: PlayerRole) => role !== state.role && roleSkillOf(state, role) >= state.overall - 8;
  // Quem recusou uma função na temporada passada não ouve a mesma proposta de novo agora.
  const refused = state.lastRoleOffer?.answer === 'recusou' && state.lastRoleOffer.season === state.seasonNumber - 1 ? state.lastRoleOffer.role : null;
  const open = (role: PlayerRole) => fits(role) && role !== refused;
  const holder = (role: PlayerRole): SquadMate | undefined => mates.find((mate) => mate.player.role === role);

  // 1) Vaga: ninguém do time na função.
  for (const role of SLOTS) {
    if (open(role) && !holder(role)) return { role, motive: 'vaga', text: `O time está sem ${ROLE_NAME[role]}. ${VACANCY_LINE[role]}` };
  }
  if (results.length < 2) return null;
  // 2) Má fase do titular da função.
  for (const mate of mates) {
    const role = mate.player.role as PlayerRole;
    const nick = mate.player.nickname ?? '';
    const average = averageOf(results, nick);
    if (!open(role) || average === null || againstRole(average, role) >= 0.9 || !worstEveryTime(results, nick, team)) continue;
    return { role, motive: 'ma-fase', mateNick: nick, text: `O ${nick} fez ${rating(average)} de rating nos últimos dois campeonatos, abaixo do que se espera de ${ROLE_NAME[role]}. O coach quer testar você na função dele.` };
  }
  // 3) Você rendendo pouco, com o treino puxando outra função.
  const mine = averageOf(results, state.nick) ?? results.reduce((sum, result) => sum + result.rating, 0) / results.length;
  const best = bestOtherRole(state);
  if (mine < 0.95 && open(best) && roleSkillOf(state, best) >= roleSkillOf(state, state.role) - 3) {
    const mate = holder(best);
    return {
      role: best, motive: 'voce', ...(mate ? { mateNick: mate.player.nickname ?? '' } : {}),
      text: `Você fez ${rating(mine)} de rating nos últimos dois campeonatos de ${ROLE_NAME[state.role]}. Nos treinos, sua ${ATTRIBUTE_NAME[best]} chegou no nível da sua função, e o coach quer testar você de ${ROLE_NAME[best]}.`
    };
  }
  // 4) Veterano para as calls.
  const igl = holder('igl');
  const iglAverage = igl ? averageOf(results, igl.player.nickname ?? '') : null;
  if (state.age >= 27 && open('igl') && roleSkillOf(state, 'igl') >= state.overall && igl && iglAverage !== null && iglAverage < 1) {
    const nick = igl.player.nickname ?? '';
    return { role: 'igl', motive: 'veterano', mateNick: nick, text: `Com ${state.age} anos você é a voz mais experiente do elenco, e o ${nick} fez ${rating(iglAverage)} nos últimos dois campeonatos. O coach quer você nas calls no lugar dele.` };
  }
  return null;
}

export const ROLE_OFFER_CHOICES = ['Aceitar a troca', 'Testar em scrims antes de decidir', 'Recusar e seguir na sua função'] as const;

/** A sua resposta: aceitar troca as funções (o colega vai para a sua antiga); testar e recusar só ficam registrados. */
export function answerRoleOffer(state: PlayerCareerState, offer: RoleOffer, choice: 0 | 1 | 2): { state: PlayerCareerState; line: string; good: boolean } {
  const answer: RoleOfferAnswer = choice === 0 ? 'aceitou' : choice === 1 ? 'testar' : 'recusou';
  const record: RoleOfferRecord = { season: state.seasonNumber, role: offer.role, answer, at: playedCount(state) };
  if (choice !== 0) {
    const line = choice === 1
      ? 'Você testa a função nos treinos e segue na sua por enquanto. Se o motivo continuar, o coach volta ao assunto.'
      : 'Você segue na sua função. O coach não gostou muito, mas respeita.';
    return { state: { ...state, lastRoleOffer: record }, line, good: choice === 1 };
  }
  const from = state.role;
  const taken = takeRole({ ...state, lastRoleOffer: record }, offer.role);
  let next = taken.state;
  let line = taken.line;
  if (offer.mateNick) {
    const plan = planOf(next);
    next = { ...next, squadPlan: { ...plan, roles: { ...plan.roles, [offer.mateNick.toLowerCase()]: from } } };
    line += ` O ${offer.mateNick} vai para ${ROLE_NAME[from]}.`;
  }
  return { state: next, line, good: taken.good };
}
