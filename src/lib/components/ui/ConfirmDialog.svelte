<script lang="ts">
  import { tick } from 'svelte';
  import { activeDialog, settleDialog } from '$lib/game/ui/dialog';

  let dialog: HTMLDivElement;
  let confirmButton: HTMLButtonElement;
  let lastFocus: Element | null = null;

  $: if ($activeDialog) void focusDialog();

  async function focusDialog() {
    lastFocus = document.activeElement;
    await tick();
    confirmButton?.focus();
  }

  function close(confirmed: boolean) {
    settleDialog(confirmed);
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
  }

  function keydown(event: KeyboardEvent) {
    if (!$activeDialog) return;
    if (event.key === 'Escape') { event.preventDefault(); close(false); }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
</script>

<svelte:window on:keydown={keydown} />

{#if $activeDialog}
  <div class="backdrop" role="presentation" on:click|self={() => close(false)}>
    <div class="dialog panel" class:danger={$activeDialog.tone === 'danger'} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" bind:this={dialog}>
      <span class="eyebrow">CS13A0</span>
      <h2 id="confirm-title">{$activeDialog.title}</h2>
      {#if $activeDialog.body}<p id="confirm-body">{$activeDialog.body}</p>{/if}
      <div class="actions">
        <button class="secondary" type="button" on:click={() => close(false)}>{$activeDialog.cancelLabel}</button>
        <button class="primary" type="button" bind:this={confirmButton} on:click={() => close(true)}>{$activeDialog.confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: rgb(4 6 8 / 72%); backdrop-filter: blur(3px); animation: fade .16s ease-out; }
  .dialog { display: grid; gap: 12px; width: min(440px, 100%); padding: 24px; border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); animation: pop .2s cubic-bezier(.16, 1, .3, 1); }
  .dialog.danger { border-color: color-mix(in srgb, var(--danger) 55%, var(--line)); }
  .dialog.danger .primary { background: var(--danger); color: #fff; box-shadow: none; }
  h2 { margin: 0; font-size: 1.6rem; }
  p { margin: 0; color: var(--muted); line-height: 1.55; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
  .actions button { min-height: 46px; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { transform: translateY(8px) scale(.97); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .backdrop, .dialog { animation: none; } }
</style>
