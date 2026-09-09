import { browser } from '$app/environment';

export type SimulationMode = 'manual' | 'auto';
export type SimulationSpeed = 'normal' | 'fast' | 'ultra';

export const DEFAULT_SIMULATION_PREFERENCES = {
  simulationMode: 'manual' as SimulationMode,
  simulationSpeed: 'normal' as SimulationSpeed
};

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

/** Automação pessoal das decisões ao vivo, controlada pela engrenagem. Fica no navegador de cada jogador. */
export interface StrategicAutomationPreferences {
  /** Veto de mapas e escolha de lado. */
  autoMapPicksAndVetos: boolean;
  /** Pausa tática pedida sozinha depois de uma sequência de rounds perdidos. */
  autoPause: boolean;
  /** Force ou save depois de perder o pistol. */
  autoEconomy: boolean;
  /** Modo simples: esconde o kill feed e deixa só o resultado de cada round. */
  simpleFeed: boolean;
}

export const DEFAULT_STRATEGIC_AUTOMATION: StrategicAutomationPreferences = {
  autoMapPicksAndVetos: true,
  autoPause: true,
  autoEconomy: true,
  simpleFeed: false
};

const STRATEGIC_KEYS = Object.keys(DEFAULT_STRATEGIC_AUTOMATION) as Array<keyof StrategicAutomationPreferences>;

export function loadStrategicPreferences(): StrategicAutomationPreferences {
  const preferences = { ...DEFAULT_STRATEGIC_AUTOMATION };
  if (!browser) return preferences;
  for (const key of STRATEGIC_KEYS) {
    const stored = localStorage.getItem(`cs13a0:strategy:${key}`);
    if (stored === 'true' || stored === 'false') preferences[key] = stored === 'true';
  }
  return preferences;
}

export function saveStrategicPreferences(preferences: StrategicAutomationPreferences) {
  if (!browser) return;
  for (const key of STRATEGIC_KEYS) localStorage.setItem(`cs13a0:strategy:${key}`, String(preferences[key]));
}
