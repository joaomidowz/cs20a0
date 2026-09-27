<script lang="ts">
  import { getRoundFlash } from '$lib/game/roundPresentation';
  import type { Language, RoundDetail } from '$lib/game/types';

  /** Round that just committed; null keeps the strip empty (its height is always reserved). */
  export let detail: RoundDetail | null = null;
  export let language: Language = 'pt-BR';
  /** Whether team A is the viewer's team; null paints every feat neutrally. */
  export let userIsA: boolean | null = null;
  /** Playback identity (series/map/round), so equal round numbers on different maps still replay the animation. */
  export let cursor = '';

  $: flash = detail ? getRoundFlash(language, detail) : null;
  $: featSide = flash?.side ?? null;
  $: mine = userIsA !== null && featSide !== null && (featSide === 'a') === userIsA;
  $: big = flash?.kind === 'ace' || flash?.kind === 'clutch';
</script>

<div class="round-flash" role="status" aria-live="polite">
  {#key `${cursor}:${detail?.number ?? 0}`}
    {#if flash}
      <strong class="flash {flash.kind}" class:mine class:big>
        <b>{flash.title}</b>
        {#if flash.subtitle}<span>{flash.subtitle}</span>{/if}
      </strong>
    {/if}
  {/key}
</div>

<style>
  /* Fixed footprint: the strip keeps its height whether or not a round has something to flash. */
  .round-flash{display:flex;align-items:center;justify-content:center;min-height:44px;overflow:hidden}
  .flash{display:inline-flex;align-items:center;gap:10px;max-width:100%;padding:7px 16px;border:1px solid var(--accent-2);background:color-mix(in srgb,var(--accent-2) 12%,var(--surface-2));color:var(--accent-2);font:900 .82rem/1 'Arial Narrow',Impact,sans-serif;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;animation:flashIn var(--dur-ui) var(--ease-out-strong) both,flashOut .4s var(--ease-out-soft) 1.8s forwards}
  /* Momentos grandes (ace/clutch) ficam um pouco mais: entrada 260 ms e permanência ~2,2 s. */
  .flash.big{animation:flashIn .26s var(--ease-out-strong) both,flashOut .4s var(--ease-out-soft) 2.46s forwards}
  .flash b{font-weight:900}.flash span{overflow:hidden;color:var(--text);font-size:.7rem;letter-spacing:.1em;text-overflow:ellipsis}
  .flash.big{padding:8px 20px;font-size:1rem;background:var(--accent-2);color:var(--bg);box-shadow:0 0 22px color-mix(in srgb,var(--accent-2) 55%,transparent)}.flash.big span{color:var(--bg)}
  .flash.comeback,.flash.streak-break{border-color:var(--text);background:color-mix(in srgb,var(--text) 8%,var(--surface-2));color:var(--text)}
  .flash.mine{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));color:var(--accent)}
  .flash.mine.big{background:var(--accent);color:var(--bg);box-shadow:0 0 22px color-mix(in srgb,var(--accent) 55%,transparent)}
  @keyframes flashIn{from{transform:translateY(20%) scale(.96);opacity:0}}
  @keyframes flashOut{to{transform:translateY(-15%);opacity:0}}
  /* Movimento reduzido: só opacidade, mesma permanência. */
  @keyframes flashFadeIn{from{opacity:0}}
  @keyframes flashFadeOut{to{opacity:0}}
  @media (prefers-reduced-motion:reduce){.flash,.flash.big{animation:flashFadeIn var(--dur-ui) linear both,flashFadeOut .4s linear 1.8s forwards}}
  @media(max-width:620px){.flash{padding:6px 12px;font-size:.74rem}.flash.big{font-size:.88rem}}
</style>
