<script lang="ts">
  import type { RoundDetail, RoundScore } from '$lib/game/types';

  /** Rounds revealed so far (cumulative scores). */
  export let rounds: RoundScore[] = [];
  /** Matching round details when the engine produced them. */
  export let details: RoundDetail[] | undefined = undefined;
  /** Whether team A is the viewer's team; null paints both sides neutrally. */
  export let userIsA: boolean | null = null;

  $: ticks = rounds.map((round, index) => {
    const before = index > 0 ? rounds[index - 1] : { a: 0, b: 0 };
    const detail = details?.[index];
    return {
      winner: round.a > before.a ? 'a' : 'b',
      pistol: detail?.tags.includes('pistol') ?? (index === 0 || index === 12),
      half: index === 11 || index === 23 || (index >= 24 && (index - 24) % 3 === 2),
      timeout: detail?.timeout ?? null,
      clutch: detail?.tags.includes('clutch') ?? false,
      overtime: round.overtime
    };
  });
</script>

<div class="round-strip" aria-hidden="true">
  {#each ticks as tick, index (index)}
    <i
      class:user={userIsA !== null && (tick.winner === 'a') === userIsA}
      class:enemy={userIsA !== null && (tick.winner === 'a') !== userIsA}
      class:a={userIsA === null && tick.winner === 'a'}
      class:b={userIsA === null && tick.winner === 'b'}
      class:pistol={tick.pistol}
      class:half={tick.half}
      class:clutch={tick.clutch}
      class:overtime={tick.overtime}
      class:timeout={tick.timeout !== null}
    ></i>
  {/each}
</div>

<style>
  .round-strip{display:flex;flex-wrap:wrap;gap:3px;min-height:8px}
  .round-strip i{position:relative;width:12px;height:8px;background:var(--line);animation:tickIn .18s ease-out}
  .round-strip i.user{background:var(--accent)}.round-strip i.enemy{background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .round-strip i.a{background:var(--accent)}.round-strip i.b{background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .round-strip i.pistol{height:11px;margin-top:-3px;box-shadow:inset 0 -2px 0 rgba(255,255,255,.55)}
  .round-strip i.half{margin-right:6px}.round-strip i.half::after{content:'';position:absolute;right:-5px;top:-3px;width:1px;height:14px;background:var(--muted)}
  .round-strip i.clutch{outline:1px solid var(--accent-2);outline-offset:1px}
  .round-strip i.overtime{opacity:.85;height:6px}
  .round-strip i.timeout::before{content:'';position:absolute;left:3px;top:-6px;width:6px;height:3px;background:var(--accent-2)}
  @keyframes tickIn{from{transform:scaleY(.2);opacity:0}}
  @media (prefers-reduced-motion:reduce){.round-strip i{animation:none}}
</style>
