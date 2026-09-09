<script lang="ts">
  import { onDestroy } from 'svelte';
  import { aggregateKills } from '$lib/game/rounds';
  import { BUY_LABELS, ENDING_LABELS, SIDE_LABELS, WEAPON_LABELS, getRoundTagLabel, getVisibleRoundTag } from '$lib/game/roundPresentation';
  import { WEAPON_ICONS } from '$lib/game/sandbox/weaponIcons';
  import type { Language, RoundDetail } from '$lib/game/types';

  /** Every round detail of the map revealed so far; the last one is the round being shown. */
  export let details: RoundDetail[] = [];
  export let visibleRounds = details.length;
  export let userIsA: boolean | null = null;
  /** Milliseconds between rounds: kills of the current round trickle in over ~85% of it. Below 400 they appear at once. */
  export let delay = 1500;
  export let language: Language = 'pt-BR';
  export let teamNames: { a: string; b: string } = { a: 'A', b: 'B' };
  export let compact = false;
  /** Called once per round as soon as its whole kill feed is on screen (the parent then commits the round). */
  export let onRoundResolved: (roundNumber: number) => void = () => {};
  /** Simple mode: keeps the round result and hides the kill by kill feed. */
  export let simple = false;

  let shownKills = 0;
  let killTimers: number[] = [];
  let killCursor = '';
  let resolvedCursor = '';

  // Online snapshots deliver a rolling window, so the round is looked up by number rather than by index.
  $: knownDetails = details.filter((detail): detail is RoundDetail => Boolean(detail));
  $: currentDetail = visibleRounds > 0 ? knownDetails.find((detail) => detail.number === visibleRounds) ?? null : null;
  $: revealKills(currentDetail ? `${currentDetail.number}:${currentDetail.kills.length}` : '', currentDetail, delay);
  $: visibleKills = currentDetail ? currentDetail.kills.slice(0, shownKills) : [];
  $: resolved = Boolean(currentDetail && shownKills >= currentDetail.kills.length);
  $: if (currentDetail && resolved) notifyResolved(currentDetail.number);
  $: fragLeaders = compact ? [] : aggregateKills(knownDetails.filter((detail) => detail.number < visibleRounds || (detail.number === visibleRounds && resolved))).slice(0, 3);
  $: tag = getVisibleRoundTag(currentDetail, resolved);
  $: buyLabels = BUY_LABELS[language];
  $: sideLabels = SIDE_LABELS[language];
  $: endingLabels = ENDING_LABELS[language];
  $: isMine = (side: 'a' | 'b') => userIsA !== null && (side === 'a') === userIsA;

  function clearKillTimers() {
    killTimers.forEach((timer) => window.clearTimeout(timer));
    killTimers = [];
  }

  function notifyResolved(roundNumber: number) {
    if (resolvedCursor === killCursor) return;
    resolvedCursor = killCursor;
    onRoundResolved(roundNumber);
  }

  function revealKills(cursor: string, detail: RoundDetail | null, roundDelay: number) {
    if (cursor === killCursor) return;
    killCursor = cursor;
    clearKillTimers();
    if (!detail) {
      shownKills = 0;
      return;
    }
    if (roundDelay < 400 || typeof window === 'undefined') {
      shownKills = detail.kills.length;
      return;
    }
    shownKills = 0;
    const span = roundDelay * 0.85;
    const last = Math.max(1, detail.kills.at(-1)?.second ?? 1);
    detail.kills.forEach((kill, index) => {
      killTimers.push(window.setTimeout(() => { shownKills = index + 1; }, Math.round(span * kill.second / last)));
    });
  }

  onDestroy(clearKillTimers);
</script>

