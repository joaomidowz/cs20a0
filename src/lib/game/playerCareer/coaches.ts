// src/lib/game/playerCareer/coaches.ts
// Os coaches do mundo da carreira. Cada time começa com o coach real do catálogo (coaches.game.json, o card mais
// recente daquele time); quem não tem coach coletado ganha um gerado. Coach envelhece com o mundo e para bem mais
// tarde que jogador: nada antes dos 50, certo aos 66. Quem para é substituído, de preferência, por um jogador que
// acabou de pendurar o mouse naquela temporada (ex-jogador vira coach). A idade do coach real é estimada: o
// catálogo não tem nascimento, então ele teria 31 anos no primeiro ano em que aparece como coach.
import rawCoaches from '$lib/data/cs/coaches.game.json';
import { createSeededRng } from '../simulation';
import { ORG_BASE_POWER, sceneOrgs, type SceneOrg } from './data';
import { randomNick } from './extraTeams';
import { worldHistory, yearOfSeason } from './world';

interface CoachCard { baseId: string; name: string; teamId: string; year: number; tactics: number; discipline: number; aggression: number; development: number; overall: number }

export interface CareerCoach {
  id: string;
  name: string;
  born: number;
  tactics: number;
  discipline: number;
  aggression: number;
  development: number;
  overall: number;
  /** Coach real do catálogo (senão, gerado ou ex-jogador do mundo da carreira). */
  real: boolean;
  formerPlayer: boolean;
  /** Ano em que assumiu o time. */
  since: number;
}

export interface CoachChange { season: number; orgId: string; orgName: string; out: string; outAge: number; in: string; formerPlayer: boolean }

const CARDS = rawCoaches as unknown as CoachCard[];
const teamKey = (text: string) => text.toLowerCase().replace(/-\d{4}$/, '').replace(/-/g, ' ').replace(/^(team|the)\s+/, '').replace(/\s+(esports|gaming|team|clan|club)$/g, '').replace(/[^a-z0-9]/g, '');
const LATEST = new Map<string, CoachCard>();
const FIRST_YEAR = new Map<string, number>();
for (const card of CARDS) {
  const key = teamKey(card.teamId);
  if (!LATEST.has(key) || LATEST.get(key)!.year < card.year) LATEST.set(key, card);
  FIRST_YEAR.set(card.baseId, Math.min(FIRST_YEAR.get(card.baseId) ?? 9999, card.year));
}

/** Idade em que o coach real aparece pela primeira vez no catálogo (estimativa). */
export const COACH_START_AGE = 31;

/** Coach para bem mais tarde que jogador: nada antes dos 50, sobe 5 pontos por ano, certo aos 66. */
export const coachRetireChance = (age: number): number => (age < 50 ? 0 : age >= 66 ? 1 : 0.05 + (age - 50) * 0.05);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function generated(seed: string, org: SceneOrg, year: number, name: string, age: number, bonus = 0): CareerCoach {
  const rng = createSeededRng(`${seed}:coach-attrs:${org.id}:${name}`);
  const band = (ORG_BASE_POWER[org.level] ?? 66) + bonus;
  const attr = () => clamp(band + Math.round((rng() - 0.5) * 14), 40, 99);
  const [tactics, discipline, aggression, development] = [attr(), attr(), attr(), attr()];
  return { id: `coach:${org.id}:${name.toLowerCase()}`, name, born: year - age, tactics, discipline, aggression, development, overall: Math.round((tactics + discipline + aggression + development) / 4), real: false, formerPlayer: false, since: year };
}

function initial(seed: string, org: SceneOrg): CareerCoach {
  const year = yearOfSeason(1);
  const card = LATEST.get(teamKey(org.name));
  const rng = createSeededRng(`${seed}:coach:${org.id}`);
  if (card) {
    const first = FIRST_YEAR.get(card.baseId) ?? card.year;
    return {
      id: `coach:${card.baseId}`, name: card.name, born: first - COACH_START_AGE - Math.floor(rng() * 4),
      tactics: card.tactics, discipline: card.discipline, aggression: card.aggression, development: card.development, overall: card.overall,
      real: true, formerPlayer: false, since: Math.min(year, card.year)
    };
  }
  return generated(seed, org, year, randomNick(`${seed}:coach-name:${org.id}`), 30 + Math.floor(rng() * 16));
}

interface CoachSeason { coaches: Map<string, CareerCoach>; changes: CoachChange[] }
const cache = new Map<string, CoachSeason>();
const CACHE_LIMIT = 128;

/** Os coaches de todos os times na temporada N (a 1 é o catálogo). */
export function coachWorld(seed: string, season: number): CoachSeason {
  const key = `${seed}:${season}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let result: CoachSeason;
  if (season <= 1) {
    result = { coaches: new Map(sceneOrgs.map((org) => [org.id, initial(seed, org)])), changes: [] };
  } else {
    const previous = coachWorld(seed, season - 1);
    const year = yearOfSeason(season);
    const rng = createSeededRng(`${seed}:coaches:${season}`);
    // Quem pendurou o mouse nesta virada pode virar coach (o mais velho primeiro: experiência de sobra).
    const retirees = [...worldHistory(seed, season).retirements].sort((a, b) => b.age - a.age);
    const hired = new Set<string>();
    const coaches = new Map(previous.coaches);
    const changes: CoachChange[] = [];
    for (const org of sceneOrgs) {
      const coach = coaches.get(org.id);
      if (!coach) continue;
      const age = year - coach.born;
      if (rng() >= coachRetireChance(age)) continue;
      const retiree = retirees.find((entry) => !hired.has(entry.nick.toLowerCase()) && (entry.orgName === org.name || rng() < 0.5));
      let next: CareerCoach;
      if (retiree) {
        hired.add(retiree.nick.toLowerCase());
        next = { ...generated(seed, org, year, retiree.nick, retiree.age, 3), formerPlayer: true };
      } else {
        next = generated(seed, org, year, randomNick(`${seed}:coach-name:${org.id}:${season}`), 33 + Math.floor(rng() * 10));
      }
      coaches.set(org.id, next);
      changes.push({ season, orgId: org.id, orgName: org.name, out: coach.name, outAge: age, in: next.name, formerPlayer: next.formerPlayer });
    }
    result = { coaches, changes };
  }
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return result;
}

export const coachOfOrg = (seed: string, season: number, orgId: string): CareerCoach | null => coachWorld(seed, season).coaches.get(orgId) ?? null;
