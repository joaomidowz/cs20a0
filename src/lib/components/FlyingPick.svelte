<script lang="ts">
  import { onMount } from 'svelte';
  export let name: string;
  export let source: { left: number; top: number; width: number; height: number };
  export let slot: number;
  export let onComplete: () => void;
  let card: HTMLDivElement;

  onMount(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) { onComplete(); return; }
    const target = document.querySelector(`[data-draft-slot="${slot}"]`);
    if (!target) { onComplete(); return; }
    const end = target.getBoundingClientRect();
    const originX = Math.max(8, Math.min(innerWidth - 148, source.left + source.width / 2 - 70));
    const originY = Math.max(80, Math.min(innerHeight - 72, source.top + source.height / 2 - 30));
    const endX = Math.max(8, Math.min(innerWidth - 148, end.left + end.width / 2 - 70));
    const endY = end.top + end.height / 2 - 30;
    const animation = card.animate([
      { transform: `translate(${originX}px,${originY}px) scale(1)`, opacity: 1 },
      { transform: `translate(${endX}px,${endY}px) scale(.68)`, opacity: .5 }
    ], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
    animation.onfinish = onComplete;
    const timer = window.setTimeout(onComplete, 600);
    const finish = () => { if (reduced.matches) onComplete(); };
    reduced.addEventListener('change', finish);
    return () => { animation.cancel(); clearTimeout(timer); reduced.removeEventListener('change', finish); };
  });
</script>

<div bind:this={card} class="flying-pick" aria-hidden="true"><span>✓</span><strong>{name}</strong></div>

<style>
  .flying-pick { position: fixed; top: 0; left: 0; z-index: var(--z-offline-flight); width: 140px; min-height: 60px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; pointer-events: none; background: var(--accent); color: var(--bg); border-radius: 4px; }
  strong { font-size: 1rem; overflow-wrap: anywhere; min-width: 0; } span { font-size: 1.2rem; }
</style>
