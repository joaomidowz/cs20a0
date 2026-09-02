<script lang="ts">
  import { players, teamById, teams } from '$lib/game/data';
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { LineupSlotRole, Player } from '$lib/game/types';

  export let open = false;
  export let slotIndex = 0;
  export let onPick: (player: Player, role: LineupSlotRole) => void = () => {};
  export let onClose: () => void = () => {};

  const roles: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  let organizationSearch = '';
  let playerSearch = '';
  let organizationFilterId = '';

  $: matchingOrganizations = teams
    .filter((team) => `${team.name ?? ''} ${team.year ?? ''}`.toLowerCase().includes(organizationSearch.trim().toLowerCase()))
    .slice(0, 14);
  $: matchingPlayers = players
    .filter((player) => !organizationFilterId || player.teamId === organizationFilterId)
    .filter((player) => {
      const query = playerSearch.trim().toLowerCase();
      const team = player.teamId ? teamById.get(player.teamId) : null;
      return !query || `${player.nickname ?? ''} ${team?.name ?? ''} ${player.year ?? ''}`.toLowerCase().includes(query);
    })
    .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0) || left.id.localeCompare(right.id))
    .slice(0, 80);
</script>

{#if open}
  <div class="picker-backdrop" role="presentation" on:click={onClose}>
    <div class="player-picker" role="dialog" aria-modal="true" aria-labelledby="sandbox-picker-title" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      <header><div><span class="eyebrow">SANDBOX · SLOT {slotIndex + 1}</span><h2 id="sandbox-picker-title">Trocar jogador</h2></div><button class="close" on:click={onClose} aria-label="Fechar">×</button></header>
      <div class="picker-tools">
        <label><span>Filtrar por time</span><input bind:value={organizationSearch} placeholder="Astralis 2018" /></label>
        <label><span>Filtrar por jogador</span><input bind:value={playerSearch} placeholder="s1mple" /></label>
      </div>
      <nav aria-label="Times históricos"><button class:active={!organizationFilterId} on:click={() => organizationFilterId = ''}>Todos</button>{#each matchingOrganizations as team}<button class:active={organizationFilterId === team.id} on:click={() => organizationFilterId = team.id}>{team.name} <small>{team.year}</small></button>{/each}</nav>
      <div class="picker-results">
        {#each matchingPlayers as player}
          <article>
            <div class="identity"><span>{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</span><div><strong>{player.nickname}</strong><small>{teamById.get(player.teamId ?? '')?.name} · {player.year}</small></div><b>{player.overall ?? 70}</b></div>
            <div class="role-actions">{#each roles as role}<button on:click={() => onPick(player, role)}>{getRoleLabel(role)}</button>{/each}</div>
          </article>
        {:else}<p>Nenhum jogador encontrado.</p>{/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .picker-backdrop{position:fixed;z-index:150;inset:0;display:grid;place-items:center;padding:18px;background:rgb(2 4 6 / 84%);backdrop-filter:blur(9px)}.player-picker{display:grid;grid-template-rows:auto auto auto minmax(0,1fr);width:min(960px,100%);max-height:90dvh;border:1px solid #d8aa45;background:var(--surface);box-shadow:0 28px 90px rgb(0 0 0 / 60%);overflow:hidden}.player-picker>header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line)}h2{margin:4px 0 0;font-size:clamp(2rem,6vw,3.5rem)}.close{width:42px;height:42px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);font-size:1.5rem}.picker-tools{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 20px}label{display:grid;gap:6px}label span{color:var(--muted);font-size:.58rem;font-weight:900;text-transform:uppercase}input{min-height:44px;padding:0 11px;border:1px solid var(--line);color:var(--text);background:var(--surface-2)}nav{display:flex;gap:6px;padding:10px 20px;border-block:1px solid var(--line);overflow-x:auto}nav button,.role-actions button{min-height:34px;padding:0 10px;border:1px solid var(--line);color:var(--muted);background:var(--surface-2);white-space:nowrap}nav button.active{border-color:#d8aa45;color:#e6bd62}.picker-results{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 20px 20px;overflow-y:auto}.picker-results article{padding:12px;border:1px solid var(--line);background:var(--surface-2)}.identity{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px}.identity>span{display:grid;place-items:center;width:42px;height:42px;color:#171005;background:#d8aa45;font-weight:900}.identity strong,.identity small{display:block}.identity small{color:var(--muted)}.identity b{font-size:1.6rem}.role-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.role-actions button{border-color:color-mix(in srgb,#d8aa45 50%,var(--line));color:#e6bd62;cursor:pointer}.eyebrow{color:#e6bd62}
  @media(max-width:679px){.picker-backdrop{place-items:end center;padding:0}.player-picker{max-height:94dvh}.picker-tools,.picker-results{grid-template-columns:1fr}.player-picker>header,.picker-tools,nav,.picker-results{padding-inline:12px}}
</style>
