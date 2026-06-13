<script lang="ts">
  import { playerTitle } from '$lib/game/data';
  import type { GameMode, Player } from '$lib/game/types';

  export let player: Player;
  export let mode: GameMode = 'premier';
  export let revealed = false;
  export let compact = false;
  export let blockedReason = '';
  export let onOpen: (player: Player) => void = () => {};

  const initials = (player.nickname ?? '?').slice(0, 2).toUpperCase();
  $: showNumbers = mode === 'premier' || revealed;
  $: rarity = (player.rarity ?? 'common').toLowerCase();
</script>

<button
  type="button"
  class:compact
  class:blocked={Boolean(blockedReason)}
  class="player-card rarity-{rarity}"
  on:click={() => onOpen(player)}
  aria-label={`Abrir detalhes de ${player.nickname ?? 'jogador'}`}
>
  <span class="player-topline">
    <span class="avatar">{initials}</span>
    <span class="rarity-label">{rarity}</span>
  </span>
  <span class="player-name">{player.nickname ?? 'Unknown'}</span>
  <span class="player-title">{playerTitle(player)}</span>
  <span class="player-meta">{player.role ?? 'rifler'} · {player.year ?? '—'}</span>
  {#if blockedReason}<span class="blocked-badge">{blockedReason}</span>{/if}
  {#if showNumbers}
    <span class="overall"><small>OVR</small> {player.overall ?? 70}</span>
  {:else}
    <span class="overall hidden"><small>OVR</small> ??</span>
  {/if}
</button>
