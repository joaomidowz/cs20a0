<script lang="ts">
  import { onMount } from 'svelte';
  import { translate } from '$lib/game/i18n';
  import { playGameSound } from '$lib/game/offlineAudio';
  import type { Language } from '$lib/game/types';

  export let roundNumber = 2;
  export let money: number | null = null;
  export let countdown = '';
  export let language: Language = 'pt-BR';
  export let onCall: (call: 'force' | 'eco') => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  // A decisão chegou: um chamado ao abrir e um tique por segundo nos últimos 3 s da contagem.
  onMount(() => playGameSound('attention'));
  let lastTickSecond = -1;
  $: {
    const seconds = Number.parseInt(countdown, 10);
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 3 && seconds !== lastTickSecond) { lastTickSecond = seconds; playGameSound('tick'); }
  }
</script>

<section class="decision-prompt panel" role="dialog" aria-live="assertive">
  <header><div><span class="eyebrow">{t('round')} {roundNumber}{#if money !== null} · ${money} {t('money')}{/if}</span><h2>{t('ecoCall')}</h2><p>{t('ecoCallHint')}</p></div>{#if countdown}<b class="countdown">{countdown}</b>{/if}</header>
  <div class="decision-options">
    <button class="primary option" type="button" on:click={() => onCall('force')}><strong>{t('ecoCallForce')}</strong><small>{t('ecoCallForceHint')}</small></button>
    <button class="secondary option" type="button" on:click={() => onCall('eco')}><strong>{t('ecoCallSave')}</strong><small>{t('ecoCallSaveHint')}</small></button>
  </div>
</section>

<style>
  .decision-prompt{display:grid;gap:14px;margin:0 0 14px;padding:18px;border-color:var(--accent-2);animation:promptIn 220ms var(--ease-out-strong) both}
  .decision-prompt header{display:flex;align-items:start;justify-content:space-between;gap:12px}.decision-prompt h2{margin:4px 0 0;font-size:1.5rem}.decision-prompt p{margin:6px 0 0;color:var(--muted);font-size:.8rem;line-height:1.4}
  .countdown{color:var(--accent-2);font:900 2rem 'Arial Narrow',Impact,sans-serif;font-variant-numeric:tabular-nums}
  .decision-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .option{display:grid;gap:4px;min-height:64px;padding:12px;text-align:left}.option strong{font-size:1rem;text-transform:uppercase}.option small{font-size:.66rem;font-weight:500;line-height:1.3;text-transform:none;opacity:.85}
  @keyframes promptIn{from{transform:translateY(30%) scale(.97);opacity:0}}
  @media (prefers-reduced-motion:reduce){.decision-prompt{animation:none}}
  @media(max-width:679px){.decision-prompt{gap:9px;margin-bottom:8px;padding:10px}.decision-prompt h2{font-size:1.1rem}.decision-prompt p{margin-top:3px;font-size:.69rem}.decision-options{grid-template-columns:1fr 1fr;gap:6px}.decision-options button{min-height:54px;padding:8px 10px}.decision-options button strong{font-size:.8rem}.decision-options button small{font-size:.64rem;line-height:1.25}}
</style>
