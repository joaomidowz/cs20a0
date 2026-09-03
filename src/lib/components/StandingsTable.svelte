<script lang="ts">
  import TeamBadge from './TeamBadge.svelte';
  import type { MajorStanding } from '$lib/game/types';

  export let standings: MajorStanding[] = [];
  export let userTeamId = '';
  export let labels: { record: string; buchholz: string; active: string; qualified: string; eliminated: string; champion: string };
  export let onTeam: (teamId: string) => void = () => {};

  const statusLabel = (status: MajorStanding['status']) => (status === 'champion' ? labels.champion : status === 'qualified' ? labels.qualified : status === 'eliminated' ? labels.eliminated : labels.active);
</script>

<div class="standings-table" role="table">
  <div class="standings-head" role="row"><span>#</span><span></span><span>{labels.record}</span><span title={labels.buchholz}>BH</span><span></span></div>
  {#each standings as standing, index (standing.organizationId)}
    <div class="standings-row {standing.status}" class:user={standing.organizationId === userTeamId} role="row">
      <span class="standings-rank">{index + 1}</span>
      <button type="button" class="standings-team" disabled={standing.organizationId === userTeamId} on:click={() => onTeam(standing.organizationId)}><TeamBadge id={standing.organizationId} name={standing.name} highlight={standing.organizationId === userTeamId} /><span>{standing.name}</span></button>
      <b>{standing.wins}–{standing.losses}</b>
      <small>{standing.buchholz}</small>
      <em>{statusLabel(standing.status)}</em>
    </div>
  {/each}
</div>

<style>
  .standings-table{display:grid;gap:2px;min-width:0}
  .standings-head,.standings-row{display:grid;grid-template-columns:22px minmax(0,1fr) 44px 30px auto;align-items:center;gap:8px;min-height:36px;padding:2px 6px;border-bottom:1px solid var(--line)}
  .standings-head{min-height:26px;color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.standings-head span:nth-child(3),.standings-head span:nth-child(4){text-align:center}
  .standings-rank{color:var(--muted);font:900 .8rem 'Arial Narrow',Impact,sans-serif}
  .standings-team{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;min-width:0;padding:2px 0;border:0;color:var(--text);background:transparent;font:inherit;text-align:left;cursor:pointer}
  .standings-team:disabled{cursor:default;opacity:1}.standings-team:not(:disabled):hover span{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
  .standings-team span{overflow:hidden;font-size:.7rem;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
  .standings-row b{font:900 .95rem 'Arial Narrow',Impact,sans-serif;text-align:center}.standings-row small{color:var(--muted);font-size:.62rem;text-align:center}
  .standings-row em{color:var(--muted);font-size:.5rem;font-style:normal;font-weight:900;letter-spacing:.08em;text-align:right;text-transform:uppercase}
  .standings-row.qualified em,.standings-row.champion em{color:var(--accent)}.standings-row.eliminated em{color:var(--danger)}.standings-row.eliminated .standings-team span{color:var(--muted)}
  .standings-row.user{background:color-mix(in srgb,var(--accent) 8%,transparent)}.standings-row.user .standings-team span{color:var(--accent)}
  @media(max-width:420px){.standings-head,.standings-row{grid-template-columns:20px minmax(0,1fr) 40px 26px auto;gap:6px}.standings-row em{font-size:.45rem}}
</style>
