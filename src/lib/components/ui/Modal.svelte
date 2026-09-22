<script lang="ts">
  import { tick } from 'svelte';

  /**
   * Modal genérico do app: moldura, backdrop, Escape/clique-fora fecham, foco preso e devolvido.
   * O conteúdo vai no slot default; botões no slot `actions` (a grade padrão do ConfirmDialog).
   */
  export let open = false;
  export let title = '';
  export let onClose: () => void = () => {};

  let panel: HTMLDivElement;
  let lastFocus: Element | null = null;

  $: if (open) void focusPanel();

  async function focusPanel() {
    lastFocus = document.activeElement;
    await tick();
    panel?.focus();
  }

  function close() {
    onClose();
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
  }

  function keydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
</script>

<svelte:window on:keydown={keydown} />

{#if open}
  <div class="backdrop" role="presentation" on:click|self={close}>
    <div class="modal panel" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={panel}>
      {#if title}<span class="eyebrow">CS13A0</span><h2>{title}</h2>{/if}
      <div class="body"><slot /></div>
      {#if $$slots.actions}<div class="actions"><slot name="actions" /></div>{/if}
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: rgb(4 6 8 / 72%); backdrop-filter: blur(3px); animation: fade .16s ease-out; }
  .modal { display: grid; gap: 12px; width: min(480px, 100%); max-height: calc(100vh - 48px); overflow: auto; padding: 24px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); background: linear-gradient(145deg, color-mix(in srgb, var(--surface) 95%, white 5%), var(--surface)); box-shadow: var(--shadow); animation: pop .2s cubic-bezier(.16, 1, .3, 1); }
  .modal:focus { outline: none; }
  h2 { margin: 0; font-size: 1.6rem; }
  .body { display: grid; gap: 12px; color: var(--muted); line-height: 1.55; }
  .body :global(p) { margin: 0; }
  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 6px; }
  .actions > :global(button) { min-height: 46px; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { transform: translateY(8px) scale(.97); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .backdrop, .modal { animation: none; } }
</style>
