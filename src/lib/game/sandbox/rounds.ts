/**
 * Compatibility layer: the Sandbox kill feed now comes straight from the shared round engine (`$lib/game/rounds`).
 * These aliases keep the Sandbox components and tests on their historical names.
 */
import { aggregateKills, countPistolWins, type FragLine } from '../rounds';
import type { BuyType, MapSide, RoundDetail, RoundEnding, RoundKill, Roster, TeamEconomy, TeamSide, Weapon } from '../types';

export type SandboxBuy = BuyType;
export type SandboxSide = MapSide;
export type SandboxTeamSide = TeamSide;
export type SandboxWeapon = Weapon;
export type SandboxRoundEnding = RoundEnding;
export type SandboxTeamEconomy = TeamEconomy;
export type SandboxKill = RoundKill;
export type SandboxRoundDetail = RoundDetail;
export type SandboxRoster = Roster;
export type SandboxFragLine = FragLine;

export const aggregateSandboxKills = aggregateKills;
export const countSandboxPistolWins = countPistolWins;
