<script lang="ts">
  import type { RoundDetail, RoundScore } from '$lib/game/types';

  /** Rounds revealed so far (cumulative scores). */
  export let rounds: RoundScore[] = [];
  /** Matching round details when the engine produced them. */
  export let details: RoundDetail[] | undefined = undefined;
  /** Whether team A is the viewer's team; null paints both sides neutrally. */
  export let userIsA: boolean | null = null;

  const FEAT_TITLES = { ace: 'ACE', '4k': '4K', '3k': '3K' } as const;

  $: ticks = rounds.map((round, index) => {
    const before = index > 0 ? rounds[index - 1] : { a: 0, b: 0 };
    // Online snapshots deliver a rolling window, so the detail is matched by round number before falling back to the index.
    const detail = details?.find((item) => item?.number === index + 1) ?? details?.[index];
    const feat = detail?.tags.includes('ace') ? 'ace' : detail?.tags.includes('4k') ? '4k' : detail?.tags.includes('3k') ? '3k' : null;
    const clutch = detail?.tags.includes('clutch') ?? false;
    const highlightFeat = detail?.highlight?.kind === 'ace' ? 'ace' : detail?.highlight?.kind === 'quad' ? '4k' : detail?.highlight?.kind === 'triple' ? '3k' : null;
    const featPlayer = feat && highlightFeat === feat ? detail?.highlight?.playerName : null;
    const feats = [feat ? `${FEAT_TITLES[feat]}${featPlayer ? ` · ${featPlayer}` : ''}` : null, clutch ? `CLUTCH${detail?.highlight?.kind === 'clutch' && detail.highlight.against ? ` 1v${detail.highlight.against}` : ''}` : null].filter(Boolean);
    return {
      winner: round.a > before.a ? 'a' : 'b',
      pistol: detail?.tags.includes('pistol') ?? (index === 0 || index === 12),
      half: index === 11 || index === 23 || (index >= 24 && (index - 24) % 3 === 2),
      timeout: detail?.timeout ?? null,
      clutch,
      feat,
      title: feats.length ? `R${index + 1} · ${feats.join(' · ')}` : null,
      overtime: round.overtime
    };
  });
</script>

<div class="round-strip">
  {#each ticks as tick, index (index)}
    <i
      title={tick.title}
      aria-hidden={tick.title ? undefined : 'true'}
      class:feat={tick.feat !== null}
      class:ace={tick.feat === 'ace'}
      class:quad={tick.feat === '4k'}
      class:user={userIsA !== null && (tick.winner === 'a') === userIsA}
      class:enemy={userIsA !== null && (tick.winner === 'a') !== userIsA}
      class:a={userIsA === null && tick.winner === 'a'}
      class:b={userIsA === null && tick.winner === 'b'}
      class:pistol={tick.pistol}
      class:half={tick.half}
      class:clutch={tick.clutch}
      class:overtime={tick.overtime}
      class:timeout={tick.timeout !== null}
    >{#if tick.feat}<b></b>{/if}</i>
  {/each}
</div>

<style>
  /* Height is reserved for the feat dots above the ticks so marking a round never moves the HUD. */
  .round-strip{display:flex;flex-wrap:wrap;gap:3px;min-height:8px;padding-top:8px}
  .round-strip i{position:relative;width:12px;height:8px;background:var(--line);animation:tickIn .18s ease-out}
  .round-strip i.user{background:var(--accent)}.round-strip i.enemy{background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .round-strip i.a{background:var(--accent)}.round-strip i.b{background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .round-strip i.pistol{height:11px;margin-top:-3px;box-shadow:inset 0 -2px 0 rgba(255,255,255,.55)}
  .round-strip i.half{margin-right:6px}.round-strip i.half::after{content:'';position:absolute;right:-5px;top:-3px;width:1px;height:14px;background:var(--muted)}
  .round-strip i.clutch{outline:1px solid var(--accent-2);outline-offset:1px}
  /* Feat dot (3K / 4K / ACE) sits in the reserved strip padding, next to the timeout bar. */
  .round-strip i b{position:absolute;right:0;top:-6px;width:4px;height:4px;border-radius:50%;background:var(--text);opacity:.75}
  .round-strip i.quad b{background:var(--accent-2);opacity:1}
  .round-strip i.ace b{right:-1px;top:-7px;width:6px;height:6px;background:var(--accent-2);opacity:1;box-shadow:0 0 6px var(--accent-2)}
  .round-strip i.feat.timeout::before{width:4px}
  .round-strip i.overtime{opacity:.85;height:6px}
  .round-strip i.timeout::before{content:'';position:absolute;left:3px;top:-6px;width:6px;height:3px;background:var(--accent-2)}
  @keyframes tickIn{from{transform:scaleY(.2);opacity:0}}
  @media (prefers-reduced-motion:reduce){.round-strip i{animation:none}}
</style>
