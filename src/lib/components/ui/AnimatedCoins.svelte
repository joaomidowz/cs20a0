<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Language } from '$lib/game/types';

  export let value: number;
  export let language: Language;

  let displayed = 0;
  let mounted = false;
  let frame = 0;

  function animate(target: number) {
    cancelAnimationFrame(frame);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { displayed = target; return; }
    const start = performance.now();
    const duration = 850;
    const from = displayed;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      displayed = Math.round(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  onMount(() => { mounted = true; animate(value); });
  $: if (mounted && Number.isFinite(value)) animate(value);
  onDestroy(() => cancelAnimationFrame(frame));
</script>

<span aria-label={`+${value.toLocaleString(language)} coins`}>+{displayed.toLocaleString(language)}<small>coins</small></span>

<style>
  span { display: inline-block; animation: coin-pop .48s cubic-bezier(.2,.8,.2,1) both; }
  small { margin-left: 6px; color: var(--muted); font: 800 .9rem Inter, Arial, sans-serif; }
  @keyframes coin-pop { from { opacity: .4; transform: translateY(8px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (prefers-reduced-motion: reduce) { span { animation: none; } }
</style>
