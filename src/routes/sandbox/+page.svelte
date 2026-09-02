<script lang="ts">
  import { onDestroy } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SandboxPlayerPicker from '$lib/components/SandboxPlayerPicker.svelte';
  import { getTeamPlayers, playerById, teamById, teams } from '$lib/game/data';
  import { getDefaultMapSelection, getLineupMapContributors, getLineupMapYears, getMapFamiliarity, getMapName, MAP_POOL } from '$lib/game/maps';
  import { language, theme } from '$lib/game/pageState';
  import { getEligibleSlotRoles, getRoleLabel } from '$lib/game/roleRules';
  import { advanceSandboxMajor, createSandboxMajor } from '$lib/game/sandbox/major';
  import { validateSandboxLineup } from '$lib/game/sandbox/lineup';
  import type { SandboxLineupSelection, SandboxMajorState } from '$lib/game/sandbox/types';
  import type { LineupSlotRole, MapId, Player, SelectedPlayer } from '$lib/game/types';
  import '../../app.css';

  const roles: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const defaultOrganization = teams[0];
  const roster = getTeamPlayers(defaultOrganization ?? null).slice(0, 5);
  const initialPicks: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
  let selection: SandboxLineupSelection = {
    organizationId: defaultOrganization?.id ?? '',
    style: 'balanced',
    players: initialPicks,
    mapPreferences: getDefaultMapSelection(roster, teams)
  };
  let seed = 'sandbox-major';
  let simulationMode: 'automatic' | 'manual' = 'automatic';
  let major: SandboxMajorState | null = null;
  let timer: number | null = null;
  let editingSlot: number | null = null;

  $: selectedPlayers = selection.players.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
  $: contributors = getLineupMapContributors(selectedPlayers, teams);
  $: mapYears = getLineupMapYears(selectedPlayers, teams);
  $: validation = validateSandboxLineup(selection);
  $: currentMatch = major?.matches[major.currentMatchIndex] ?? null;
  $: botResults = major?.matches.filter((match) => match.resolved && !match.userMatch) ?? [];
  $: if (simulationMode === 'automatic' && currentMatch && !major?.finished) scheduleAdvance(currentMatch.id);

  onDestroy(() => { if (timer !== null) window.clearTimeout(timer); });

  function scheduleAdvance(matchId: string) {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (major?.matches[major.currentMatchIndex]?.id === matchId) major = advanceSandboxMajor(major);
    }, 1800);
  }

  function updateOrganization(organizationId: string) {
    const nextRoster = getTeamPlayers(teamById.get(organizationId) ?? null).slice(0, 5);
    selection = {
      ...selection,
      organizationId,
      players: nextRoster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' })),
      mapPreferences: getDefaultMapSelection(nextRoster, teams)
    };
  }

  function replacePlayer(index: number, player: Player, selectedSlotRole: LineupSlotRole) {
    selection = {
      ...selection,
      players: selection.players.map((pick, slot) => slot === index ? { playerId: player.id, selectedSlotRole } : pick)
    };
    editingSlot = null;
  }

  function updateRole(index: number, selectedSlotRole: LineupSlotRole) {
    selection = { ...selection, players: selection.players.map((pick, slot) => slot === index ? { ...pick, selectedSlotRole } : pick) };
  }

  function toggleMap(mapId: MapId) {
    const selected = selection.mapPreferences;
    if (selected.includes(mapId)) selection = { ...selection, mapPreferences: selected.filter((item) => item !== mapId) };
    else if (contributors[mapId].length > 0 && selected.length < 3) selection = { ...selection, mapPreferences: [...selected, mapId] };
  }

  function startMajor() {
    if (!validation.valid) return;
    major = createSandboxMajor(selection, seed);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function restart() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    major = null;
  }
</script>

<svelte:head><title>Sandbox · CS13a0</title></svelte:head>

