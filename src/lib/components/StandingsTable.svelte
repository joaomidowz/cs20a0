<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import TeamBadge from './TeamBadge.svelte';
  import type { MajorStanding } from '$lib/game/types';

  export let standings: MajorStanding[] = [];
  export let userTeamId = '';
  export let labels: { record: string; buchholz: string; active: string; qualified: string; eliminated: string; champion: string; runnerUp?: string; third?: string; fifth?: string; playoffs?: string };
  export let onTeam: (teamId: string) => void = () => {};

  let reducedMotion = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => reducedMotion = query.matches;
    query.addEventListener('change', updateMotion);
    return () => query.removeEventListener('change', updateMotion);
  });

  const statusLabel = (standing: MajorStanding) => {
    if (standing.placement === 'champion' || standing.status === 'champion') return labels.champion;
    if (standing.placement === 'runnerUp') return labels.runnerUp ?? '2º';
    if (standing.placement === '3to4') return labels.third ?? '3º–4º';
    if (standing.placement === '5to8') return labels.fifth ?? '5º–8º';
    if (standing.status === 'qualified') return labels.playoffs ?? labels.qualified;
    return standing.status === 'eliminated' ? labels.eliminated : labels.active;
  };
  /** Podium places share a rank ("3–4", "5–8") instead of pretending the table order decides them. */
  const rankLabel = (standing: MajorStanding, index: number) =>
    standing.placement === 'champion' ? '1' : standing.placement === 'runnerUp' ? '2' : standing.placement === '3to4' ? '3–4' : standing.placement === '5to8' ? '5–8' : String(index + 1);
</script>

<div class="standings-table" role="table">
  <div class="standings-head" role="row"><span></span><span>{labels.record}</span><span title={labels.buchholz}>BH</span><span></span></div>
  {#each standings as standing, index (standing.organizationId)}
    <div
      class="standings-row {standing.status} placement-{standing.placement ?? 'none'}"
      class:user={standing.organizationId === userTeamId}
      role="row"
      animate:flip={{ duration: reducedMotion ? 0 : 160, easing: cubicOut }}
      in:fly={{ y: reducedMotion ? 0 : 6, duration: reducedMotion ? 0 : 160, delay: reducedMotion ? 0 : Math.min(index, 7) * 18, easing: cubicOut }}
      out:fade={{ duration: reducedMotion ? 0 : 90 }}
    >
      <button type="button" class="standings-team" disabled={standing.organizationId === userTeamId} on:click={() => onTeam(standing.organizationId)}><span class="standings-rank">{rankLabel(standing, index)}</span><TeamBadge id={standing.organizationId} name={standing.name} highlight={standing.organizationId === userTeamId} /><span class="standings-name">{standing.name}</span></button>
      <b>{standing.wins}–{standing.losses}</b>
      <small>{standing.buchholz}</small>
      <em>{statusLabel(standing)}</em>
    </div>
  {/each}
</div>

<style>
  .standings-table{display:grid;gap:2px;min-width:0}
  .standings-head,.standings-row{display:grid;grid-template-columns:minmax(0,1fr) 44px 30px minmax(76px,max-content);align-items:center;gap:8px;min-height:36px;padding:2px 6px;border-bottom:1px solid var(--line)}
  .standings-head{min-height:26px;color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.standings-head span:nth-child(2),.standings-head span:nth-child(3){text-align:center}
  .standings-rank{color:var(--muted);font:900 .72rem 'Arial Narrow',Impact,sans-serif;white-space:nowrap}
  .standings-team{display:grid;grid-template-columns:22px auto minmax(0,1fr);align-items:center;gap:7px;min-width:0;padding:2px 0;border:0;color:var(--text);background:transparent;font:inherit;text-align:left;cursor:pointer}
  .standings-team:disabled{cursor:default;opacity:1}.standings-team:not(:disabled):hover span{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
  .standings-name{overflow:hidden;font-size:.7rem;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
  .standings-row b,.standings-row small,.standings-row em{display:flex;align-items:center;min-height:100%;line-height:1;white-space:nowrap}
  .standings-row b{justify-content:center;font:900 .95rem 'Arial Narrow',Impact,sans-serif}.standings-row small{justify-content:center;color:var(--muted);font-size:.62rem}
  .standings-row em{justify-content:flex-end;color:var(--muted);font-size:.5rem;font-style:normal;font-weight:900;letter-spacing:.08em;text-align:right;text-transform:uppercase}
  .standings-row.qualified em,.standings-row.champion em{color:var(--accent)}.standings-row.eliminated em{color:var(--danger)}.standings-row.eliminated .standings-team span{color:var(--muted)}
  .standings-row.placement-champion{background:color-mix(in srgb,#f5c542 14%,transparent)}.standings-row.placement-champion .standings-rank,.standings-row.placement-champion em{color:#f5c542}.standings-row.placement-champion .standings-team span{color:var(--text)}
  .standings-row.placement-runnerUp{background:color-mix(in srgb,#c9ced6 10%,transparent)}.standings-row.placement-runnerUp .standings-rank,.standings-row.placement-runnerUp em{color:#c9ced6}.standings-row.placement-runnerUp .standings-team span{color:var(--text)}
  .standings-row.placement-3to4 .standings-rank,.standings-row.placement-3to4 em{color:#d08a4a}.standings-row.placement-3to4 .standings-team span{color:var(--text)}
  .standings-row.placement-5to8 em{color:var(--muted)}.standings-row.placement-5to8 .standings-team span{color:var(--text)}
  .standings-row.user{background:color-mix(in srgb,var(--accent) 8%,transparent)}.standings-row.user .standings-team span{color:var(--accent)}
  @media(max-width:420px){
    .standings-head,.standings-row{grid-template-columns:minmax(38px,1fr) 32px 18px 58px;gap:3px;padding-inline:3px}
    .standings-team{display:block;overflow:hidden}.standings-team :global(.team-badge),.standings-rank{display:none}
    .standings-name{display:block;font-size:.62rem}
    .standings-row b{font-size:.84rem}.standings-row small{font-size:.55rem}.standings-row em{font-size:.42rem;letter-spacing:.04em}
  }
  @media(prefers-reduced-motion:reduce){.standings-row{scroll-behavior:auto}}
</style>
