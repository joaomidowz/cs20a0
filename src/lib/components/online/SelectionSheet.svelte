<script lang="ts">
  import { onMount } from 'svelte';
  export let title: string;
  export let closeLabel: string;
  export let onClose: () => void;
  let dialog: HTMLDialogElement;
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  });
</script>
<dialog bind:this={dialog} aria-label={title} on:cancel|preventDefault={onClose}>
  <header><h2>{title}</h2><button type="button" class="secondary" on:click={onClose}>{closeLabel} ×</button></header>
  <div class="sheet-content"><slot /></div>
</dialog>
<style>
  dialog { width: min(900px, calc(100% - 24px)); max-height: 88dvh; padding: 0; border: 1px solid var(--line); color: var(--text); background: var(--surface); }
  dialog::backdrop { background: rgb(0 0 0 / .75); }
  header { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px; background: var(--surface); z-index: 3; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 1.3rem; } button { min-height: 44px; border-radius: 0; }
  .sheet-content { padding: 16px; }
  @media(max-width:720px) { dialog { margin: auto 0 0; width: 100%; max-width: 100%; max-height: 92dvh; padding-bottom: env(safe-area-inset-bottom); } }
</style>
