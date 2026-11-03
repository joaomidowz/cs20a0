// src/lib/game/playerCareer/data.ts
// Cena real 2026 + calibração real de aging, exportadas pelo Studio (export-career-player-data.mjs). O catálogo é
// read-only; a carreira do jogador vive no save. Países e elencos vêm da coleta Liquipedia (CC-BY-SA 3.0); o que
// não foi coletado é null — nunca estimado.
import rawScene from '$lib/data/cs/career-scene.game.json';
import rawCalibration from '$lib/data/cs/career-calibration.game.json';
import type { AgingCalibration } from '../career/aging';

export interface SceneTournamentRef { name: string; tier: string; placement: string | null }
export interface SceneRosterMember {
  nick: string;
  country: string | null;
  birthDate: string | null;
  roles: string[];
  catalogBaseId: string | null;
  prospect: boolean | null;
}
export interface SceneOrg {
  id: string;
  name: string;
  level: number; // 1 = Major · 2 = EPL/IEM/EWC · 3 = Contenders/Bounty/Thunderpick · 4 = CCT/GC
  country: string | null;
  calendarDensity: number;
  tournaments: SceneTournamentRef[];
  roster: SceneRosterMember[];
  sources: Array<{ tournament?: string; url?: string }>;
}
interface SceneFile {
  referenceYear: number;
  summary: { orgs: number; rosterMembers: number; rosterMembersWithBirthDate: number; coveragePct: number };
  orgs: SceneOrg[];
}

export const scene = rawScene as unknown as SceneFile;
export const sceneOrgs = scene.orgs;
export const sceneOrgById = new Map(sceneOrgs.map((org) => [org.id, org]));
export const calibration = rawCalibration as unknown as AgingCalibration;

export const orgsByLevel = (level: number): SceneOrg[] => sceneOrgs.filter((org) => org.level === level);
export const sceneCountries = [...new Set(sceneOrgs.map((org) => org.country).filter((country): country is string => Boolean(country)))].sort();

/** Faixa de força base por nível da pirâmide (mecânica derivada; o elenco do catálogo ajusta quando existe). */
export const ORG_BASE_POWER: Record<number, number> = { 1: 88, 2: 82, 3: 74, 4: 66, 5: 58 };
