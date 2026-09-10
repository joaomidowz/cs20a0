<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Language, TimeoutTiming } from '$lib/game/types';

  export let remaining = 0;
  /** How a pause called now would be timed; 'window' lights the button up as the ideal moment. */
  export let timing: TimeoutTiming | null = null;
  export let disabled = false;
  export let language: Language = 'pt-BR';
  export let onCall: () => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<button class="secondary timeout-button" class:ideal={timing === 'window' && remaining > 0 && !disabled} type="button" disabled={disabled || remaining <= 0} on:click={onCall} title={t('timeoutWindowHint')}>
  <span>⏸ {t('tacticalTimeout')}</span><small>{remaining} {t('timeoutsLeft')}</small>
</button>

<style>
  .timeout-button{display:inline-grid;gap:2px;min-height:48px;padding:8px 14px;text-align:left}.timeout-button span{font-size:.75rem}.timeout-button small{color:var(--muted);font-size:.55rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .timeout-button:disabled{opacity:.45}
  /* The ideal window only tints the border, softly: same text and size, nothing that reads as a prediction of the next round. */
  .timeout-button.ideal{animation:idealPulse 1.6s ease-in-out infinite}
  @keyframes idealPulse{50%{border-color:color-mix(in srgb,var(--accent-2) 70%,var(--line))}}
  @media (prefers-reduced-motion:reduce){.timeout-button.ideal{animation:none}}
</style>
