<script lang="ts">
  import { getCatalogContext } from '$lib/game/catalogContext';
  import { playerTitle } from '$lib/game/data';
  import { translateTitle } from '$lib/game/i18n';
  import { showsFullIntel } from '$lib/game/teamViews';
  import type { GameMode, Language, Player } from '$lib/game/types';
  import CountryFlag from './CountryFlag.svelte';
  import PlayerAvatar from './PlayerAvatar.svelte';

  export let player: Player;
  export let mode: GameMode = 'premier';
  export let revealed = false;
  export let compact = false;
  export let blockedReason = '';
  export let language: Language = 'en';
  export let onOpen: (player: Player) => void = () => {};

  // Country comes from the page's catalog (core on /online: never a flag there); career world cards never resolve.
  const catalog = getCatalogContext();
  $: country = $catalog.playerCountry(player);
  $: showNumbers = showsFullIntel(mode) || revealed;
  $: rarity = (player.rarity ?? 'common').toLowerCase();
  $: showRarity = showsFullIntel(mode) || revealed;

  function openCard() {
    if (!blockedReason || window.matchMedia('(max-width: 679px)').matches) onOpen(player);
  }
</script>

<button
  type="button"
  class:compact
  class:blocked={Boolean(blockedReason)}
  class="player-card {showRarity ? `rarity-${rarity}` : 'rarity-hidden'}"
  on:click={openCard}
  aria-disabled={Boolean(blockedReason)}
  aria-label={`Abrir detalhes de ${player.nickname ?? 'jogador'}`}
>
  <span class="player-topline">
    <PlayerAvatar {player} />
    {#if player.id.startsWith('secret-')}<span class="secret-label">SECRET</span>{:else if showRarity}<span class="rarity-label">{rarity}</span>{/if}
  </span>
  <span class="player-name">{player.nickname ?? 'Unknown'}</span>
  <span class="player-title">{translateTitle(language, playerTitle(player))}</span>
  <span class="player-meta"><CountryFlag code={country} {language} /> {player.role ?? 'rifler'} · {player.year ?? '—'}</span>
  {#if blockedReason}<span class="blocked-badge">{blockedReason}</span>{/if}
  {#if showNumbers}
    <span class="overall"><small>OVR</small> {player.overall ?? 70}</span>
  {:else}
    <span class="overall hidden"><small>OVR</small> ??</span>
  {/if}
</button>
