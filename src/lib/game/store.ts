import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { playerById, players, teams } from './data';
import { loadSimulationPreferences, saveSimulationPreferences } from './preferences';
import { buildProLineup, buildProRoleEvaluations } from './proMode';
import { getEligibleSlotRoles, validatePlayerPick } from './roleRules';
import { createRunStats } from './runStats';
import { buildMajorRun } from './simulation';
import { isValidLineupMapSelection, isValidMapSelection } from './maps';
import type { GameMode, GameState, LineupSlotRole, MapId, OrgStyle } from './types';

const storageKey = 'cs13a0-run-v1';

export const makeSeed = () => Math.random().toString(36).slice(2, 8);

function detectBrowserLanguage(): 'pt-BR' | 'es' | 'en' {
  if (!browser) return 'en';
  const lang = navigator.language || (navigator as any).userLanguage || '';
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}

export const defaultState = (seed = ''): GameState => ({
  phase: 'home',
  language: detectBrowserLanguage(),
  theme: 'dark',
  seed,
  mode: null,
  style: 'balanced',
  styleLocked: false,
  selectedPlayers: [],
  proPickedPlayerIds: [],
  proRoleAssignments: {},
  proRevealed: false,
  usedTeamIds: [],
  rolledTeamId: null,
  rerollsUsed: 0,
  selectedMaps: [],
  simMode: 'manual',
  simSpeed: 'normal',
  majorRun: null,
  playedSeries: {},
  completedSeries: 0,
  stats: []
});

