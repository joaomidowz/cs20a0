import { browser } from '$app/environment';
import { DEFAULT_STRATEGIC_AUTOMATION, type StrategicAutomationPreferences } from './strategic-series';

export function loadStrategicPreferences(): StrategicAutomationPreferences {
  const preferences = { ...DEFAULT_STRATEGIC_AUTOMATION };
  if (!browser) return preferences;
  for (const key of Object.keys(preferences) as Array<keyof StrategicAutomationPreferences>) {
    const stored = localStorage.getItem(`cs13a0:strategy:${key}`);
    if (stored === 'true' || stored === 'false') preferences[key] = stored === 'true';
    else if (key === 'autoMapPicksAndVetos') {
      const legacy = localStorage.getItem('cs13a0:automation:veto');
      if (legacy === 'manual' || legacy === 'automatic') preferences[key] = legacy === 'automatic';
    }
  }
  return preferences;
}

export function saveStrategicPreferences(preferences: StrategicAutomationPreferences) {
  if (!browser) return;
  for (const key of Object.keys(DEFAULT_STRATEGIC_AUTOMATION) as Array<keyof StrategicAutomationPreferences>) localStorage.setItem(`cs13a0:strategy:${key}`, String(preferences[key]));
}
import type { AutomationMode, AutomationPreferences, VisualMode } from './types';

export type SimulationMode = 'manual' | 'auto';
export type SimulationSpeed = 'normal' | 'fast' | 'ultra';

export const DEFAULT_SIMULATION_PREFERENCES = {
  simulationMode: 'manual' as SimulationMode,
  simulationSpeed: 'normal' as SimulationSpeed
};

export const DEFAULT_PERSONAL_PREFERENCES: AutomationPreferences & { visual: VisualMode } = {
  draft: 'manual',
  veto: 'manual',
  match: 'manual',
  visual: 'complete'
};

const PERSONAL_KEYS = {
  draft: 'cs13a0:automation:draft',
  veto: 'cs13a0:automation:veto',
  match: 'cs13a0:automation:match',
  visual: 'cs13a0:visualMode'
} as const;

const isAutomationMode = (value: string | null): value is AutomationMode => value === 'manual' || value === 'automatic';
const isVisualMode = (value: string | null): value is VisualMode => value === 'complete' || value === 'clean';

export function loadPersonalPreferences(): AutomationPreferences & { visual: VisualMode } {
  if (!browser) return DEFAULT_PERSONAL_PREFERENCES;
  const legacyMatch = localStorage.getItem('cs13a0:simulationMode');
  return {
    draft: isAutomationMode(localStorage.getItem(PERSONAL_KEYS.draft)) ? localStorage.getItem(PERSONAL_KEYS.draft) as AutomationMode : 'manual',
    veto: isAutomationMode(localStorage.getItem(PERSONAL_KEYS.veto)) ? localStorage.getItem(PERSONAL_KEYS.veto) as AutomationMode : 'manual',
    match: isAutomationMode(localStorage.getItem(PERSONAL_KEYS.match))
      ? localStorage.getItem(PERSONAL_KEYS.match) as AutomationMode
      : legacyMatch === 'auto' ? 'automatic' : 'manual',
    visual: isVisualMode(localStorage.getItem(PERSONAL_KEYS.visual)) ? localStorage.getItem(PERSONAL_KEYS.visual) as VisualMode : 'complete'
  };
}

export function savePersonalPreferences(preferences: AutomationPreferences & { visual: VisualMode }) {
  if (!browser) return;
  localStorage.setItem(PERSONAL_KEYS.draft, preferences.draft);
  localStorage.setItem(PERSONAL_KEYS.veto, preferences.veto);
  localStorage.setItem(PERSONAL_KEYS.match, preferences.match);
  localStorage.setItem(PERSONAL_KEYS.visual, preferences.visual);
}

const isSimulationMode = (value: string | null): value is SimulationMode =>
  value === 'manual' || value === 'auto';

const isSimulationSpeed = (value: string | null): value is SimulationSpeed =>
  value === 'normal' || value === 'fast' || value === 'ultra';

export function loadSimulationPreferences() {
  if (!browser) return DEFAULT_SIMULATION_PREFERENCES;

  const storedMode = localStorage.getItem('cs13a0:simulationMode');
  const storedSpeed = localStorage.getItem('cs13a0:simulationSpeed');
  return {
    simulationMode: isSimulationMode(storedMode)
      ? storedMode
      : DEFAULT_SIMULATION_PREFERENCES.simulationMode,
    simulationSpeed: isSimulationSpeed(storedSpeed)
      ? storedSpeed
      : DEFAULT_SIMULATION_PREFERENCES.simulationSpeed
  };
}

export function saveSimulationPreferences(mode: SimulationMode, speed: SimulationSpeed) {
  if (!browser) return;
  localStorage.setItem('cs13a0:simulationMode', mode);
  localStorage.setItem('cs13a0:simulationSpeed', speed);
}
