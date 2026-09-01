<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SandboxLineupBuilder from '$lib/components/SandboxLineupBuilder.svelte';
  import SandboxMajorView from '$lib/components/SandboxMajorView.svelte';
  import { getTeamPlayers, teams } from '$lib/game/data';
  import { language, theme } from '$lib/game/pageState';
  import type { SimulationMode } from '$lib/game/preferences';
  import { getEligibleSlotRoles, ROLE_LIMITS } from '$lib/game/roleRules';
  import { validateSandboxLineup } from '$lib/game/sandbox/lineup';
  import { advanceSandboxMajor, createSandboxMajor } from '$lib/game/sandbox/major';
  import type { SandboxLineupSelection, SandboxMajorState } from '$lib/game/sandbox/types';
  import type { LineupSlotRole, SelectedPlayer } from '$lib/game/types';
  import '../../app.css';

  const rolePreference: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const defaultOrganization = teams[0];

  function rosterForDefaultOrganization(): SelectedPlayer[] {
    const counts = new Map<LineupSlotRole, number>();
    return getTeamPlayers(defaultOrganization ?? null).slice(0, 5).map((player) => {
      const eligible = getEligibleSlotRoles(player);
      const selectedSlotRole = rolePreference.find((role) => eligible.includes(role) && (counts.get(role) ?? 0) < ROLE_LIMITS[role])
        ?? eligible.find((role) => (counts.get(role) ?? 0) < ROLE_LIMITS[role])
        ?? 'rifler';
      counts.set(selectedSlotRole, (counts.get(selectedSlotRole) ?? 0) + 1);
      return { playerId: player.id, selectedSlotRole };
    });
  }

  function initialSelection(): SandboxLineupSelection {
    return {
      organizationId: defaultOrganization?.id ?? '',
      style: 'balanced',
      players: rosterForDefaultOrganization()
    };
  }

  let phase: 'setup' | 'major' = 'setup';
  let selection = initialSelection();
  let errors: Record<string, string> = {};
  let seed = 'sandbox-major';
  let simulationMode: SimulationMode = 'auto';
  let majorState: SandboxMajorState | null = null;

  $: currentMatch = majorState?.matches[majorState.currentMatchIndex] ?? null;

  function updateSelection(next: SandboxLineupSelection) {
    selection = {
      ...next,
      players: next.players.map((player) => ({ ...player }))
    };
    errors = validateSandboxLineup(selection).errors;
  }

  function randomizeSeed() {
    seed = Math.random().toString(36).slice(2, 9);
  }

  function startMajor() {
    const validation = validateSandboxLineup(selection);
    if (!validation.valid) {
      errors = validation.errors;
      return;
    }
    errors = {};
    majorState = createSandboxMajor(selection, seed);
    phase = 'major';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function restartSandbox() {
    phase = 'setup';
    majorState = null;
    errors = {};
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function advanceMajor() {
    if (!majorState) return;
    majorState = advanceSandboxMajor(majorState);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

<svelte:head>
  <title>Sandbox · CS13a0</title>
  <meta name="description" content="Monte qualquer escalação histórica e simule um Major local." />
</svelte:head>

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(nextLanguage) => $language = nextLanguage}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
  wide
>
  {#if phase === 'setup'}
    <header class="sandbox-hero">
      <div>
        <span class="sandbox-kicker"><i></i> Laboratório local</span>
        <h1>Monte o impossível.<br /><em>Simule o Major.</em></h1>
      </div>
      <p>Escolha uma camisa histórica, misture jogadores de qualquer era e assista apenas às partidas do seu Time A. Nada daqui altera sua campanha.</p>
    </header>

    <SandboxLineupBuilder
      {selection}
      {errors}
      {simulationMode}
      onChange={updateSelection}
      onSimulationMode={(mode) => simulationMode = mode}
    />

    <section class="launch-bench" aria-labelledby="sandbox-launch-title">
      <div>
        <span class="eyebrow">Sorteio reproduzível</span>
        <h2 id="sandbox-launch-title">Preparar chave</h2>
        <p>Os outros quinze times e todas as partidas serão sorteados e simulados localmente como no modo online.</p>
      </div>
      <label>
        <span>Seed do Major</span>
        <div class="seed-control">
          <input name="sandbox-seed" bind:value={seed} maxlength="48" autocomplete="off" />
          <button type="button" on:click={randomizeSeed}>Sortear</button>
        </div>
      </label>
      <div class="launch-action">
        <span>{simulationMode === 'auto' ? 'AUTOMÁTICO' : 'MANUAL'} · SIMULAR 10S/ROUND</span>
        <button class="sandbox-start" type="button" on:click={startMajor}>Criar Major</button>
      </div>
    </section>
  {:else if majorState}
    <SandboxMajorView
      state={majorState}
      mode={simulationMode}
      language={$language}
      theme={$theme}
      onAdvance={advanceMajor}
      onRestart={restartSandbox}
    />
  {/if}
</PageLayout>

<style>
  :global(html) { scroll-padding-top: 82px; }
  .sandbox-hero { display: grid; gap: 18px; align-items: end; margin-bottom: 30px; padding: 18px 0 28px; border-bottom: 1px solid var(--line); }
  .sandbox-kicker { display: inline-flex; align-items: center; gap: 9px; color: #e6bd62; font-size: .67rem; font-weight: 900; letter-spacing: .17em; text-transform: uppercase; }
  .sandbox-kicker i { width: 9px; height: 9px; background: #d8aa45; box-shadow: 0 0 16px rgb(216 170 69 / 70%); transform: rotate(45deg); }
  .sandbox-hero h1 { margin: 14px 0 0; font-size: clamp(3.15rem, 9vw, 7rem); }
  .sandbox-hero h1 em { color: #d8aa45; font: inherit; }
  .sandbox-hero > p { max-width: 530px; margin: 0; color: var(--muted); font-size: .98rem; line-height: 1.65; }
  .launch-bench { display: grid; gap: 18px; align-items: end; margin-top: 18px; padding: 22px; border: 1px solid #80672e; background: linear-gradient(105deg, color-mix(in srgb, #d8aa45 8%, var(--surface)), var(--surface)); }
  .launch-bench h2 { margin: 6px 0 8px; font-size: 2.2rem; }
  .launch-bench p { max-width: 520px; margin: 0; color: var(--muted); font-size: .76rem; line-height: 1.55; }
  .launch-bench label { display: grid; gap: 7px; }
  .launch-bench label > span, .launch-action > span { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .seed-control { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .seed-control input { min-width: 0; min-height: 48px; padding: 0 12px; border: 1px solid var(--line); border-radius: 0; color: var(--text); background: var(--surface-2); font: 700 .85rem ui-monospace, monospace; }
  .seed-control button { padding: 0 14px; border: 1px solid var(--line); border-left: 0; color: #e6bd62; background: var(--surface-2); font-size: .64rem; font-weight: 900; text-transform: uppercase; cursor: pointer; }
  .launch-action { display: grid; gap: 7px; }
  .sandbox-start { min-height: 50px; padding: 0 22px; border: 0; color: #171005; background: #d8aa45; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; box-shadow: 0 0 30px rgb(216 170 69 / 22%); }
  .sandbox-start:hover { background: #e6bd62; }

  @media (min-width: 860px) {
    .sandbox-hero { grid-template-columns: minmax(0, 1.15fr) minmax(320px, .55fr); }
    .launch-bench { grid-template-columns: minmax(0, 1.2fr) minmax(240px, .65fr) auto; }
  }
  @media (max-width: 620px) {
    .sandbox-hero { padding-top: 0; }
    .launch-bench { padding: 16px; }
    .sandbox-start { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sandbox-kicker i { box-shadow: none; }
    .sandbox-start { box-shadow: none; }
  }
</style>
