// src/lib/game/playerCareer/scout.ts
// O básico de cada jogador à vista: país, idioma, idade e se ele fala a língua da call (cartas do seu time e dos
// adversários). E a busca de jogador do mundo da carreira: onde ele está agora (titular, reserva ou aposentado) e
// o caminho dele temporada a temporada (trocas, a vaga que cedeu para você, estreia, aposentadoria).
import { countryName } from '../visuals/flags';
import type { Player } from '../types';
import { memberBirthYear, memberCatalogOverall, memberCountryIn, memberNick, memberRoles, resolvedRoster, sceneOrgById, type SceneRosterMember } from './data';
import type { PlayerCareerState } from './engine';
import { englishBase, flagOf, fluencyLabel, LANGUAGE_LABEL, myFluency, nativeLanguage, npcFluency, spokenLabel, teamLanguage, type Language } from './language';
import { myLanguageFit, seatedNicks } from './squad';
import { createSeededRng } from '../simulation';
import { orgIn, seatMovesOf, worldHistory, worldRosters, yearOfSeason } from './world';

export interface CardInfo {
  flag: string | null;
  /** País em português ("Brasil"); null quando a coleta não diz. */
  country: string | null;
  /** Idioma nativo ("Português"). */
  spoken: string;
  age: number | null;
  /** A língua da call quando ele não é nativo dela: sigla, nome, fluência e se dá para jogar sem travar. */
  call: { code: string; label: string; fluency: number; ok: boolean } | null;
  /** Uma linha com tudo (tooltip e ficha grande). */
  detail: string;
}

const countryPt = (country: string | null | undefined) => {
  const flag = flagOf(country);
  return flag ? countryName(flag, 'pt-BR') : country && !['Internacional', 'Non-representing'].includes(country) ? country : null;
};

function infoFrom(country: string | null, age: number | null, call: Language, fluency: number, threshold: number): CardInfo {
  const native = nativeLanguage(country) === call;
  const spoken = spokenLabel(country);
  const place = countryPt(country);
  const callText = native ? `call em ${LANGUAGE_LABEL[call]}: nativo` : `call em ${LANGUAGE_LABEL[call]}: ${fluencyLabel(fluency)} (${fluency})`;
  return {
    flag: flagOf(country),
    country: place,
    spoken,
    age,
    call: native ? null : { code: (call === 'pt-pt' ? 'pt' : call).toUpperCase(), label: LANGUAGE_LABEL[call], fluency, ok: fluency >= threshold },
    detail: [place, `fala ${spoken}`, age === null ? null : `${age} anos`, callText].filter(Boolean).join(' · ')
  };
}

/** Idade de quem não tem data (lan house, substituto, vaga gerada): fixa pelo nick, envelhece com as temporadas. */
const fallbackBorn = (seed: string, nick: string) => 2026 - (17 + Math.floor(createSeededRng(`${seed}:born:${nick.toLowerCase()}`)() * 8));

