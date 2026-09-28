<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Language } from '$lib/game/types';

  /**
   * Número que desliza até o valor novo em vez de saltar (poder do time, comparações). Conta a partir do valor que
   * está na tela, em ~220 ms, e respeita `prefers-reduced-motion` (aí só troca o texto). Formata com `digits` decimais.
   */
  export let value: number;
  export let language: Language;
  export let digits = 1;
  export let duration = 220;

  let displayed = Number.isFinite(value) ? value : 0;
  let mounted = false;
  let frame = 0;

  const format = (amount: number) => amount.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  function animate(target: number) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
    if (typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches || displayed === target) { displayed = target; return; }
    const start = performance.now();
    const from = displayed;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      displayed = progress < 1 ? from + (target - from) * eased : target;
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  onMount(() => { mounted = true; });
  $: if (mounted && Number.isFinite(value)) animate(value);
  onDestroy(() => { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame); });
</script>

<span class="animated-number" aria-label={format(value)}>{format(displayed)}</span>

<style>
  .animated-number { font-variant-numeric: tabular-nums; }
</style>
