<script lang="ts">
  import { collectionOrganizations } from '$lib/game/online/collection-pool';
  import type { TeamPackRarity } from '$lib/game/online/collection-rules';
  import PackSelect from './PackSelect.svelte';
  export let value: string;
  export let label: string;
  export let searchLabel: string;
  export let emptyLabel: string;
  export let rarityLabel: (rarity: TeamPackRarity) => string;
  export let disabled = false;
  $: options = collectionOrganizations.map((item) => ({ key: item.key, name: item.name, tone: item.rarity, caption: rarityLabel(item.rarity) }));
</script>

<PackSelect {options} {value} {label} {searchLabel} {emptyLabel} {disabled} onSelect={(key) => value = String(key)} />
