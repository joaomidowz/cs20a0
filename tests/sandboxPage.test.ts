import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  new URL('../src/routes/sandbox/+page.svelte', import.meta.url),
  'utf8'
);
const builderSource = readFileSync(
  new URL('../src/lib/components/SandboxLineupBuilder.svelte', import.meta.url),
  'utf8'
);
const pickerSource = readFileSync(
  new URL('../src/lib/components/SandboxPlayerPicker.svelte', import.meta.url),
  'utf8'
);
const majorViewSource = readFileSync(
  new URL('../src/lib/components/SandboxMajorView.svelte', import.meta.url),
  'utf8'
);

describe('Sandbox setup page', () => {
  it('owns an isolated setup-to-major flow without network or campaign state', () => {
    expect(routeSource).toContain("import '../../app.css'");
    expect(routeSource).toContain("let phase: 'setup' | 'major' = 'setup'");
    expect(routeSource).toContain('validateSandboxLineup(selection)');
    expect(routeSource).toContain("phase = 'major'");
    expect(routeSource).toContain("phase = 'setup'");
    expect(routeSource).toContain('createSandboxMajor(selection, seed)');
    expect(routeSource).toContain('$: currentMatch = majorState?.matches[majorState.currentMatchIndex] ?? null');
    expect(routeSource).not.toMatch(/\bfetch\s*\(|WebSocket|\bgame\.(?:set|update|subscribe)\b/);
  });

  it('starts from an organization roster and exposes all setup controls', () => {
    expect(routeSource).toContain('<PageLayout');
    expect(routeSource).toContain('<SandboxLineupBuilder');
    expect(routeSource).toContain("let simulationMode: SimulationMode = 'auto'");
    expect(routeSource).toContain('name="sandbox-seed"');
    expect(builderSource).toContain('getTeamPlayers');
    expect(builderSource).toContain('aria-label="Estilo de jogo"');
    expect(builderSource).toContain('aria-label="Ritmo do Major"');
  });

  it('renders five addressable lineup slots with player replacement and role selection', () => {
    expect(builderSource).toContain('SANDBOX_SLOT_COUNT = 5');
    expect(builderSource).toContain('data-testid={`sandbox-slot-${index + 1}`}');
    expect(builderSource).toContain('<SandboxPlayerPicker');
    expect(builderSource).toContain('errors[`players.${index}.playerId`]');
    expect(builderSource).toContain('errors[`players.${index}.selectedSlotRole`]');
    expect(pickerSource).toContain('name="organization-search"');
    expect(pickerSource).toContain('name="player-search"');
    expect(pickerSource).toContain('getEligibleSlotRoles');
    expect(pickerSource).toContain('Trocar jogador');
  });

  it('blocks invalid duplicate lineups and enters the local Major only when valid', () => {
    expect(routeSource).toContain('if (!validation.valid)');
    expect(routeSource).toContain('errors = validation.errors');
    expect(routeSource).toContain('majorState = createSandboxMajor(selection, seed)');
    expect(routeSource).toContain('{#if phase === \'setup\'}');
    expect(routeSource).toContain('{:else if majorState}');
  });

  it('connects the local Major view and does not reveal future scores', () => {
    expect(routeSource).toContain('<SandboxMajorView');
    expect(routeSource).toContain('advanceSandboxMajor(majorState)');
    expect(majorViewSource).toContain('visibleSeriesScore');
    expect(majorViewSource).toContain('{#if index < activeMapIndex}');
  });
});
