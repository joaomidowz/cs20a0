<script lang="ts">
  import { onMount } from 'svelte';
  import { playOfflineSound } from '$lib/game/offlineAudio';
  import type { HistoricalTeam, Language } from '$lib/game/types';

  export let candidates: HistoricalTeam[];
  export let result: HistoricalTeam;
  export let anonymous = false;
  export let language: Language = 'en';
  export let onComplete: () => void;

  let track: HTMLDivElement;
  let animation: Animation | undefined;
  let completed = false;
  let settled = false;
  let frame = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const winnerIndex = 32;
  // Decorative randomness never touches the game's seeded generator.
  const entries = Array.from({ length: 36 }, (_, index) =>
    index === winnerIndex ? result : candidates[Math.floor(Math.random() * candidates.length)] ?? result
  );
  $: copy = language === 'pt-BR'
    ? { spinning: 'Sorteando time…', skip: 'Pular animação', hidden: 'Oferta oculta' }
    : language === 'es'
      ? { spinning: 'Sorteando equipo…', skip: 'Saltar animación', hidden: 'Oferta oculta' }
      : { spinning: 'Drawing team…', skip: 'Skip animation', hidden: 'Hidden offer' };

  function finish() {
    if (completed) return;
    completed = true;
    cancelAnimationFrame(frame);
    clearTimeout(settleTimer);
    if (!settled) playOfflineSound('land');
    animation?.cancel();
    onComplete();
  }

  onMount(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) {
      finish();
      return;
    }
    animation = track.animate(
      [{ transform: 'translateX(-80px)' }, { transform: `translateX(-${winnerIndex * 172 + 80}px)` }],
      { duration: 2800, easing: 'cubic-bezier(0.12, 0.7, 0.12, 1)', fill: 'forwards' }
    );
    animation.onfinish = () => {
      settled = true;
      cancelAnimationFrame(frame);
      playOfflineSound('land');
      settleTimer = setTimeout(finish, 320);
    };
    let lastIndex = 0;
    const followMarker = () => {
      const progress = Number(animation?.effect?.getComputedTiming().progress ?? 0);
      const index = Math.round(progress * winnerIndex);
      if (index !== lastIndex) { lastIndex = index; playOfflineSound('tick'); }
      if (!completed && !settled) frame = requestAnimationFrame(followMarker);
    };
    frame = requestAnimationFrame(followMarker);
    // Background tabs must not leave the draft locked awaiting an animation event.
    const timer = window.setTimeout(finish, 3400);
    const reduce = () => { if (preference.matches) finish(); };
    preference.addEventListener('change', reduce);
    return () => {
      completed = true;
      animation?.cancel();
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      window.clearTimeout(timer);
      preference.removeEventListener('change', reduce);
    };
  });
</script>

<div class="roulette" class:settled aria-busy={!settled}>
  <div class="viewport" aria-hidden="true">
    <div class="marker"></div>
    <div class="track" bind:this={track}>
      {#each entries as team, index}
        <div class="ticket" class:winner={settled && index === winnerIndex}>
          <span class="avatar">{anonymous ? '?' : (team.name ?? 'T').slice(0, 2).toUpperCase()}</span>
          <strong>{anonymous ? copy.hidden : team.name ?? 'Team'}</strong>
          <small>{anonymous ? '••••' : team.year ?? ''}</small>
        </div>
      {/each}
    </div>
  </div>
  <div class="controls"><span role="status">{copy.spinning}</span><button class="ghost" type="button" on:click={finish}>{copy.skip}</button></div>
</div>

<style>
  .roulette { padding: 20px 0; min-width: 0; }
  .viewport { position: relative; overflow: hidden; padding: 18px 0; background: var(--bg); mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent); }
  .track { display: flex; gap: 12px; position: relative; left: 50%; width: max-content; will-change: transform; }
  .ticket { width: 160px; height: 160px; flex: 0 0 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 12px; background: var(--surface-2); border: 1px solid var(--line); text-align: center; }
  .ticket strong { font-size: 1rem; overflow-wrap: anywhere; }
  .ticket.winner { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); animation: winner-lock .32s ease-out; }
  .settled .marker { opacity: .35; }
  @keyframes winner-lock { from { transform: scale(.95); } to { transform: scale(1); } }
  .ticket small { color: var(--muted); }
  .avatar { display: grid; place-items: center; width: 48px; height: 48px; background: var(--surface); color: var(--accent); font-weight: 900; font-size: 1.4rem; }
  .marker { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--accent); z-index: 1; pointer-events: none; }
  .marker::before { content: ''; position: absolute; top: 0; left: -5px; border-top: 9px solid var(--accent); border-inline: 6px solid transparent; }
  .controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 12px 0; }
  .controls span { color: var(--text); font-size: .85rem; }
  .controls button { font-size: .7rem; }
  @media (prefers-reduced-motion: reduce) { .track { will-change: auto; } .ticket.winner { animation: none; } }
</style>
