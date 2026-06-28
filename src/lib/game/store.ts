import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { playerById } from './data';
import { loadSimulationPreferences, saveSimulationPreferences } from './preferences';
import { getEligibleSlotRoles, validatePlayerPick } from './roleRules';
import { createRunStats } from './runStats';
import type { GameState } from './types';

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
  usedTeamIds: [],
  rolledTeamId: null,
  rerollsUsed: 0,
  simMode: 'manual',
  simSpeed: 'normal',
  majorRun: null,
  completedSeries: 0,
  stats: []
});

const loadState = (): GameState => {
  if (!browser) return defaultState();
  const querySeed = new URLSearchParams(window.location.search).get('seed');
  const preferences = loadSimulationPreferences();
  const preferredSimulation = {
    simMode: preferences.simulationMode,
    simSpeed: preferences.simulationSpeed
  };
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
    if (parsed.majorRun && parsed.selectedPlayers?.length && (!parsed.stats?.length || parsed.stats.some((stat) => !stat.assignedRole))) {
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
    localStorage.setItem(storageKey, JSON.stringify(state));
    saveSimulationPreferences(state.simMode, state.simSpeed);
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.lang = state.language;
  });
}
