<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import { BUY_LABELS, ENDING_LABELS, SIDE_LABELS, WEAPON_LABELS, getRoundTagLabel } from '$lib/game/roundPresentation';
  import { KILL_FLAG_ICONS, KILL_FLAG_LABELS, killFlags } from '$lib/game/killfeedIcons';
  import { WEAPON_ICONS } from '$lib/game/sandbox/weaponIcons';
  import type { Language, RoundDetail, RoundScore } from '$lib/game/types';

  /** Rounds revealed so far (cumulative scores). */
  export let rounds: RoundScore[] = [];
  /** Matching round details when the engine produced them. */
  export let details: RoundDetail[] | undefined = undefined;
  /** Whether team A is the viewer's team; null paints both sides neutrally. */
  export let userIsA: boolean | null = null;
  export let language: Language = 'pt-BR';
  export let teamNames: { a: string; b: string } = { a: 'A', b: 'B' };

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
  $: buyLabels = BUY_LABELS[language];
  $: sideLabels = SIDE_LABELS[language];
  $: endingLabels = ENDING_LABELS[language];
  $: isMine = (side: 'a' | 'b') => userIsA !== null && (side === 'a') === userIsA;
  $: inspectLabel = language === 'en' ? 'Round detail' : language === 'es' ? 'Detalle de la ronda' : 'Detalhe do round';
  $: killsLabel = language === 'en' ? 'Kills' : language === 'es' ? 'Bajas' : 'Abates';
  $: noKillsLabel = language === 'en' ? 'No kills recorded.' : language === 'es' ? 'Sin bajas registradas.' : 'Sem abates registrados.';
  $: timeoutLabel = language === 'en' ? 'Tactical timeout' : language === 'es' ? 'Pausa táctica' : 'Pausa tática';

  const show = (round: number, event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || pinned) return;
    openRound = round;
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || pinned) return;
    openRound = null;
  };
  function toggle(round: number) {
    if (pinned && openRound === round) { pinned = false; openRound = null; return; }
    openRound = round;
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
        on:click={() => toggle(tick.number)}
      >{#if tick.feat}<b></b>{/if}</button>
    {/each}
  </div>

  {#if openTick}
    <article class="round-card" aria-live="polite">
      <header>
        <div>
          <span class="eyebrow">R{openTick.number}{#if openTick.overtime} · OT{/if}</span>
          <strong class:mine={isMine(openTick.winner)}>{teamNames[openTick.winner]}</strong>
          {#if openTick.detail}<small>{endingLabels[openTick.detail.ending]}</small>{/if}
        </div>
        <b class="round-score">{openTick.score.a} : {openTick.score.b}</b>
      </header>

      {#if openTick.detail}
        {@const detail = openTick.detail}
        <div class="round-economy">
          <span class:mine={isMine('a')}>{teamNames.a} · {sideLabels[detail.sideA]} · {buyLabels[detail.economy.a.buy]} · ${detail.economy.a.money}{#if detail.economy.a.awp} · AWP{/if}</span>
          <span class:mine={isMine('b')}>{teamNames.b} · {sideLabels[detail.sideA === 'ct' ? 't' : 'ct']} · {buyLabels[detail.economy.b.buy]} · ${detail.economy.b.money}{#if detail.economy.b.awp} · AWP{/if}</span>
        </div>
        {#if detail.tags.length || detail.timeout}
          <div class="round-tags">
            {#each detail.tags as tag (tag)}<i>{getRoundTagLabel(language, tag)}</i>{/each}
            {#if detail.timeout}<i class="timeout-tag">{timeoutLabel} · {teamNames[detail.timeout]}{#if detail.timeoutTiming} · {translate(language, detail.timeoutTiming === 'window' ? 'timeoutWindow' : detail.timeoutTiming === 'early' ? 'timeoutEarly' : 'timeoutLate')}{/if}</i>{/if}
          </div>
        {/if}
        <div class="round-kills">
          <span class="eyebrow">{killsLabel} · {detail.kills.length}</span>
          {#if detail.kills.length}
            <ol>
              {#each detail.kills as kill, index (index)}
                <li>
                  <b class:mine={isMine(kill.killerSide)}>{kill.killerName}</b>
                  {#if kill.assistName}<span class="assist" title={KILL_FLAG_LABELS[language].assist}><i class="flag">{@html KILL_FLAG_ICONS.assist}</i>{kill.assistName}</span>{/if}
                  {#if kill.flashAssistName}<span class="assist" title={KILL_FLAG_LABELS[language].flashAssist}><i class="flag">{@html KILL_FLAG_ICONS.flashAssist}</i>{kill.flashAssistName}</span>{/if}
                  <em class="weapon" role="img" aria-label={WEAPON_LABELS[kill.weapon]} title={WEAPON_LABELS[kill.weapon]}>{@html WEAPON_ICONS[kill.weapon]}</em>
                  {#each killFlags(kill) as flag (flag)}<i class="flag" class:hs={flag === 'headshot'} role="img" aria-label={KILL_FLAG_LABELS[language][flag]} title={KILL_FLAG_LABELS[language][flag]}>{@html KILL_FLAG_ICONS[flag]}</i>{/each}
                  <span class="victim">{kill.victimName}</span>
                  <small>{kill.second}s</small>
                </li>
              {/each}
            </ol>
          {:else}<p>{noKillsLabel}</p>{/if}
        </div>
      {/if}
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
  .round-card{display:grid;gap:9px;padding:11px 13px;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 88%,black 12%)}
  .round-card header{display:flex;align-items:end;justify-content:space-between;gap:12px}
  .round-card header div{display:grid;gap:2px;min-width:0}
  .round-card header strong{font-size:1.05rem;text-transform:uppercase}
  .round-card header strong.mine{color:var(--accent)}
  .round-card header small{color:var(--muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.08em}
  .round-score{font:900 1.25rem 'Arial Narrow',Impact,sans-serif;font-variant-numeric:tabular-nums}
  .round-economy{display:grid;gap:3px;color:var(--muted);font-size:.63rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
  .round-economy .mine{color:var(--text)}
  .round-tags{display:flex;flex-wrap:wrap;gap:5px}
  .round-tags i{padding:2px 7px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));color:var(--accent);font-size:.55rem;font-style:normal;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  .round-tags i.timeout-tag{border-color:color-mix(in srgb,var(--accent-2) 55%,var(--line));color:var(--accent-2)}
  .round-kills{display:grid;gap:5px}
  .round-kills ol{display:grid;gap:3px;margin:0;padding:0;list-style:none}
  .round-kills li{display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:.7rem}
  .round-kills b{font-weight:800}.round-kills b.mine{color:var(--accent)}
  .round-kills em{display:inline-flex;align-items:center;font-style:normal;opacity:.85}
  .round-kills em :global(svg){width:30px;height:13px}
  .round-kills .flag{display:inline-flex;width:14px;height:14px;color:var(--text);opacity:.85}.round-kills .flag :global(svg){width:100%;height:100%}.round-kills .flag.hs{color:var(--danger);opacity:1}
  .round-kills .assist{display:inline-flex;align-items:center;gap:3px;color:var(--muted);font-size:.62rem}.round-kills .assist .flag{width:12px;height:12px;opacity:.7}
  .round-kills .victim{color:var(--muted)}
  .round-kills small{margin-left:auto;color:var(--muted);font-size:.58rem;font-variant-numeric:tabular-nums}
  .round-kills p{margin:0;color:var(--muted);font-size:.68rem}
  @keyframes tickIn{from{transform:scaleY(.2);opacity:0}}
  @media (max-width:679px){.round-strip button{width:14px;height:12px}.round-strip button.pistol{height:15px}}
  @media (prefers-reduced-motion:reduce){.round-strip button{animation:none;transition:none}}
</style>
