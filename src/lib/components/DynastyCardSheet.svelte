<script lang="ts">
  import { onMount } from 'svelte';
  import type { Language } from '$lib/game/types';

  export let title = '';
  export let subtitle = '';
  export let headers: string[] = [];
  export let rows: string[][] = [];
  export let emptyLabel = '';
  export let language: Language = 'pt-BR';
  export let onClose: () => void = () => {};

  let closeButton: HTMLButtonElement;
  const closeLabel = { 'pt-BR': 'Fechar', es: 'Cerrar', en: 'Close' } as const;
  onMount(() => closeButton?.focus());
</script>

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') onClose(); }} />

<div class="sheet-backdrop" role="presentation" on:click|self={onClose}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <div><span class="eyebrow">DINASTIA</span><h2>{title}</h2>{#if subtitle}<p>{subtitle}</p>{/if}</div>
      <button bind:this={closeButton} type="button" class="close" on:click={onClose}>{closeLabel[language]}</button>
    </header>
    {#if rows.length}
      <div class="table-wrap">
        <table>
          <thead><tr>{#each headers as header}<th scope="col">{header}</th>{/each}</tr></thead>
          <tbody>{#each rows as row}<tr>{#each row as cell}<td>{cell}</td>{/each}</tr>{/each}</tbody>
        </table>
      </div>
    {:else}
      <p class="empty">{emptyLabel}</p>
    {/if}
  </div>
</div>

<style>
  .sheet-backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: end center; padding: 16px; background: rgb(0 0 0 / 55%); }
  .sheet { display: grid; gap: 14px; width: min(720px, 100%); min-width: 0; max-height: min(80vh, 640px); padding: 18px; overflow: auto; border: 1px solid var(--line); border-radius: 8px 8px 0 0; background: var(--surface); }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
  header > div { min-width: 0; }
  h2 { overflow-wrap: anywhere; }
  h2, p { margin: 0; } p { color: var(--muted); font-size: .8rem; }
  .eyebrow { color: var(--accent); font-size: .6rem; font-weight: 900; letter-spacing: .14em; }
  .close { flex: none; min-height: 36px; padding: 0 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 800 .66rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .78rem; }
  th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
  th { color: var(--muted); font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; }
  .empty { padding: 12px 0; }
  @media (min-width: 680px) { .sheet-backdrop { place-items: center; } .sheet { border-radius: 8px; } }
</style>