/** Monta a ficha de cada carta de um time (o seu ou um adversário) na temporada atual. */
export function cardInfoFor(state: PlayerCareerState, orgId: string): (player: Player) => CardInfo {
  const year = yearOfSeason(state.seasonNumber);
  const org = orgId === 'lan-house' ? undefined : orgIn(state.seed, state.seasonNumber, orgId);
  const roster = org ? resolvedRoster(org) : [];
  const byNick = new Map(roster.map((member) => [memberNick(member).toLowerCase(), member]));
  const call: Language = orgId === state.orgId ? myLanguageFit(state).language : org ? teamLanguage(roster) : nativeLanguage(state.country);
  // Sem ficha (lan house, quem entrou no lugar de quem você tirou): o país mais comum do elenco, ou o seu.
  const counts = new Map<string, number>();
  for (const member of roster) if (member.country) counts.set(member.country, (counts.get(member.country) ?? 0) + 1);
  const usual = orgId === 'lan-house' ? state.country : [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? state.country;
  return (player) => {
    if (player.id === `${state.seed}:me`) return infoFrom(state.country, state.age, call, myFluency(state, call), 70);
    const nick = player.nickname ?? player.id;
    const member = byNick.get(nick.toLowerCase());
    const country = member ? member.country : usual;
    let born = member ? memberBirthYear(member) : null;
    if (born === null && (!member || member.generated)) born = fallbackBorn(state.seed, nick);
    const native = nativeLanguage(country);
    const fluency = member ? npcFluency(member, call) : native === call ? 100 : call === 'en' ? Math.min(100, englishBase(country) + 15) : 60;
    return infoFrom(country, born === null ? null : year - born, call, fluency, 60);
  };
}

export type ScoutStatus = 'titular' | 'reserva' | 'aposentado' | 'voce';

export interface ScoutHit {
  nick: string;
  orgId: string | null;
  orgName: string | null;
  level: number | null;
  role: string | null;
  age: number | null;
  overall: number | null;
  flag: string | null;
  spoken: string;
  status: ScoutStatus;
  /** Onde ele está, numa frase. */
  note: string;
  /** O caminho dele no mundo da carreira (mais recente primeiro). */
  history: Array<{ year: number; text: string }>;
}

const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function historyOf(state: PlayerCareerState, nick: string): ScoutHit['history'] {
  const key = nick.toLowerCase();
  const lines: ScoutHit['history'] = [];
  for (const move of seatMovesOf(state.seed)) {
    const year = yearOfSeason(move.season);
    if (move.nick.toLowerCase() === key) lines.push({ year, text: `Cedeu a vaga na ${move.fromName} para você e assinou com a ${move.toName}.` });
    if (move.standIn.toLowerCase() === key) lines.push({ year, text: `Foi da ${move.toName} para a ${move.fromName} na troca pelo ${move.nick}.` });
  }
  for (let season = 2; season <= state.seasonNumber; season += 1) {
    const year = yearOfSeason(season);
    const { transfers, retirements, debuts } = worldHistory(state.seed, season);
    for (const transfer of transfers) {
      if (transfer.nick.toLowerCase() === key) lines.push({ year, text: `Trocou a ${transfer.fromName} pela ${transfer.toName} (no lugar do ${transfer.swappedNick}).` });
      if (transfer.swappedNick.toLowerCase() === key) lines.push({ year, text: `Trocou a ${transfer.toName} pela ${transfer.fromName} (no lugar do ${transfer.nick}).` });
    }
    for (const retirement of retirements) {
      if (retirement.nick.toLowerCase() === key) lines.push({ year, text: `Pendurou o mouse aos ${retirement.age} anos, na ${retirement.orgName}.` });
      if (retirement.replacement.toLowerCase() === key) lines.push({ year, text: `Entrou na ${retirement.orgName} no lugar do ${retirement.nick}, que se aposentou.` });
    }
    for (const debut of debuts) if (debut.nick.toLowerCase() === key) lines.push({ year, text: `Estreou na ${debut.orgName} aos ${debut.age} anos.` });
  }
  return lines.sort((a, b) => b.year - a.year);
}

/** Busca no mundo da temporada atual (nick com 2+ letras): titulares, reservas do seu time e aposentados. */
export function scoutPlayers(state: PlayerCareerState, query: string, limit = 8): ScoutHit[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const year = yearOfSeason(state.seasonNumber);
  const seat = [...state.seatsTaken].reverse().find((taken) => taken.orgId === state.orgId);
  const benched = new Set(seat ? seatedNicks(state, seat) : []);
  const hits: ScoutHit[] = [];
  const seen = new Set<string>();
  const push = (hit: ScoutHit) => {
    if (seen.has(hit.nick.toLowerCase())) return;
    seen.add(hit.nick.toLowerCase());
    hits.push(hit);
  };
  if (norm(state.nick).includes(q)) {
    const org = sceneOrgById.get(state.orgId);
    push({
      nick: state.nick, orgId: state.orgId, orgName: org?.name ?? 'Lan house', level: org?.level ?? 5, role: state.role, age: state.age, overall: state.overall,
      flag: flagOf(state.country), spoken: spokenLabel(state.country), status: 'voce', note: `Você, no ${org?.name ?? 'time da lan house'}.`, history: []
    });
  }
  const make = (member: SceneRosterMember, orgId: string): ScoutHit => {
    const org = sceneOrgById.get(orgId);
    const nick = memberNick(member);
    const born = memberBirthYear(member) ?? (member.generated ? fallbackBorn(state.seed, nick) : null);
    const onBench = orgId === state.orgId && benched.has(nick.toLowerCase());
    return {
      nick, orgId, orgName: org?.name ?? null, level: org?.level ?? null, role: memberRoles(member)[0] ?? null,
      age: born === null ? null : year - born, overall: member.overall ?? memberCatalogOverall(member) ?? null,
      flag: flagOf(memberCountryIn(member, org)), spoken: spokenLabel(memberCountryIn(member, org)),
      status: onBench ? 'reserva' : 'titular',
      note: onBench ? `Reserva da ${org?.name}: está no banco desde que você chegou.` : `Titular da ${org?.name}.`,
      history: historyOf(state, nick)
    };
  };
  for (const [orgId, roster] of worldRosters(state.seed, state.seasonNumber)) {
    for (const member of roster) if (norm(memberNick(member)).includes(q)) push(make(member, orgId));
  }
  // Quem pendurou: estava na cena e não está em nenhum elenco agora.
  for (let season = state.seasonNumber; season >= 2; season -= 1) {
    for (const retirement of worldHistory(state.seed, season).retirements) {
      if (!norm(retirement.nick).includes(q)) continue;
      push({
        nick: retirement.nick, orgId: null, orgName: retirement.orgName, level: null, role: null, age: retirement.age + (state.seasonNumber - season), overall: null,
        flag: null, spoken: '', status: 'aposentado', note: `Aposentado desde ${yearOfSeason(season)} (último time: ${retirement.orgName}).`, history: historyOf(state, retirement.nick)
      });
    }
  }
  const rank = (hit: ScoutHit) => (norm(hit.nick) === q ? 0 : norm(hit.nick).startsWith(q) ? 1 : 2);
  return hits
    .sort((a, b) => rank(a) - rank(b) || (a.level ?? 9) - (b.level ?? 9) || (b.overall ?? 0) - (a.overall ?? 0))
    .slice(0, limit);
}
