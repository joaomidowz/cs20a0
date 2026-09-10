import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, roomConfigSchema, toPresentationGameMode } from '../src/lib/game/online/contracts';
import { translateOnlineMode } from '../src/lib/game/online/i18n';

const onlinePageSource = readFileSync(new URL('../src/routes/online/+page.svelte', import.meta.url), 'utf8');

describe('online mode presentation', () => {
  it('uses protocol 8 and accepts both online-only modes', () => {
    expect(PROTOCOL_VERSION).toBe(8);
    expect(roomConfigSchema.parse({ mode: 'fun', entryStage: 'stage3', capacity: 2, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: 'normal' })).toMatchObject({ mode: 'fun', seasonRuns: 1 });
    expect(roomConfigSchema.parse({ mode: 'max_fun', entryStage: 'stage3', capacity: 16, draftDeadlineSeconds: null, simulationMode: 'manual', simulationSpeed: 'ultra', seasonRuns: 4 })).toMatchObject({ mode: 'max_fun', seasonRuns: 4 });
    for (const seasonRuns of [1, 2, 3, 4] as const) {
      expect(roomConfigSchema.safeParse({ ...roomConfigSchema.parse({ mode: 'fun', entryStage: 'stage3', capacity: 2, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: 'normal' }), seasonRuns }).success).toBe(true);
    }
    for (const seasonRuns of [0, 5]) {
      expect(roomConfigSchema.safeParse({ mode: 'fun', entryStage: 'stage3', capacity: 2, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: 'normal', seasonRuns }).success).toBe(false);
    }
  });

  it('keeps solo GameMode unchanged and maps online-only modes to Normal presentation', () => {
    expect(toPresentationGameMode('premier')).toBe('premier');
    expect(toPresentationGameMode('faceit')).toBe('faceit');
    expect(toPresentationGameMode('pro')).toBe('pro');
    expect(toPresentationGameMode('fun')).toBe('premier');
    expect(toPresentationGameMode('max_fun')).toBe('premier');
  });

  it('localizes the five lobby modes and descriptions in Portuguese, English, and Spanish', () => {
    expect(translateOnlineMode('pt-BR', 'fun')).toMatchObject({ name: 'Resenha' });
    expect(translateOnlineMode('en', 'fun')).toMatchObject({ name: '4FUN' });
    expect(translateOnlineMode('es', 'fun')).toMatchObject({ name: 'De Chill' });
    expect(translateOnlineMode('pt-BR', 'max_fun')).toMatchObject({ name: 'Resenha Máxima' });
    expect(translateOnlineMode('en', 'max_fun')).toMatchObject({ name: 'Maximum Banter' });
    expect(translateOnlineMode('es', 'max_fun')).toMatchObject({ name: 'Locura Máxima' });

    for (const language of ['pt-BR', 'en', 'es'] as const) {
      for (const mode of ['premier', 'faceit', 'pro', 'fun', 'max_fun'] as const) {
        const presentation = translateOnlineMode(language, mode);
        expect(presentation.name.length).toBeGreaterThan(0);
        expect(presentation.description.length).toBeGreaterThan(20);
      }
    }
  });

  it('renders AVG for fun offers and adds the localized mode beside MULTIPLAYER on the final card', () => {
    expect(onlinePageSource).toContain('`AVG ${offeredTeamAverage?.toFixed(1)');
    expect(onlinePageSource).toContain("contextTags={['MULTIPLAYER', currentModePresentation.name]}");
  });
});