const slotRoles = new Set<LineupSlotRole>(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler']);
const gameModes = new Set<GameMode>(['premier', 'faceit', 'pro']);
const orgStyles = new Set<OrgStyle>(['aggressive', 'balanced', 'tactical']);

const parseSharedRun = (params: URLSearchParams, preferredSimulation: Pick<GameState, 'simMode' | 'simSpeed'>): GameState | null => {
  if (params.get('result') !== '1') return null;
  const seed = params.get('seed') ?? '';
  const picks = params.get('picks') ?? '';
  if (!seed || !picks) return null;

  const selectedPlayers = picks.split(',').reduce<GameState['selectedPlayers']>((selected, item) => {
    const [playerId, rawRole] = item.split(':');
    if (!playerId || !slotRoles.has(rawRole as LineupSlotRole)) return selected;
    const player = playerById.get(playerId);
    if (!player) return selected;
    return [...selected, { playerId, selectedSlotRole: rawRole as LineupSlotRole }];
  }, []);
  if (selectedPlayers.length !== 5) return null;

  const pickedPlayers = selectedPlayers
    .map((selected) => playerById.get(selected.playerId))
    .filter((player): player is NonNullable<typeof player> => Boolean(player));
  if (pickedPlayers.length !== 5) return null;

  const styleParam = params.get('style') as OrgStyle | null;
  const modeParam = params.get('mode') as GameMode | null;
  const style = styleParam && orgStyles.has(styleParam) ? styleParam : 'balanced';
  const mode = modeParam && gameModes.has(modeParam) ? modeParam : 'premier';
  const mapParams = (params.get('maps') ?? '').split(',').filter(Boolean);
  const selectedMaps = isValidMapSelection(mapParams) ? [...mapParams] as MapId[] : [];
  const proRoleAssignments = selectedPlayers.reduce<Record<string, LineupSlotRole>>((assignments, selected) => ({
    ...assignments,
    [selected.playerId]: selected.selectedSlotRole
  }), {});
  const proEvaluations = mode === 'pro' ? buildProRoleEvaluations(pickedPlayers, proRoleAssignments, style) : [];
  const runPlayers = mode === 'pro' ? proEvaluations.map((evaluation) => evaluation.adjustedPlayer) : pickedPlayers;
  const runLineup = mode === 'pro' ? buildProLineup(proEvaluations) : selectedPlayers;
  const validSelectedMaps = isValidLineupMapSelection(selectedMaps, runPlayers, teams) ? selectedMaps : [];
  // Shared links replay the batch simulation (every decision by the bot policies). When the owner took decisions by
  // hand during their run (veto, side, eco call, timeouts) the shared result can differ from what they actually played.
  const majorRun = buildMajorRun(runPlayers, style, teams, players, seed, runLineup, {
    ...(isValidMapSelection(validSelectedMaps) ? { selectedMaps: validSelectedMaps } : {}),
    mode
  });
  const stats = createRunStats(runPlayers, majorRun, seed, runLineup);

  return {
    ...defaultState(seed),
    ...preferredSimulation,
    seed,
    mode,
    style,
    styleLocked: true,
    selectedPlayers: runLineup,
    proPickedPlayerIds: mode === 'pro' ? pickedPlayers.map((player) => player.id) : [],
    proRoleAssignments: mode === 'pro' ? proRoleAssignments : {},
    proRevealed: mode === 'pro',
    usedTeamIds: pickedPlayers.map((player) => player.teamId).filter((teamId): teamId is string => Boolean(teamId)),
    selectedMaps: validSelectedMaps,
    majorRun,
    completedSeries: majorRun.matches.length,
    stats,
    phase: 'result'
  };
};

// Seed of a run opened from a shared link. Viewing it must not overwrite the visitor's own saved run.
let sharedSnapshotSeed: string | null = null;

const loadState = (): GameState => {
  if (!browser) return defaultState();
  const queryParams = new URLSearchParams(window.location.search);
  const querySeed = queryParams.get('seed');
  const preferences = loadSimulationPreferences();
  const preferredSimulation = {
    simMode: preferences.simulationMode,
    simSpeed: preferences.simulationSpeed
  };
  const sharedRun = parseSharedRun(queryParams, preferredSimulation);
  if (sharedRun) {
    sharedSnapshotSeed = sharedRun.seed;
    return sharedRun;
  }
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? (JSON.parse(saved) as Partial<GameState> & { selectedPlayerIds?: string[] }) : {};
    if (!parsed.selectedPlayers && parsed.selectedPlayerIds?.length) {
      parsed.selectedPlayers = parsed.selectedPlayerIds.reduce<GameState['selectedPlayers']>((selected, playerId) => {
        const player = playerById.get(playerId);
        if (!player) return selected;
        const validation = validatePlayerPick(player, selected, undefined, (id) => playerById.get(id));
        const selectedSlotRole = validation.validRoles[0] ?? getEligibleSlotRoles(player)[0] ?? 'rifler';
        return [...selected, { playerId, selectedSlotRole }];
      }, []);
    }
    delete parsed.selectedPlayerIds;
    if (!isValidMapSelection(parsed.selectedMaps ?? [])) parsed.selectedMaps = [];
    // Stats only exist once a run is over: an offline Major in progress (stage3/playoffs) keeps them empty on purpose.
    if (parsed.majorRun && (parsed.phase === 'result' || parsed.phase === 'stats') && parsed.selectedPlayers?.length && (!parsed.stats?.length || parsed.stats.some((stat) => !stat.assignedRole))) {
      const selectedPlayers = parsed.selectedPlayers
        .map((selected) => playerById.get(selected.playerId))
        .filter((player): player is NonNullable<typeof player> => Boolean(player));
      parsed.stats = createRunStats(selectedPlayers, parsed.majorRun, parsed.seed ?? querySeed ?? '', parsed.selectedPlayers);
    }
    if (parsed.styleLocked === undefined) parsed.styleLocked = Boolean(parsed.selectedPlayers?.length);
    if ((parsed.phase as string) === 'major-setup') parsed.phase = 'draft';
    if (!querySeed && (!parsed.phase || parsed.phase === 'home')) {
      return {
        ...defaultState(),
        language: parsed.language ?? detectBrowserLanguage(),
        theme: parsed.theme ?? 'dark',
        ...preferredSimulation
      };
    }
    if (querySeed && querySeed !== parsed.seed) {
      return {
        ...defaultState(querySeed),
        language: parsed.language ?? detectBrowserLanguage(),
        theme: parsed.theme ?? 'dark',
        ...preferredSimulation
      };
    }
    return {
      ...defaultState(querySeed ?? parsed.seed ?? ''),
      ...parsed,
      ...preferredSimulation,
      seed: querySeed ?? parsed.seed ?? ''
    };
  } catch {
    return { ...defaultState(querySeed ?? ''), ...preferredSimulation };
  }
};

export const game = writable<GameState>(loadState());

if (browser) {
  game.subscribe((state) => {
    if (sharedSnapshotSeed !== null) {
      if (state.phase === 'result' && state.seed === sharedSnapshotSeed) {
        saveSimulationPreferences(state.simMode, state.simSpeed);
        document.documentElement.dataset.theme = state.theme;
        document.documentElement.lang = state.language;
        return;
      }
      sharedSnapshotSeed = null;
    }
    localStorage.setItem(storageKey, JSON.stringify(state));
    saveSimulationPreferences(state.simMode, state.simSpeed);
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.lang = state.language;
  });
}