{#if currentDetail}
  <div class="round-detail" class:compact>
    <div class="round-economy">
      <span class="buy {currentDetail.economy.a.buy}" class:mine={isMine('a')} title={`${teamNames.a} · $${currentDetail.economy.a.money}`}><i>{sideLabels[currentDetail.sideA]}</i>{buyLabels[currentDetail.economy.a.buy]}{#if currentDetail.economy.a.awp}<em>AWP</em>{/if}</span>
      <div class="round-center">
        <em class="round-number">R{currentDetail.number}</em>
        {#if currentDetail.timeout}<b class="round-tag timeout" class:mine={isMine(currentDetail.timeout)}>⏸ {teamNames[currentDetail.timeout]}</b>{/if}
        {#if tag}<b class="round-tag {tag}" class:mine={resolved && isMine(currentDetail.winner)}>{getRoundTagLabel(language, tag)}</b>{/if}
      </div>
      <span class="buy right {currentDetail.economy.b.buy}" class:mine={isMine('b')} title={`${teamNames.b} · $${currentDetail.economy.b.money}`}>{#if currentDetail.economy.b.awp}<em>AWP</em>{/if}{buyLabels[currentDetail.economy.b.buy]}<i>{sideLabels[currentDetail.sideA === 'ct' ? 't' : 'ct']}</i></span>
    </div>
    {#if currentDetail.kills.length && !simple}
      <ul class="kill-feed" aria-label="Kill feed">
        {#each visibleKills as kill, index (`${currentDetail.number}-${index}`)}
          <li class:user={isMine(kill.killerSide)} class:enemy={userIsA !== null && !isMine(kill.killerSide)}>
            <b class="killer">{kill.killerName}</b>
            <span class="weapon" role="img" aria-label={WEAPON_LABELS[kill.weapon]} title={WEAPON_LABELS[kill.weapon]}>{@html WEAPON_ICONS[kill.weapon]}</span>
            {#if kill.headshot}<i class="hs" title="Headshot">HS</i>{/if}
            <b class="victim">{kill.victimName}</b>
            <time>{kill.second}s</time>
          </li>
        {/each}
      </ul>
    {/if}
    <small class="round-ending" class:user={isMine(currentDetail.winner)} class:enemy={userIsA !== null && !isMine(currentDetail.winner)}>{resolved ? `${endingLabels[currentDetail.ending]} · ${teamNames[currentDetail.winner]}` : ''}</small>
    {#if fragLeaders.length}
      <ol class="frag-leaders" aria-label="Top fraggers">
        {#each fragLeaders as line (line.playerId)}<li class:user={isMine(line.side)}><span>{line.name}</span><b>{line.kills}</b><small>/{line.deaths}</small></li>{/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .round-detail{display:grid;gap:8px;padding-top:8px;border-top:1px solid var(--line)}
  .round-economy{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px}
  .round-economy .buy{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.round-economy .buy.right{justify-content:flex-end}
  .round-economy .buy i{padding:2px 5px;border:1px solid var(--line);color:var(--text);font-size:.5rem;font-style:normal}.round-economy .buy.mine i{border-color:var(--accent);color:var(--accent)}
  .round-economy .buy em{padding:2px 5px;background:var(--accent-2);color:var(--bg);font-size:.5rem;font-style:normal;letter-spacing:.06em}
  .round-economy .buy.full{color:var(--text)}.round-economy .buy.eco{color:var(--danger)}.round-economy .buy.force{color:var(--accent-2)}
  .round-center{display:flex;align-items:center;gap:6px;min-height:20px}
  .round-number{color:var(--muted);font:900 .8rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.1em}
  .round-tag{padding:2px 6px;border:1px solid var(--accent-2);color:var(--accent-2);font-size:.5rem;font-weight:900;letter-spacing:.08em;white-space:nowrap;animation:tagIn .25s ease-out}
  .round-tag.mine{border-color:var(--accent);color:var(--accent)}.round-tag.clutch,.round-tag.eco-win{background:var(--accent-2);color:var(--bg)}.round-tag.clutch.mine,.round-tag.eco-win.mine{background:var(--accent)}
  .round-tag.timeout{border-style:dashed}
  /* Fixed footprint: five rows are reserved so the HUD never jumps while kills trickle in and the timeout button stays put. */
  .kill-feed{display:grid;gap:4px;min-height:152px;margin:0;padding:0;list-style:none;align-content:start}
  .compact .kill-feed{min-height:0}
  .kill-feed li{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 8px;border-left:2px solid var(--line);background:color-mix(in srgb,var(--surface) 75%,transparent);font-size:.78rem;animation:slideIn .3s ease-out}
  .kill-feed li.user{border-left-color:var(--accent)}.kill-feed li.enemy{border-left-color:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .kill-feed .killer{overflow:hidden;color:var(--text);text-overflow:ellipsis;white-space:nowrap}.kill-feed li.user .killer{color:var(--accent)}
  .kill-feed .victim{overflow:hidden;color:var(--muted);font-weight:600;text-overflow:ellipsis;white-space:nowrap}
  .kill-feed .weapon{display:inline-flex;flex:none;width:46px;height:16px;color:var(--text)}.kill-feed .weapon :global(svg){width:100%;height:100%}
  .kill-feed .hs{flex:none;padding:1px 4px;border:1px solid var(--accent-2);color:var(--accent-2);font-size:.5rem;font-style:normal;font-weight:900}
  .kill-feed time{flex:none;margin-left:auto;color:var(--muted);font-size:.6rem;font-variant-numeric:tabular-nums}
  .round-ending{min-height:1.2em;color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.round-ending.user{color:var(--accent)}.round-ending.enemy{color:var(--danger)}
  .frag-leaders{display:flex;flex-wrap:wrap;gap:6px 16px;min-height:30px;margin:0;padding:8px 0 0;border-top:1px solid var(--line);list-style:none}
  .frag-leaders li{display:flex;align-items:baseline;gap:4px;color:var(--muted);font-size:.66rem}.frag-leaders li span{font-weight:800;text-transform:uppercase}.frag-leaders li.user span{color:var(--accent)}.frag-leaders b{color:var(--text);font:900 .95rem 'Arial Narrow',Impact,sans-serif}.frag-leaders small{font-size:.58rem}
  .compact .kill-feed li{font-size:.7rem}
  @keyframes slideIn{from{transform:translateX(-8px);opacity:0}}
  @keyframes tagIn{from{transform:scale(.8);opacity:0}}
  @media (prefers-reduced-motion:reduce){.kill-feed li,.round-tag{animation:none}}
  @media(max-width:620px){.kill-feed time{display:none}.kill-feed li{font-size:.72rem}}
</style>
