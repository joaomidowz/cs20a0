<script lang="ts">
  import { playerById, teamById } from '$lib/game/data';
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { GameMode, OrgStyle, Player, SelectedPlayer } from '$lib/game/types';

  export let selectedPlayers: SelectedPlayer[] = [];
  export let style: OrgStyle = 'balanced';
  export let styleLocked = false;
  export let styleLabel = '';
  export let mode: GameMode = 'premier';
  export let revealed = false;
  export let label = 'HUD da organização';
  export let onOpen: (player: Player) => void = () => {};

  $: lineup = selectedPlayers.map((selected) => ({ selected, player: playerById.get(selected.playerId) }));
</script>

<section class="hud panel">
  <div class="section-heading">
    <div>
      <span class="eyebrow">LINEUP / 05</span>
      <h2>{label}</h2>
    </div>
    <span class="counter">{selectedPlayers.length}/5</span>
  </div>

  <div class="hud-style" class:pending={!styleLocked}>
    <span>TACTICAL IDENTITY</span>
    <strong>{styleLocked ? styleLabel || style : '—'}</strong>
  </div>

  <div class="slots">
    {#each Array(5) as _, index}
      {@const item = lineup[index]}
      <button class:filled={Boolean(item?.player)} class="slot" type="button" disabled={!item?.player} on:click={() => item?.player && onOpen(item.player)}>
        {#if item?.player}
          {@const team = item.player.teamId ? teamById.get(item.player.teamId) : null}
          <span class="slot-index">0{index + 1}</span>
          <strong>{item.player.nickname ?? 'Unknown'}</strong>
          <small>{team?.name ?? 'Time'} · {item.player.year ?? '—'}</small>
          <span class="slot-title">{getRoleLabel(item.selected.selectedSlotRole)}</span>
          {#if mode === 'premier' || revealed}<b>{item.player.overall ?? 70}</b>{:else}<b>??</b>{/if}
        {:else}
          <span class="slot-index">0{index + 1}</span>
          <strong class="question">?</strong>
          <small>OPEN</small>
        {/if}
      </button>
    {/each}
  </div>
</section>
