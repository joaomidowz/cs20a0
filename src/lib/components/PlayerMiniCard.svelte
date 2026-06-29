<script lang="ts">
  import { playerTitle } from '$lib/game/data';
  import { translateTitle } from '$lib/game/i18n';
  import { getEligibleSlotRoles, getRoleLabel } from '$lib/game/roleRules';
  import { roleRelevantAttributes } from '$lib/game/teamViews';
  import type { Language, Player } from '$lib/game/types';
  import PlayerAwardsBadges from './PlayerAwardsBadges.svelte';

  export let player: Player;
  export let language: Language = 'en';
  export let showPlayerAwards = false;

  $: eligibleRoles = getEligibleSlotRoles(player);
  $: attributes = roleRelevantAttributes(player);
  $: rarity = (player.rarity ?? 'common').toLowerCase();
</script>

<article class="player-mini-card rarity-{rarity}">
  <div class="mini-player-head">
    <span class="avatar">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</span>
    <div>
      <span class="eyebrow">{player.rarity ?? 'common'} · {player.year ?? ''}</span>
      <h3>{player.nickname ?? 'Unknown'}</h3>
      <p>{translateTitle(language, playerTitle(player))} · {player.role ?? 'rifler'}</p>
    </div>
    <strong>{player.overall ?? 70}</strong>
  </div>

  <div class="mini-role-line">
    {#each eligibleRoles as role}<span>{getRoleLabel(role)}</span>{/each}
  </div>

  <div class="mini-attributes">
    {#each attributes as attribute}
      <span><small>{attribute.key}</small><b>{attribute.value}</b></span>
    {/each}
  </div>

  {#if showPlayerAwards}
    <PlayerAwardsBadges {player} compact />
  {/if}
</article>

