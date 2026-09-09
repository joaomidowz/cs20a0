<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Language } from '$lib/game/types';

  export let roundNumber = 2;
  export let money: number | null = null;
  export let countdown = '';
  export let language: Language = 'pt-BR';
  export let onCall: (call: 'force' | 'eco') => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<section class="decision-prompt panel" role="dialog" aria-live="assertive">
  <header><div><span class="eyebrow">{t('round')} {roundNumber}{#if money !== null} · ${money} {t('money')}{/if}</span><h2>{t('ecoCall')}</h2><p>{t('ecoCallHint')}</p></div>{#if countdown}<b class="countdown">{countdown}</b>{/if}</header>
  <div class="decision-options">
    <button class="primary option" type="button" on:click={() => onCall('force')}><strong>{t('ecoCallForce')}</strong><small>{t('ecoCallForceHint')}</small></button>
    <button class="secondary option" type="button" on:click={() => onCall('eco')}><strong>{t('ecoCallSave')}</strong><small>{t('ecoCallSaveHint')}</small></button>
  </div>
</section>

<style>
  .decision-prompt{display:grid;gap:14px;margin:0 0 14px;padding:18px;border-color:var(--accent-2);animation:promptIn .25s ease-out}
  .decision-prompt header{display:flex;align-items:start;justify-content:space-between;gap:12px}.decision-prompt h2{margin:4px 0 0;font-size:1.5rem}.decision-prompt p{margin:6px 0 0;color:var(--muted);font-size:.8rem;line-height:1.4}
  .countdown{color:var(--accent-2);font:900 2rem 'Arial Narrow',Impact,sans-serif;font-variant-numeric:tabular-nums}
  .decision-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .option{display:grid;gap:4px;min-height:64px;padding:12px;text-align:left}.option strong{font-size:1rem;text-transform:uppercase}.option small{font-size:.66rem;font-weight:500;line-height:1.3;text-transform:none;opacity:.85}
  @keyframes promptIn{from{transform:translateY(6px);opacity:0}}
  @media(max-width:520px){.decision-options{grid-template-columns:1fr}}
</style>
