<script context="module" lang="ts">
  export interface RouletteEntry {
    id: string;
    /** Text fallback of the ticket picture (initials). */
    avatar: string;
    title: string;
    subtitle: string;
    /** When set, the ticket draws the generated crest of this team instead of `avatar`. */
    badge?: { id: string; name: string; orgId?: string | null } | null;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { playOfflineSound } from '$lib/game/offlineAudio';
  import TeamBadge from './TeamBadge.svelte';

  export let entries: RouletteEntry[];
  export let result: RouletteEntry;
  export let anonymous = false;
  export let labels: { spinning: string; skip: string; hidden: string };
  export let onComplete: () => void;
  /** Spin length in ms; the online draft uses a shorter spin because its pick timer keeps running. */
  export let duration = 2800;
  /** When set, the window shows exactly this many tickets and the reel cycles entries in order. */
  export let visible: number | null = null;

  let track: HTMLDivElement;
  let animation: Animation | undefined;
  let completed = false;
  let settled = false;
  let tense = false;
  let frame = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const winnerIndex = 32;
  const STEP = 172;
  // Decorative randomness never touches the game's seeded generator.
  const resultOffset = Math.max(0, entries.findIndex((entry) => entry.id === result.id));
  const tickets = Array.from({ length: 36 }, (_, index) =>
    index === winnerIndex
      ? result
      : visible && entries.length
        ? entries[(((resultOffset + index - winnerIndex) % entries.length) + entries.length) % entries.length]
        : entries[Math.floor(Math.random() * entries.length)] ?? result
  );
  const finalX = winnerIndex * STEP + 80;
  // The reel overshoots to the edge of a neighbour (either side, never quite crossing) and then creeps back onto the winner.
  const side = Math.random() < 0.5 ? -1 : 1;
  const overshoot = Math.round(STEP * (0.36 + Math.random() * 0.12)) * side;
  const settleMs = Math.round(Math.max(700, Math.min(1400, duration * 0.42)));

  function finish() {
    if (completed) return;
    completed = true;
    cancelAnimationFrame(frame);
    clearTimeout(settleTimer);
    if (!settled) playOfflineSound('land');
    animation?.cancel();
    onComplete();
  }

  const currentX = () => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    return -matrix.m41;
  };

  onMount(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) {
      finish();
      return;
    }
    const spin = track.animate(
      [{ transform: 'translateX(-80px)' }, { transform: `translateX(-${finalX + overshoot}px)` }],
      { duration, easing: 'cubic-bezier(0.1, 0.75, 0.15, 1)', fill: 'forwards' }
    );
    animation = spin;
    spin.onfinish = () => {
      if (completed) return;
      tense = true;
      // Creep back with one hesitation halfway: the marker sits on the border, then the winner slides in.
      const back = track.animate(
        [
          { transform: `translateX(-${finalX + overshoot}px)`, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
          { transform: `translateX(-${finalX + overshoot * 0.55}px)`, offset: 0.45, easing: 'cubic-bezier(0.2, 0, 0.1, 1)' },
          { transform: `translateX(-${finalX + overshoot * 0.42}px)`, offset: 0.62, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
          { transform: `translateX(-${finalX}px)` }
        ],
        { duration: settleMs, fill: 'forwards' }
      );
      animation = back;
      back.onfinish = () => {
        tense = false;
        settled = true;
        cancelAnimationFrame(frame);
        playOfflineSound('land');
        settleTimer = setTimeout(finish, 360);
      };
    };
    let lastIndex = 0;
    const followMarker = () => {
      const index = Math.round((currentX() - 80) / STEP);
      if (index !== lastIndex) { lastIndex = index; playOfflineSound('tick'); }
      if (!completed && !settled) frame = requestAnimationFrame(followMarker);
    };
    frame = requestAnimationFrame(followMarker);
    // Background tabs must not leave the screen locked awaiting an animation event.
    const timer = window.setTimeout(finish, duration + settleMs + 800);
    const reduce = () => { if (preference.matches) finish(); };
    preference.addEventListener('change', reduce);
    return () => {
      completed = true;
      spin.cancel();
      animation?.cancel();
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      window.clearTimeout(timer);
      preference.removeEventListener('change', reduce);
    };
  });
</script>

<div class="roulette" class:settled class:tense class:windowed={visible} aria-busy={!settled}>
  <div class="viewport" class:windowed={visible} style={visible ? `max-width: min(100%, ${visible * 172 - 12}px)` : undefined} aria-hidden="true">
    <div class="marker"></div>
    <div class="track" bind:this={track}>
      {#each tickets as entry, index}
        <div class="ticket" class:winner={settled && index === winnerIndex} class:edge={tense && Math.abs(index - winnerIndex) <= 1}>
          <span class="avatar">
            {#if anonymous}?{:else if entry.badge}<TeamBadge id={entry.badge.id} name={entry.badge.name} orgId={entry.badge.orgId ?? null} size="lg" />{:else}{entry.avatar}{/if}
          </span>
          <strong>{anonymous ? labels.hidden : entry.title}</strong>
          <small>{anonymous ? '••••' : entry.subtitle}</small>
        </div>
      {/each}
    </div>
  </div>
  <div class="controls"><span role="status">{labels.spinning}</span><button class="ghost" type="button" on:click={finish}>{labels.skip}</button></div>
</div>

<style>
  .roulette { padding: 20px 0; min-width: 0; }
  .viewport { position: relative; overflow: hidden; padding: 18px 0; background: var(--bg); mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent); }
  .roulette.windowed { width: 100%; }
  .viewport.windowed { margin-inline: auto; }
  .track { display: flex; gap: 12px; position: relative; left: 50%; width: max-content; will-change: transform; }
  .ticket { width: 160px; height: 160px; flex: 0 0 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 12px; background: var(--surface-2); border: 1px solid var(--line); text-align: center; }
  .ticket strong { font-size: 1rem; overflow-wrap: anywhere; }
  .ticket.winner { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); animation: winner-lock .32s ease-out; }
  .settled .marker { opacity: .35; }
  .tense .marker { animation: marker-tense .55s ease-in-out infinite; }
  .tense .marker::before { border-top-color: var(--accent-2); }
  .ticket.edge { border-color: color-mix(in srgb, var(--accent-2) 70%, var(--line)); box-shadow: 0 0 14px color-mix(in srgb, var(--accent-2) 22%, transparent); }
  @keyframes marker-tense { 50% { transform: scaleX(2.4); opacity: .55; } }
  @keyframes winner-lock { from { transform: scale(.95); } to { transform: scale(1); } }
  .ticket small { color: var(--muted); }
  .avatar { display: grid; place-items: center; width: 48px; height: 48px; background: var(--surface); color: var(--accent); font-weight: 900; font-size: 1.4rem; }
  .marker { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--accent); z-index: 1; pointer-events: none; }
  .marker::before { content: ''; position: absolute; top: 0; left: -5px; border-top: 9px solid var(--accent); border-inline: 6px solid transparent; }
  .controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 12px 0; }
  .controls span { color: var(--text); font-size: .85rem; }
  .controls button { font-size: .7rem; }
  @media (prefers-reduced-motion: reduce) { .track { will-change: auto; } .ticket.winner { animation: none; } .tense .marker { animation: none; } }
</style>
