<script lang="ts">
  import CollectionCard from './CollectionCard.svelte';
  import CoachCard from './CoachCard.svelte';
  import CollectionCardSheet from './CollectionCardSheet.svelte';
  import { collectionPlayerById, collectionCoachById, collectionTeamById } from '$lib/game/online/collection-pool';
  import { cardLabel } from '$lib/game/online/card-value';
  import { translateOnline } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';
  export let id: string;
  export let language: Language;
  let expanded = false;
  $: player = collectionPlayerById.get(id);
  $: coach = collectionCoachById.get(id);
  $: teamName = collectionTeamById.get(player?.teamId ?? coach?.teamId ?? '')?.name ?? '';
  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline(language, key);
</script>
<div class="trade-card">
  {#if coach}<CoachCard {coach} {teamName} />
  {:else if player}<CollectionCard {player} {teamName} {language} compact onOpen={() => expanded = true} />
  {:else}<span>{cardLabel(id)}</span>{/if}
</div>
{#if expanded && player}
  <CollectionCardSheet {player} {teamName} {language} labels={{ close: t('close'), attributes: t('sheetAttributes'), roles: t('sheetRoles'), awards: t('sheetAwards'), value: t('sheetValue'), sell: t('sell'), coins: t('coins') }} onClose={() => expanded = false} />
{/if}
<style>.trade-card { width:100%; max-width:200px; min-width:0; }</style>
