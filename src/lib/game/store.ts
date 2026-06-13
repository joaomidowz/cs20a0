import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { playerById } from './data';
import { getEligibleSlotRoles, validatePlayerPick } from './roleRules';
import type { GameState } from './types';

const storageKey = 'cs20a0-run-v1';

export const makeSeed = () => Math.random().toString(36).slice(2, 8);

export const defaultState = (seed = ''): GameState => ({
  phase: 'home',
  language: 'pt-BR',
  theme: 'dark',
  seed,
  mode: null,
  style: 'balanced',
  styleLocked: false,
  selectedPlayers: [],
  usedTeamIds: [],
  rolledTeamId: null,
  simMode: 'manual',
  simSpeed: 'fast',
  majorRun: null,
  completedSeries: 0,
  stats: []
});

const loadState = (): GameState => {
  if (!browser) return defaultState();
  const querySeed = new URLSearchParams(window.location.search).get('seed');
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
    if (parsed.styleLocked === undefined) parsed.styleLocked = Boolean(parsed.selectedPlayers?.length);
    if ((parsed.phase as string) === 'major-setup') parsed.phase = 'draft';
    if (!querySeed && (!parsed.phase || parsed.phase === 'home')) {
      return {
        ...defaultState(),
        language: parsed.language ?? 'pt-BR',
        theme: parsed.theme ?? 'dark'
      };
    }
    if (querySeed && querySeed !== parsed.seed) {
      return {
        ...defaultState(querySeed),
        language: parsed.language ?? 'pt-BR',
        theme: parsed.theme ?? 'dark'
      };
    }
    return { ...defaultState(querySeed ?? parsed.seed ?? ''), ...parsed, seed: querySeed ?? parsed.seed ?? '' };
  } catch {
    return defaultState(querySeed ?? '');
  }
};

export const game = writable<GameState>(loadState());

if (browser) {
  game.subscribe((state) => {
    localStorage.setItem(storageKey, JSON.stringify(state));
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.lang = state.language;
  });
}
