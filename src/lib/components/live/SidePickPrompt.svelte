<script lang="ts">
  import { onMount } from 'svelte';
  import { translate } from '$lib/game/i18n';
  import { getMapName } from '$lib/game/maps';
  import { playGameSound } from '$lib/game/offlineAudio';
  import type { Language, MapId, MapSide } from '$lib/game/types';

  export let mapId: MapId | null = null;
  export let decider = false;
  export let countdown = '';
  export let language: Language = 'pt-BR';
  export let onPick: (side: MapSide) => void = () => {};

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
  <header><div><span class="eyebrow">{mapId ? getMapName(mapId) : t('map')}</span><h2>{t('pickSide')}</h2><p>{decider ? t('pickSideDecider') : t('pickSideHint')}</p></div>{#if countdown}<b class="countdown">{countdown}</b>{/if}</header>
  <div class="decision-options">
    <button class="primary" type="button" on:click={() => onPick('ct')}>{t('sideCt')}</button>
    <button class="secondary" type="button" on:click={() => onPick('t')}>{t('sideT')}</button>
  </div>
</section>

<style>
  .decision-prompt{display:grid;gap:14px;margin:0 0 14px;padding:18px;border-color:var(--accent);animation:promptIn 220ms var(--ease-out-strong) both}
  .decision-prompt header{display:flex;align-items:start;justify-content:space-between;gap:12px}.decision-prompt h2{margin:4px 0 0;font-size:1.5rem}.decision-prompt p{margin:6px 0 0;color:var(--muted);font-size:.8rem;line-height:1.4}
  .countdown{color:var(--accent);font:900 2rem 'Arial Narrow',Impact,sans-serif;font-variant-numeric:tabular-nums}
  .decision-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}.decision-options button{min-height:52px}
  @keyframes promptIn{from{transform:translateY(30%) scale(.97);opacity:0}}
  @media (prefers-reduced-motion:reduce){.decision-prompt{animation:none}}
  @media(max-width:520px){.decision-options{grid-template-columns:1fr}}
</style>
