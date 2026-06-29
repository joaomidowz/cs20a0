<script lang="ts">
  import { playerAwardLabels } from '$lib/game/teamViews';
  import type { Player } from '$lib/game/types';

  export let player: Player;
  export let compact = false;

  $: awards = playerAwardLabels(player);
</script>

{#if awards.length}
  <div class:compact class="player-awards" aria-label="Player awards">
    {#each awards.slice(0, compact ? 3 : 6) as award}
      <span>{award}</span>
    {/each}
    {#if awards.length > (compact ? 3 : 6)}<span>+{awards.length - (compact ? 3 : 6)}</span>{/if}
  </div>
{/if}

