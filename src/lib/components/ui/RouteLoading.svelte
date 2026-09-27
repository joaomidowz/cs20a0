<script lang="ts">
  import { navigating } from '$app/stores';
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';

  /**
   * Loading entre telas: o mesmo radar da home (`.scanner`) numa faixa fixa no topo, só quando a navegação demora mais
   * que um piscar de olhos (200 ms). Navegações rápidas não mostram nada, para não piscar a cada clique.
   */
  export let delay = 200;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  $: {
    if ($navigating) {
      if (timer === null) timer = setTimeout(() => { visible = true; timer = null; }, delay);
    } else {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      visible = false;
    }
  }
  onDestroy(() => { if (timer !== null) clearTimeout(timer); });
</script>

{#if visible}
  <div class="route-loading" role="status" aria-live="polite" transition:fade={{ duration: 160 }}>
    <div class="scanner" aria-hidden="true"><span></span></div>
    <span class="sr-only">Carregando…</span>
  </div>
{/if}

<style>
  .route-loading { position: fixed; z-index: 240; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--bg) 72%, transparent); backdrop-filter: blur(2px); pointer-events: none; }
  .route-loading :global(.scanner) { margin: 0; width: 72px; height: 72px; box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 20%, transparent); }
  @media (prefers-reduced-motion: reduce) { .route-loading { backdrop-filter: none; } }
</style>
