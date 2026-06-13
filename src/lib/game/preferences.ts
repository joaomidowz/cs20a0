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

  const storedMode = localStorage.getItem('cs20a0:simulationMode');
  const storedSpeed = localStorage.getItem('cs20a0:simulationSpeed');
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
  localStorage.setItem('cs20a0:simulationMode', mode);
  localStorage.setItem('cs20a0:simulationSpeed', speed);
}
