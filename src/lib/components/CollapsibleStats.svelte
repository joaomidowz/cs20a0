<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Language } from '$lib/game/types';

  /** Heading of the panel; the body stays hidden until the player opens it. */
  export let title = '';
  export let eyebrow = '';
  export let open = false;
  export let language: Language = 'pt-BR';
  /** Optional id so callers can scroll to the panel after opening it. */
  export let id = '';

  /** Stable across SSR and hydration; each result screen renders only one statistics disclosure. */
  $: bodyId = id ? `${id}-body` : 'collapsible-stats-body';
  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<section class="collapsible-stats" class:open {id}>
  <header class="collapsible-header">
    <div class="collapsible-title">
      {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
      {#if title}<h2>{title}</h2>{/if}
    </div>
    <button class="secondary collapsible-toggle" type="button" aria-expanded={open} aria-controls={bodyId} on:click={() => open = !open}>
      <span aria-hidden="true" class="chevron">{open ? '−' : '+'}</span>{open ? t('hideStats') : t('showStats')}
    </button>
  </header>
  {#if open}
    <div class="collapsible-body" id={bodyId}><slot /></div>
  {/if}
</section>

<style>
  .collapsible-stats{margin-bottom:18px;border:1px solid var(--line);background:var(--surface)}
  .collapsible-stats.open{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
  .collapsible-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:14px 16px}
  .collapsible-title{display:grid;gap:4px;min-width:0}
  .collapsible-title h2{margin:0;font-size:1.5rem}
  .collapsible-toggle{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;white-space:nowrap}
  .chevron{display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid currentColor;font:900 .9rem/1 Inter,Arial,sans-serif}
  .collapsible-body{padding:0 16px 16px;border-top:1px solid var(--line);padding-top:16px}
  @media (max-width:679px){.collapsible-header{padding:12px}.collapsible-toggle{width:100%;justify-content:center}.collapsible-body{padding:12px}}
</style>
