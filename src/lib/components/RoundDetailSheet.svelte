<script lang="ts">
  import { onMount } from 'svelte';
  import { translate } from '$lib/game/i18n';
  import type { Language } from '$lib/game/types';
  import RoundDetailContent from './RoundDetailContent.svelte';
  import type { RoundInspection } from './round-inspection';

  export let inspection: RoundInspection;
  export let trigger: HTMLElement | null = null;
  export let userIsA: boolean | null = null;
  export let language: Language = 'pt-BR';
  export let teamNames: { a: string; b: string } = { a: 'A', b: 'B' };
  export let onClose: () => void = () => {};

  let panel: HTMLElement;

  $: title = language === 'en' ? `Round ${inspection.number}` : language === 'es' ? `Ronda ${inspection.number}` : `Round ${inspection.number}`;

  onMount(() => {
    document.body.classList.add('modal-open');
    panel?.focus();
    return () => {
      document.body.classList.remove('modal-open');
      trigger?.focus();
    };
  });

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
</script>

<svelte:window on:keydown={keydown} />

<div class="round-sheet-backdrop" role="presentation" on:click|self={onClose}>
  <div class="round-sheet" role="dialog" aria-modal="true" aria-labelledby="round-sheet-title" tabindex="-1" bind:this={panel}>
    <div class="round-sheet-grip" aria-hidden="true"></div>
    <div class="round-sheet-bar">
      <h2 id="round-sheet-title">{title}</h2>
      <button type="button" aria-label={translate(language, 'close')} on:click={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
    <RoundDetailContent {inspection} {userIsA} {language} {teamNames} />
  </div>
</div>

<style>
  .round-sheet-backdrop{position:fixed;inset:0;z-index:130;display:grid;place-items:end center;background:rgb(4 6 8 / 72%);animation:sheet-backdrop-in .16s ease-out}.round-sheet{display:grid;gap:14px;width:min(520px,100%);max-height:min(78dvh,680px);padding:8px 16px calc(18px + env(safe-area-inset-bottom));border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));border-bottom:0;background:var(--surface);box-shadow:0 -18px 50px rgb(0 0 0 / 42%);overflow:auto;animation:round-sheet-in .24s var(--ease-out-strong)}.round-sheet:focus{outline:0}.round-sheet-grip{justify-self:center;width:42px;height:4px;border-radius:4px;background:var(--line)}.round-sheet-bar{display:flex;align-items:center;justify-content:space-between;gap:12px}.round-sheet-bar h2{margin:0;font-size:1.15rem}.round-sheet-bar button{display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--line);color:var(--muted);background:var(--surface-2);cursor:pointer}.round-sheet-bar button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.round-sheet-bar svg{width:20px;height:20px}@keyframes sheet-backdrop-in{from{opacity:0}}@keyframes round-sheet-in{from{transform:translateY(18px);opacity:.65}}@media(min-width:680px){.round-sheet-backdrop{place-items:center;padding:24px}.round-sheet{border-bottom:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));padding:18px}}@media(prefers-reduced-motion:reduce){.round-sheet-backdrop,.round-sheet{animation:none}}
</style>
