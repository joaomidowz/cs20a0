<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Language } from '$lib/game/types';

  export let remaining = 0;
  export let disabled = false;
  export let language: Language = 'pt-BR';
  export let onCall: () => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<button class="secondary timeout-button" type="button" disabled={disabled || remaining <= 0} on:click={onCall} title={t('tacticalTimeout')}>
  <span>⏸ {t('tacticalTimeout')}</span><small>{remaining} {t('timeoutsLeft')}</small>
</button>

<style>
  .timeout-button{display:inline-grid;gap:2px;min-height:48px;padding:8px 14px;text-align:left}.timeout-button span{font-size:.75rem}.timeout-button small{color:var(--muted);font-size:.55rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .timeout-button:disabled{opacity:.45}
</style>
