<script lang="ts">
  import MiniCard from './MiniCard.svelte';
  import CollectionCardSheet from './CollectionCardSheet.svelte';
  import { collectionPlayerById, collectionTeamById } from '$lib/game/online/collection-pool';
  import { translateOnline } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';
  /** A card inside a trade: the mini card, and the big sheet on tap (players only; coaches have no sheet). */
  export let id: string;
  export let language: Language;
  export let label = '';
  let expanded = false;
  $: player = collectionPlayerById.get(id);
  $: teamName = collectionTeamById.get(player?.teamId ?? '')?.name ?? '';
  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline(language, key);
</script>
<MiniCard {id} {label} onClick={player ? () => (expanded = true) : null} />
{#if expanded && player}
  <CollectionCardSheet {player} {teamName} {language} labels={{ close: t('close'), attributes: t('sheetAttributes'), roles: t('sheetRoles'), awards: t('sheetAwards'), value: t('sheetValue'), sell: t('sell'), coins: t('coins') }} onClose={() => expanded = false} />
{/if}
