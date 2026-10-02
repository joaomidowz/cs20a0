<script lang="ts">
  import type { Language, RoundDetail, RoundScore } from '$lib/game/types';
  import RoundDetailContent from './RoundDetailContent.svelte';
  import type { RoundInspection } from './round-inspection';

  /** Rounds revealed so far (cumulative scores). */
  export let rounds: RoundScore[] = [];
  /** Matching round details when the engine produced them. */
  export let details: RoundDetail[] | undefined = undefined;
  /** Whether team A is the viewer's team; null paints both sides neutrally. */
  export let userIsA: boolean | null = null;
  export let language: Language = 'pt-BR';
  export let teamNames: { a: string; b: string } = { a: 'A', b: 'B' };
  /** On mobile the parent opens the selected round in a sheet; desktop keeps the historical inline card. */
  export let onInspect: ((inspection: RoundInspection, trigger: HTMLElement) => void) | undefined = undefined;

  /** Round the reader is inspecting: hovered on a mouse, tapped on a touch screen. */
  let openRound: number | null = null;
  let pinned = false;

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
      number: index + 1,
      winner: round.a > before.a ? 'a' as const : 'b' as const,
      score: { a: round.a, b: round.b },
      pistol: detail?.tags.includes('pistol') ?? (index === 0 || index === 12),
      half: index === 11 || index === 23 || (index >= 24 && (index - 24) % 3 === 2),
      timeout: detail?.timeout ?? null,
      clutch,
      feat,
      title: feats.length ? `R${index + 1} · ${feats.join(' · ')}` : null,
      overtime: round.overtime,
      detail
    };
  });
  $: openTick = openRound === null ? null : ticks.find((tick) => tick.number === openRound) ?? null;
  $: openInspection = openTick ? ({
    number: openTick.number,
    score: openTick.score,
    winner: openTick.winner,
    overtime: openTick.overtime,
    detail: openTick.detail
  } satisfies RoundInspection) : null;
  $: inspectLabel = language === 'en' ? 'Round detail' : language === 'es' ? 'Detalle de la ronda' : 'Detalhe do round';

  const show = (round: number, event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || pinned) return;
    openRound = round;
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || pinned) return;
    openRound = null;
  };
  function toggle(tick: (typeof ticks)[number], event: MouseEvent) {
    const inspection: RoundInspection = { number: tick.number, score: tick.score, winner: tick.winner, overtime: tick.overtime, detail: tick.detail };
    if (onInspect) { onInspect(inspection, event.currentTarget as HTMLElement); return; }
    if (pinned && openRound === tick.number) { pinned = false; openRound = null; return; }
    openRound = tick.number;
    pinned = true;
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && openRound !== null) { openRound = null; pinned = false; }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="round-strip-wrap">
  <div class="round-strip" role="group" aria-label={inspectLabel}>
    {#each ticks as tick (tick.number)}
      <button
        type="button"
        aria-label={`${inspectLabel} ${tick.number}: ${tick.score.a}-${tick.score.b}`}
        aria-pressed={openRound === tick.number}
        class:user={userIsA !== null && (tick.winner === 'a') === userIsA}
        class:enemy={userIsA !== null && (tick.winner === 'a') !== userIsA}
        class:a={userIsA === null && tick.winner === 'a'}
        class:b={userIsA === null && tick.winner === 'b'}
        class:pistol={tick.pistol}
        class:half={tick.half}
        class:clutch={tick.clutch}
        class:overtime={tick.overtime}
        class:timeout={tick.timeout !== null}
        class:feat={tick.feat !== null}
        class:ace={tick.feat === 'ace'}
        class:quad={tick.feat === '4k'}
        title={tick.title ?? undefined}
        class:open={openRound === tick.number}
        on:pointerenter={(event) => show(tick.number, event)}
        on:pointerleave={leave}
        on:focus={() => { if (!pinned) openRound = tick.number; }}
        on:click={(event) => toggle(tick, event)}
      ><span>{tick.number}</span>{#if tick.feat}<b></b>{/if}</button>
    {/each}
  </div>

  {#if openInspection}
    <article class="round-card" aria-live="polite">
      <RoundDetailContent inspection={openInspection} {userIsA} {language} {teamNames} />
    </article>
  {/if}
</div>

<style>
  .round-strip-wrap{display:grid;gap:8px}
  /* Height is reserved for the feat dots above the ticks so marking a round never moves the HUD. */
  .round-strip{display:flex;flex-wrap:wrap;gap:3px;min-height:8px;padding-top:8px}
  .round-strip button{position:relative;width:12px;height:8px;padding:0;border:0;background:var(--line);cursor:pointer;animation:tickIn .18s ease-out;transition:transform .12s ease}
  .round-strip button:hover,.round-strip button.open{transform:scaleY(1.6)}
  .round-strip button.user{background:var(--accent)}.round-strip button.enemy{background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .round-strip button.a{background:var(--accent)}.round-strip button.b{background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .round-strip button.pistol{height:11px;margin-top:-3px;box-shadow:inset 0 -2px 0 rgba(255,255,255,.55)}
  .round-strip button.half{margin-right:6px}.round-strip button.half::after{content:'';position:absolute;right:-5px;top:-3px;width:1px;height:14px;background:var(--muted)}
  .round-strip button.clutch{outline:1px solid var(--accent-2);outline-offset:1px}
  .round-strip button.overtime{opacity:.85;height:6px}
  /* Feat dot (3K / 4K / ACE) sits in the reserved strip padding, next to the timeout bar. */
  .round-strip button b{position:absolute;right:0;top:-6px;width:4px;height:4px;border-radius:50%;background:var(--text);opacity:.75}
  .round-strip button.quad b{background:var(--accent-2);opacity:1}
  .round-strip button.ace b{right:-1px;top:-7px;width:6px;height:6px;background:var(--accent-2);opacity:1;box-shadow:0 0 6px var(--accent-2)}
  .round-strip button.feat.timeout::before{width:4px}
  .round-strip button.timeout::before{content:'';position:absolute;left:3px;top:-6px;width:6px;height:3px;background:var(--accent-2)}
  .round-strip button>span{display:none}
  .round-card{display:grid;gap:9px;padding:11px 13px;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 88%,black 12%)}
  @keyframes tickIn{from{transform:scaleY(.2);opacity:0}}
  @media (max-width:679px){.round-strip{flex-wrap:nowrap;gap:5px;min-height:44px;padding:0 0 3px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:thin}.round-strip button{flex:0 0 40px;width:40px;height:44px;border:1px solid var(--line);color:var(--muted);background:var(--surface);scroll-snap-align:start}.round-strip button>span{display:block;font-size:.68rem;font-weight:900}.round-strip button.user,.round-strip button.a{color:var(--bg);background:var(--accent)}.round-strip button.enemy,.round-strip button.b{color:var(--text);background:color-mix(in srgb,var(--danger) 55%,var(--surface))}.round-strip button.pistol{height:44px;margin-top:0}.round-strip button.half{margin-right:5px}.round-strip button.half::after{right:-4px;top:0;height:44px}.round-strip button.timeout::before{left:4px;top:4px}.round-strip button:hover,.round-strip button.open{transform:none;outline:1px solid var(--text);outline-offset:-3px}.round-strip button b{right:4px;top:4px}.round-strip button.ace b{right:3px;top:3px}.round-card{display:none}}
  @media (prefers-reduced-motion:reduce){.round-strip button{animation:none;transition:none}}
</style>
