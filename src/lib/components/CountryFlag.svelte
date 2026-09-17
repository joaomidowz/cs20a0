<script lang="ts">
  import type { Language } from '$lib/game/types';
  import { countryName, isFlagCode } from '$lib/game/visuals/flags';

  /** flag-icons code (`br`, `gb-eng`); anything else renders nothing. */
  export let code: string | null | undefined = null;
  /** Country name for `alt`/`title`; derived from the code in the UI language when omitted. */
  export let label: string | null = null;
  export let language: Language = 'en';
  export let size: 'sm' | 'md' = 'sm';

  // Flags are the self-hosted flag-icons SVGs copied by `npm run sync:flags` for the codes the identities use.
  $: valid = isFlagCode(code);
  $: name = label ?? (valid && code ? countryName(code, language) : '');
  $: width = size === 'md' ? 24 : 20;
  $: height = size === 'md' ? 18 : 15;
</script>

{#if valid && code}
  <img class="country-flag {size}" src={`/flags/${code}.svg`} alt={name} title={name} {width} {height} loading="lazy" decoding="async" />
{/if}

<style>
  .country-flag{display:inline-block;flex:0 0 auto;width:20px;height:15px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);object-fit:cover;vertical-align:middle}
  .country-flag.md{width:24px;height:18px}
</style>
