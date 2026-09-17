<script lang="ts">
  import { getCatalogContext } from '$lib/game/catalogContext';
  import { playerTitle } from '$lib/game/data';
  import { translateTitle } from '$lib/game/i18n';
  import { getEligibleSlotRoles, getRoleLabel } from '$lib/game/roleRules';
  import { roleRelevantAttributes } from '$lib/game/teamViews';
  import type { Language, Player } from '$lib/game/types';
  import CountryFlag from './CountryFlag.svelte';
  import PlayerAvatar from './PlayerAvatar.svelte';
  import PlayerAwardsBadges from './PlayerAwardsBadges.svelte';

  export let player: Player;
  export let language: Language = 'en';
  export let showPlayerAwards = false;

  // Country comes from the page's catalog (core on /online: never a flag there); career world cards never resolve.
  const catalog = getCatalogContext();
  $: country = $catalog.playerCountry(player);
  $: eligibleRoles = getEligibleSlotRoles(player);
  $: attributes = roleRelevantAttributes(player);
  $: rarity = (player.rarity ?? 'common').toLowerCase();
</script>

<article class="player-mini-card rarity-{rarity}">
  <div class="mini-player-head">
    <PlayerAvatar {player} />
    <div>
      <span class="eyebrow"><CountryFlag code={country} {language} /> {player.rarity ?? 'common'} · {player.year ?? ''}</span>
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

