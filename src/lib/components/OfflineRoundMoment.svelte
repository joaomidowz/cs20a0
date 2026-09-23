<script lang="ts">
  import RoundFlash from './live/RoundFlash.svelte';
  import { createOfflineMomentTracker } from '$lib/game/offlinePresentation';
  import { playGameSound } from '$lib/game/offlineAudio';
  import type { RoundFlash as Moment } from '$lib/game/roundPresentation';
  import type { Language, RoundDetail } from '$lib/game/types';
  export let seriesId: string;
  export let map: number;
  export let round: number;
  export let detail: RoundDetail | null;
  export let language: Language;
  export let userIsA: boolean | null;
  const track = createOfflineMomentTracker();
  let lastCursor = '';
  let moment: Moment | null = null;
  $: observe(seriesId, map, round, detail, language);
  $: mine = moment && userIsA !== null && (moment.side === 'a') === userIsA;

  function observe(id: string, mapIndex: number, roundNumber: number, committed: RoundDetail | null, lang: Language) {
    const cursor = `${id}:${mapIndex}:${roundNumber}`;
    if (cursor === lastCursor) return;
    lastCursor = cursor;
    moment = track(id, mapIndex, roundNumber, committed, lang);
    if (moment?.kind === 'ace' || moment?.kind === 'clutch' || moment?.kind === 'comeback') playGameSound(moment.kind);
  }
</script>

<div class="offline-moment-space">
  {#if moment}
    {#key lastCursor}
      <div class="offline-moment {moment.kind}" class:mine role="status">
        <span class="emblem" aria-hidden="true">{moment.kind === 'ace' ? '5' : moment.kind === 'clutch' ? '1' : '↗'}</span>
        <div><strong>{moment.title}</strong><span class="performer">{moment.subtitle}</span></div>
        {#if moment.kind === 'ace'}<div class="ace-marks" aria-hidden="true">{#each Array(5) as _, index}<i style={`--delay:${index * 70}ms`}></i>{/each}</div>{/if}
      </div>
    {/key}
  {:else}
    <RoundFlash {detail} {language} {userIsA} cursor={lastCursor} />
  {/if}
</div>

<style>
  .offline-moment-space { min-height: 76px; display: grid; align-items: center; }
  .offline-moment { --moment-color: var(--accent-2); position: relative; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 10px 18px; overflow: hidden; color: var(--text); background: color-mix(in srgb,var(--moment-color) 10%,var(--surface)); border: 1px solid var(--moment-color); animation: moment-enter .45s cubic-bezier(.16,1,.3,1); }
  .offline-moment.mine { --moment-color: var(--accent); }
  .emblem { font: 900 2.6rem/1 'Arial Narrow',Impact,sans-serif; color: var(--moment-color); }
  strong { display: block; font-size: 1.25rem; color: var(--moment-color); }
  .performer { display: block; margin-top: 4px; font-size: .8rem; overflow-wrap: anywhere; }
  .offline-moment > div { min-width: 0; }
  .clutch .emblem { animation: clutch-lock .6s ease-out; }
  .comeback .emblem { animation: comeback-rise .45s ease-out; }
  .ace-marks { display: flex; gap: 3px; }.ace-marks i { width: 5px; height: 24px; background: var(--moment-color); animation: ace-mark .35s ease-out backwards; animation-delay: var(--delay); }
  @keyframes moment-enter { from { transform: translateY(8px); opacity: .3; } }
  @keyframes clutch-lock { from { transform: scale(1.25); } }
  @keyframes comeback-rise { from { transform: translateY(12px); } }
  @keyframes ace-mark { from { transform: scaleY(.1); opacity: .3; } }
  @media (prefers-reduced-motion: reduce) { .offline-moment,.clutch .emblem,.comeback .emblem,.ace-marks i { animation: none; } }
  @media (max-width: 420px) { .offline-moment { padding: 10px; gap: 10px; } strong { font-size: 1.1rem; } .performer { font-size: .73rem; } }
</style>