<PageLayout language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'} wide>
  {#if !major}
    <header class="sandbox-header"><span class="eyebrow">SANDBOX LOCAL</span><h1>Monte o impossível.</h1><p>Combine cinco jogadores históricos, escolha três mapas conhecidos e simule um Major completo sem alterar sua campanha.</p></header>
    <section class="sandbox-setup panel">
      <label><span>Organização</span><select value={selection.organizationId} on:change={(event) => updateOrganization(event.currentTarget.value)}>{#each teams as team}<option value={team.id}>{team.name} · {team.year}</option>{/each}</select></label>
      <label><span>Estilo</span><select bind:value={selection.style}><option value="aggressive">Agressivo</option><option value="balanced">Equilibrado</option><option value="tactical">Tático</option></select></label>
      <label><span>Resultado</span><select bind:value={simulationMode}><option value="automatic">Automático</option><option value="manual">Manual</option></select></label>
      <label><span>Seed</span><input bind:value={seed} maxlength="48" /></label>
    </section>
    <section class="sandbox-roster">
      {#each selection.players as pick, index}
        {@const player = playerById.get(pick.playerId)}
        <article class="panel">
          <span class="eyebrow">Slot {index + 1}</span>
          <button class="sandbox-player-card" on:click={() => editingSlot = index}><span>{(player?.nickname ?? '?').slice(0, 2).toUpperCase()}</span><div><strong>{player?.nickname ?? 'Escolher jogador'}</strong><small>{teamById.get(player?.teamId ?? '')?.name ?? '—'} · {player?.year ?? '—'}</small></div><b>{player?.overall ?? '—'}</b></button>
          <select value={pick.selectedSlotRole} on:change={(event) => updateRole(index, event.currentTarget.value as LineupSlotRole)}>{#each roles as role}<option value={role}>{getRoleLabel(role)}</option>{/each}</select>
          {#if validation.errors[`players.${index}.playerId`] || validation.errors[`players.${index}.selectedSlotRole`]}<small class="error">{validation.errors[`players.${index}.playerId`] ?? validation.errors[`players.${index}.selectedSlotRole`]}</small>{/if}
        </article>
      {/each}
    </section>
    <section class="sandbox-maps">
      <header><div><span class="eyebrow">ACTIVE DUTY 2016–2026</span><h2>Três preferências</h2></div><strong>{selection.mapPreferences.length}/3</strong></header>
      <div class="sandbox-map-grid">
        {#each MAP_POOL as mapId}
          {@const count = contributors[mapId].length}
          <button class:selected={selection.mapPreferences.includes(mapId)} disabled={count === 0 || (!selection.mapPreferences.includes(mapId) && selection.mapPreferences.length >= 3)} on:click={() => toggleMap(mapId)}>
            <strong>{getMapName(mapId)}</strong><span>{getMapFamiliarity(count)}% · {count}/5</span><small>{mapYears[mapId].join(', ') || 'fora das épocas'}</small>
          </button>
        {/each}
      </div>
      {#if validation.errors.mapPreferences}<p class="error">{validation.errors.mapPreferences}</p>{/if}
    </section>
    <button class="primary sandbox-launch" disabled={!validation.valid} on:click={startMajor}>Criar Major</button>
  {:else}
    <header class="sandbox-major-header"><div><span class="eyebrow">MAJOR SANDBOX</span><h1>{major.userTeam.name}</h1></div><button class="secondary" on:click={restart}>Montar outro time</button></header>
    {#if botResults.length}<section class="panel"><span class="eyebrow">Resultados automáticos</span><div class="sandbox-results">{#each botResults.slice(-12) as match}<p><span>{match.teamA.name}</span><strong>{match.scoreA} : {match.scoreB}</strong><span>{match.teamB.name}</span></p>{/each}</div></section>{/if}
    {#if major.finished}
      <section class="panel sandbox-finished"><span class="eyebrow">FINAL</span><h2>Campeão: {major.championId}</h2><button class="primary" on:click={restart}>Novo Sandbox</button></section>
    {:else if currentMatch}
      <section class="panel sandbox-current">
        <header><span>{currentMatch.phase.toUpperCase()} · MD{currentMatch.bestOf}</span><h2>{currentMatch.teamA.name} <i>vs</i> {currentMatch.teamB.name}</h2><strong>{currentMatch.scoreA} : {currentMatch.scoreB}</strong></header>
        {#if currentMatch.veto}<ol class="sandbox-veto">{#each currentMatch.veto as step}<li class:ban={step.action === 'ban'}><small>{step.action}</small><b>{getMapName(step.mapId)}</b></li>{/each}</ol>{/if}
        <div class="sandbox-map-results">{#each currentMatch.maps as map}<article><span>{getMapName(map.mapId, map.map)}</span><strong>{map.scoreA} : {map.scoreB}</strong></article>{/each}</div>
        {#if simulationMode === 'manual'}<button class="primary" on:click={() => major = major ? advanceSandboxMajor(major) : major}>Confirmar resultado e avançar</button>{:else}<p class="automatic-note">Próximo resultado em instantes…</p>{/if}
      </section>
    {/if}
  {/if}
</PageLayout>

<SandboxPlayerPicker
  open={editingSlot !== null}
  slotIndex={editingSlot ?? 0}
  onPick={(player, role) => replacePlayer(editingSlot ?? 0, player, role)}
  onClose={() => editingSlot = null}
/>

<style>
  .sandbox-header { max-width: 760px; margin-bottom: 24px; } .sandbox-header h1 { margin: 8px 0; font-size: clamp(3rem,8vw,6rem); } .sandbox-header p { color: var(--muted); }
  .sandbox-setup { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; } label { display:grid; gap:6px; } label span { color:var(--muted); font-size:.6rem; font-weight:800; text-transform:uppercase; } select,input { min-width:0; min-height:44px; padding:0 10px; border:1px solid var(--line); color:var(--text); background:var(--surface-2); }
  .sandbox-roster { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; margin:12px 0; } .sandbox-roster article { display:grid; gap:8px; padding:12px; }
  .sandbox-player-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);text-align:left;cursor:pointer}.sandbox-player-card>span{display:grid;place-items:center;width:38px;height:38px;color:#171005;background:#d8aa45;font-weight:900}.sandbox-player-card strong,.sandbox-player-card small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sandbox-player-card small{color:var(--muted);font-size:.55rem}.sandbox-player-card b{font-size:1.4rem}
  .sandbox-maps { padding:18px; border:1px solid var(--line); background:var(--surface); } .sandbox-maps>header,.sandbox-major-header,.sandbox-current>header { display:flex; align-items:center; justify-content:space-between; gap:14px; } .sandbox-maps h2,.sandbox-major-header h1 { margin:4px 0; } .sandbox-maps>header>strong { color:var(--accent); font-size:1.8rem; }
  .sandbox-map-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:7px; margin-top:14px; } .sandbox-map-grid button { display:grid; gap:5px; padding:13px; border:1px solid var(--line); color:var(--text); background:var(--surface-2); text-align:left; cursor:pointer; } .sandbox-map-grid button.selected { border-color:var(--accent); box-shadow:inset 3px 0 var(--accent); } .sandbox-map-grid button:disabled { opacity:.38; cursor:not-allowed; } .sandbox-map-grid span,.sandbox-map-grid small { color:var(--muted); }
  .sandbox-launch { width:100%; min-height:54px; margin-top:14px; } .error { color:var(--danger); }
  .sandbox-results { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:6px; margin-top:10px; } .sandbox-results p { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; margin:0; padding:8px; background:var(--surface-2); } .sandbox-results span:last-child { text-align:right; }
  .sandbox-current { display:grid; gap:16px; margin-top:14px; } .sandbox-current h2 { margin:4px 0; } .sandbox-current i { color:var(--muted); font-style:normal; } .sandbox-current>header>strong { font-size:2rem; }
  .sandbox-veto { display:flex; gap:5px; margin:0; padding:0; overflow-x:auto; list-style:none; } .sandbox-veto li { min-width:110px; padding:8px; border:1px solid var(--accent); } .sandbox-veto li.ban { opacity:.4; border-color:var(--line); } .sandbox-veto small,.sandbox-veto b { display:block; text-transform:uppercase; }
  .sandbox-map-results { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; } .sandbox-map-results article { display:flex; justify-content:space-between; padding:12px; border:1px solid var(--line); background:var(--surface-2); } .automatic-note,.sandbox-finished { color:var(--muted); text-align:center; }
  @media(max-width:900px){.sandbox-setup{grid-template-columns:1fr 1fr}.sandbox-roster{grid-template-columns:1fr 1fr}} @media(max-width:560px){.sandbox-setup,.sandbox-roster{grid-template-columns:1fr}.sandbox-major-header,.sandbox-current>header{align-items:stretch;flex-direction:column}}
</style>
