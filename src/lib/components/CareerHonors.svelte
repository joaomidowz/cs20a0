<script lang="ts">
  // Símbolos discretos de carreira: troféu com o número de títulos e estrela com o de MVPs. Nada aparece quando os dois
  // são zero. O troféu fica dourado quando algum título é de Major (o rótulo acessível diz quantos).
  import { honorsLabel, type PlayerHonors } from '$lib/game/playerCareer/honors';

  export let honors: PlayerHonors | null = null;
  export let size: 'sm' | 'md' = 'sm';

  $: visible = Boolean(honors && (honors.titles > 0 || honors.mvps > 0));
  $: label = honors ? honorsLabel(honors) : '';
</script>

{#if visible && honors}
  <span class="honors size-{size}" class:major={honors.majors > 0} role="img" aria-label={label} title={label}>
    {#if honors.titles > 0}
      <span class="item title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M10 17h4M8 20h8" /></svg>
        <b>{honors.titles}</b>
      </span>
    {/if}
    {#if honors.mvps > 0}
      <span class="item mvp">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>
        <b>{honors.mvps}</b>
      </span>
    {/if}
  </span>
{/if}

<style>
  /* Na carta estreita do celular, troféu e estrela quebram em duas linhas em vez de passar da borda. */
  .honors { display: inline-flex; flex: none; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 3px 6px; box-sizing: border-box; max-width: 100%; padding: 2px 5px; border: 1px solid color-mix(in srgb, var(--line) 80%, transparent); background: color-mix(in srgb, var(--surface) 78%, transparent); color: var(--muted); font: 800 11px/1 Archivo, Inter, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .item { display: inline-flex; align-items: center; gap: 2px; }
  .item svg { flex: none; width: 12px; height: 12px; }
  .item b { color: var(--text); font: inherit; }
  .title svg { color: var(--muted); }
  .major .title svg { color: var(--gold, #d9a441); }
  .mvp svg { color: var(--accent); }
  .size-md { gap: 8px; padding: 3px 7px; font-size: 13px; }
  .size-md .item svg { width: 15px; height: 15px; }
</style>
