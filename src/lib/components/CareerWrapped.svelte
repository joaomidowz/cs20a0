<script lang="ts">
  // Retrospectiva da carreira em slides (estilo stories): barras de progresso no topo, avanço sozinho, clique ou
  // setas para navegar, segurar para pausar. Cada slide conta um pedaço: o começo, a subida, as eras, os números, a
  // melhor temporada, os Majors, as jogadas e a curva de overall no fim.
  import { onDestroy, onMount } from 'svelte';
  import TeamBadge from './TeamBadge.svelte';
  import type { Retrospective } from '$lib/game/playerCareer/retrospective';

  export let retro: Retrospective;
  export let levelLabel: Record<number, string> = {};
  export let onClose: () => void = () => {};
  export let onNewCareer: (() => void) | null = null;

  const SLIDE_MS = 6500;
  type Tone = 'lime' | 'gold' | 'orange' | 'ice';
  type Slide =
    | { key: string; kind: 'intro' | 'start' | 'climb' | 'numbers' | 'majors' | 'plays' | 'outro'; tone: Tone }
    | { key: string; kind: 'era'; tone: Tone; era: Retrospective['eras'][number] }
    | { key: string; kind: 'best'; tone: Tone };

  $: topEras = [...retro.eras].filter((era) => era.titles > 0).sort((a, b) => b.titles - a.titles || a.level - b.level).slice(0, 3).sort((a, b) => a.from - b.from);
  $: slides = [
    { key: 'intro', kind: 'intro', tone: 'lime' },
    ...(retro.first ? [{ key: 'start', kind: 'start', tone: 'ice' }] : []),
    ...(retro.eras.length > 1 ? [{ key: 'climb', kind: 'climb', tone: 'lime' }] : []),
    ...topEras.map((era) => ({ key: `era-${era.orgId}-${era.from}`, kind: 'era', tone: era.majors.length ? 'gold' : 'orange', era })),
    { key: 'numbers', kind: 'numbers', tone: 'gold' },
    ...(retro.bestSeason && retro.bestSeason.titles > 0 ? [{ key: 'best', kind: 'best', tone: 'orange' }] : []),
    ...(retro.majorTitles.length ? [{ key: 'majors', kind: 'majors', tone: 'gold' }] : []),
    ...(retro.topPlays.length || retro.totals.aces ? [{ key: 'plays', kind: 'plays', tone: 'ice' }] : []),
    { key: 'outro', kind: 'outro', tone: 'lime' }
  ] as Slide[];

  let index = 0;
  let paused = false;
  let started = Date.now();
  let elapsedBefore = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reduced = false;
  let root: HTMLDivElement;

  $: slide = slides[Math.min(index, slides.length - 1)];
  $: last = index >= slides.length - 1;

  function schedule() {
    if (timer) clearTimeout(timer);
    if (paused || last) return;
    started = Date.now();
    timer = setTimeout(next, Math.max(300, SLIDE_MS - elapsedBefore));
  }
  function go(target: number) {
    index = Math.max(0, Math.min(slides.length - 1, target));
    elapsedBefore = 0;
    schedule();
  }
  const next = () => go(index + 1);
  const prev = () => go(index - 1);
  function togglePause() {
    if (paused) { paused = false; schedule(); return; }
    paused = true;
    elapsedBefore += Date.now() - started;
    if (timer) clearTimeout(timer);
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); prev(); }
    else if (event.key === ' ') { event.preventDefault(); togglePause(); }
    else if (event.key === 'Escape') onClose();
  }
  function onStage(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX - box.left < box.width * 0.3) prev(); else next();
  }

  onMount(() => {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    document.body.classList.add('modal-open');
    root?.focus();
    schedule();
  });
  onDestroy(() => {
    if (timer) clearTimeout(timer);
    if (typeof document !== 'undefined') document.body.classList.remove('modal-open');
  });

  /** Número que sobe do zero quando o slide aparece (sem animação se o sistema pede menos movimento). */
  function countUp(node: HTMLElement, value: number) {
    let frame = 0;
    const run = (target: number) => {
      cancelAnimationFrame(frame);
      if (reduced || target <= 0) { node.textContent = target.toLocaleString('pt-BR'); return; }
      const start = performance.now();
      const duration = Math.min(1600, 500 + target * 12);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString('pt-BR');
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    run(value);
    return { update: run, destroy: () => cancelAnimationFrame(frame) };
  }

  const PLAY_LABEL = (play: Retrospective['topPlays'][number]) =>
    play.kind === 'ace' ? 'Ace' : play.kind === 'quad' ? '4K' : play.kind === 'clutch' ? `Clutch 1v${play.against ?? 1}` : `${play.kills}K`;
  $: curvePoints = (() => {
    const values = retro.curve.map((point) => point.overall);
    if (values.length < 2) return '';
    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;
    return values.map((value, i) => `${((i / (values.length - 1)) * 600).toFixed(1)},${(150 - ((value - min) / Math.max(1, max - min)) * 130).toFixed(1)}`).join(' ');
  })();
  $: finalsRate = retro.totals.finals ? Math.round((retro.totals.finalsWon / retro.totals.finals) * 100) : 0;
  $: titleRate = retro.totals.events ? Math.round((retro.totals.titles / retro.totals.events) * 100) : 0;
</script>

<div class="wrapped tone-{slide.tone}" class:reduced bind:this={root} tabindex="-1" role="dialog" aria-modal="true" aria-label={`Retrospectiva da carreira de ${retro.nick}`} on:keydown={onKey}>
  <div class="bars" aria-hidden="true">
    {#each slides as item, i (item.key)}
      <span class="bar" class:done={i < index}><i class:run={i === index && !last} class:paused style={i === index ? `animation-duration:${SLIDE_MS}ms` : ''}></i></span>
    {/each}
  </div>
  <header class="top">
    <span class="wr-brand">Retrospectiva · {retro.nick}</span>
    <span class="top-actions">
      <button class="wr-btn" on:click={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>{paused ? 'Continuar' : 'Pausar'}</button>
      <button class="wr-btn close" on:click={onClose} aria-label="Fechar a retrospectiva">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </span>
  </header>

  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="stage" on:click={onStage}>
    {#key slide.key}
      <section class="slide" aria-live="polite">
        {#if slide.kind === 'intro'}
          <p class="wr-eyebrow s1">{retro.from}–{retro.to} · {retro.seasons} temporadas</p>
          <h1 class="giant nick s2">{retro.nick}</h1>
          {#if retro.line}<p class="lede s3">“{retro.line}”</p>{/if}
          <p class="hint s4">Toque para avançar (na esquerda, volta). Setas e espaço também funcionam.</p>
        {:else if slide.kind === 'start' && retro.first}
          <p class="wr-eyebrow s1">Onde tudo começou</p>
          <p class="giant year s2">{retro.from}</p>
          <div class="team-line s3"><TeamBadge id={retro.first.orgId} name={retro.first.orgName} size="lg" /><span>Aos <b>{retro.startAge} anos</b>, na <b>{retro.first.orgName}</b>{levelLabel[retro.first.level] ? `, ${levelLabel[retro.first.level]}` : ''}.</span></div>
        {:else if slide.kind === 'climb'}
          <p class="wr-eyebrow s1">A subida</p>
          <h2 class="title s2">{retro.eras.length} times, {retro.seasons} temporadas</h2>
          <ol class="stairs">
            {#each retro.eras.slice(0, 8) as era, i (era.orgId + era.from)}
              <li class:top={era.level <= 1} style={`--i:${i}`}>
                <TeamBadge id={era.orgId} name={era.orgName} size="sm" />
                <b>{era.orgName}</b>
                <span class="chip">{levelLabel[era.level] ?? `Nível ${era.level}`}</span>
                <span class="years">{era.from === era.to ? era.from : `${era.from}–${era.to}`}</span>
                {#if era.titles}<span class="count">{era.titles} título{era.titles > 1 ? 's' : ''}</span>{/if}
              </li>
            {/each}
          </ol>
        {:else if slide.kind === 'era'}
          <p class="wr-eyebrow s1">{slide.era.from === slide.era.to ? slide.era.from : `${slide.era.from}–${slide.era.to}`} · {slide.era.seasons} temporada{slide.era.seasons > 1 ? 's' : ''}</p>
          <div class="era-head s2"><TeamBadge id={slide.era.orgId} name={slide.era.orgName} size="lg" /><h2 class="title">{slide.era.orgName}</h2></div>
          <p class="giant num s3"><span use:countUp={slide.era.titles}>0</span><small>título{slide.era.titles > 1 ? 's' : ''}</small></p>
          <p class="facts s4">
            {#if slide.era.majors.length}<span class="gold">{slide.era.majors.length} Major{slide.era.majors.length > 1 ? 's' : ''}</span>{/if}
            {#if slide.era.mvps}<span>{slide.era.mvps} MVP{slide.era.mvps > 1 ? 's' : ''}</span>{/if}
            <span>melhor rating {slide.era.bestRating.toFixed(2)}</span>
            {#if slide.era.bestHltv}<span>#{slide.era.bestHltv} na HLTV</span>{/if}
          </p>
        {:else if slide.kind === 'numbers'}
          <p class="wr-eyebrow s1">A carreira em números</p>
          <div class="wr-counters">
            <div class="wr-counter big s2"><b use:countUp={retro.totals.titles}>0</b><span>títulos em {retro.totals.events} campeonatos ({titleRate}%)</span></div>
            <div class="wr-counter s3"><b class="gold" use:countUp={retro.totals.majors}>0</b><span>Majors</span></div>
            <div class="wr-counter s3"><b use:countUp={retro.totals.mvps}>0</b><span>MVPs{retro.totals.majorMvps ? ` · ${retro.totals.majorMvps} de Major` : ''}</span></div>
            <div class="wr-counter s4"><b use:countUp={retro.totals.finalsWon}>0</b><span>finais ganhas de {retro.totals.finals} ({finalsRate}%)</span></div>
            <div class="wr-counter s4"><b use:countUp={retro.totals.hltvTop1}>0</b><span>vez{retro.totals.hltvTop1 === 1 ? '' : 'es'} melhor do mundo{retro.totals.bestHltv && !retro.totals.hltvTop1 ? ` · melhor: #${retro.totals.bestHltv}` : ''}</span></div>
          </div>
        {:else if slide.kind === 'best' && retro.bestSeason}
          <p class="wr-eyebrow s1">A temporada</p>
          <p class="giant year s2">{retro.bestSeason.year}</p>
          <div class="team-line s3"><TeamBadge id={retro.bestSeason.orgId} name={retro.bestSeason.orgName} size="lg" /><span><b>{retro.bestSeason.titles} títulos</b>{retro.bestSeason.majors ? `, ${retro.bestSeason.majors} Major${retro.bestSeason.majors > 1 ? 's' : ''}` : ''} na {retro.bestSeason.orgName}. Rating {retro.bestSeason.rating.toFixed(2)}{retro.bestSeason.hltvRank ? `, #${retro.bestSeason.hltvRank} da HLTV` : ''}.</span></div>
        {:else if slide.kind === 'majors'}
          <p class="wr-eyebrow s1">Os Majors</p>
          <h2 class="title s2"><span use:countUp={retro.majorTitles.length}>0</span> taça{retro.majorTitles.length > 1 ? 's' : ''} de Major</h2>
          <ul class="tickets">
            {#each retro.majorTitles.slice(0, 9) as major, i (major.name + major.year)}
              <li style={`--i:${i}`}><b>{major.name.replace(/\s\d{4}$/, '')}</b><span>{major.year}{major.mvp ? ' · MVP' : ''}</span></li>
            {/each}
            {#if retro.majorTitles.length > 9}<li class="more" style="--i:9"><b>+{retro.majorTitles.length - 9}</b><span>outros</span></li>{/if}
          </ul>
        {:else if slide.kind === 'plays'}
          <p class="wr-eyebrow s1">As jogadas</p>
          <div class="wr-counters three">
            <div class="wr-counter s2"><b use:countUp={retro.totals.aces}>0</b><span>aces</span></div>
            <div class="wr-counter s2"><b use:countUp={retro.totals.quads}>0</b><span>4Ks</span></div>
            <div class="wr-counter s2"><b use:countUp={retro.totals.clutches}>0</b><span>clutches</span></div>
          </div>
          {#if retro.topPlays.length}
            <ol class="plays s3">
              {#each retro.topPlays.slice(0, 3) as play, i (i)}
                <li style={`--i:${i}`}><span class="play-tag">{PLAY_LABEL(play)}</span><span><b>{play.map}</b> · round {play.round} · vs {play.opponent}</span><span class="muted">{play.event}</span></li>
              {/each}
            </ol>
          {/if}
        {:else}
          <p class="wr-eyebrow s1">{retro.becameCoach ? `Virou coach aos ${retro.endAge}` : `Pendurou o mouse aos ${retro.endAge}`}</p>
          <h2 class="title s2">Pico de <span class="lime">{retro.totals.bestOverall}</span> em {retro.totals.peakYear}</h2>
          {#if curvePoints}
            <svg class="curve" viewBox="-6 -6 612 168" preserveAspectRatio="none" role="img" aria-label="Curva de overall da carreira">
              <polyline points={curvePoints} fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            </svg>
          {/if}
          <div class="outro-actions s4">
            <button class="cta" on:click|stopPropagation={onClose}>Ver o resumo</button>
            <button class="wr-btn wr-wide" on:click|stopPropagation={() => go(0)}>Rever</button>
            {#if onNewCareer}<button class="wr-btn wr-wide" on:click|stopPropagation={onNewCareer}>Nova carreira</button>{/if}
          </div>
        {/if}
      </section>
    {/key}
  </div>
</div>

<style>
  .wrapped {
    --display: 'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif;
    --tone: var(--accent, #d6f05a);
    position: fixed; inset: 0; z-index: 80; display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px;
    padding: 14px clamp(16px, 4vw, 48px) clamp(16px, 4vw, 40px);
    background:
      radial-gradient(90% 70% at 85% 10%, color-mix(in srgb, var(--tone) 22%, transparent), transparent 60%),
      radial-gradient(80% 60% at 0% 100%, color-mix(in srgb, var(--tone) 10%, transparent), transparent 70%),
      var(--bg, #0b0d10);
    color: var(--text, #f2f4f0);
    outline: none;
    transition: background .5s ease;
  }
  .tone-gold { --tone: var(--gold, #d9a441); }
  .tone-orange { --tone: var(--accent-2, #ff8a3d); }
  .tone-ice { --tone: #7fd3ff; }
  .bars { display: flex; gap: 4px; }
  .bar { flex: 1; height: 3px; overflow: hidden; background: color-mix(in srgb, var(--text, #fff) 18%, transparent); }
  .bar i { display: block; width: 0; height: 100%; background: var(--tone); }
  .bar.done i { width: 100%; }
  .bar i.run { animation: fill linear forwards; }
  .bar i.run.paused { animation-play-state: paused; }
  @keyframes fill { from { width: 0; } to { width: 100%; } }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .wr-brand { color: var(--tone); font: 800 12px/1 var(--body, sans-serif); letter-spacing: .14em; text-transform: uppercase; }
  .top-actions { display: flex; gap: 6px; }
  .wr-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 12px; border: 1px solid color-mix(in srgb, var(--text, #fff) 22%, transparent); background: color-mix(in srgb, var(--bg, #000) 40%, transparent); color: var(--text, #fff); font: 700 12px/1 var(--body, sans-serif); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
  .wr-btn:hover { border-color: var(--tone); color: var(--tone); }
  .wr-btn.close { width: 36px; padding: 0; }
  .wr-btn:focus-visible, .cta:focus-visible, .stage:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
  .stage { display: grid; align-items: center; min-height: 0; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
  .slide { display: grid; align-content: center; gap: clamp(10px, 2vh, 22px); width: min(1100px, 100%); margin: 0 auto; }
  .wr-eyebrow { margin: 0; color: var(--tone); font: 800 clamp(12px, 1.4vw, 15px)/1.2 var(--body, sans-serif); letter-spacing: .16em; text-transform: uppercase; }
  .giant { margin: 0; font: 900 clamp(84px, 17vw, 230px)/.82 var(--display); letter-spacing: -.01em; text-transform: uppercase; overflow-wrap: anywhere; }
  .giant.year { color: var(--tone); font-variant-numeric: tabular-nums; }
  .giant.num { display: flex; align-items: baseline; gap: 16px; color: var(--tone); font-variant-numeric: tabular-nums; }
  .giant.num small { color: var(--text, #fff); font-size: clamp(22px, 3.4vw, 44px); letter-spacing: .02em; }
  .title { margin: 0; font: 900 clamp(34px, 6vw, 76px)/.95 var(--display); text-transform: uppercase; }
  .lede { margin: 0; max-width: 34ch; color: var(--tone); font: 600 clamp(18px, 2.6vw, 30px)/1.3 var(--body, sans-serif); }
  .hint { margin: 0; color: var(--muted, #8b939b); font-size: 13px; }
  .lime { color: var(--accent, #d6f05a); }
  .gold { color: var(--gold, #d9a441); }
  .muted { color: var(--muted, #8b939b); }
  .team-line { display: flex; align-items: center; gap: 16px; max-width: 760px; font-size: clamp(17px, 2.4vw, 26px); line-height: 1.35; }
  .team-line b { color: var(--tone); }
  .era-head { display: flex; align-items: center; gap: 18px; }
  .facts { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; color: var(--muted, #8b939b); font: 700 clamp(15px, 2vw, 22px)/1.3 var(--body, sans-serif); }
  .facts span { color: var(--text, #fff); }
  .facts .gold { color: var(--gold, #d9a441); }
  .stairs { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .stairs li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; align-items: center; gap: 12px; padding: 8px 12px; margin-left: calc(var(--i) * clamp(6px, 2vw, 26px)); border-left: 3px solid color-mix(in srgb, var(--text, #fff) 25%, transparent); background: color-mix(in srgb, var(--bg, #000) 55%, transparent); font-size: 15px; animation: rise .5s cubic-bezier(.16, 1, .3, 1) both; animation-delay: calc(120ms + var(--i) * 90ms); }
  .stairs li.top { border-left-color: var(--gold, #d9a441); }
  .stairs b { overflow: hidden; font: 800 clamp(16px, 2vw, 22px)/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .chip { padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--text, #fff) 22%, transparent); color: var(--muted, #8b939b); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .years { color: var(--muted, #8b939b); font-variant-numeric: tabular-nums; }
  .count { color: var(--tone); font-weight: 800; }
  .wr-counters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(10px, 2vw, 22px); }
  .wr-counters.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .wr-counter { display: grid; gap: 4px; padding: clamp(12px, 2vw, 20px); border-top: 2px solid color-mix(in srgb, var(--tone) 60%, transparent); background: color-mix(in srgb, var(--bg, #000) 50%, transparent); }
  .wr-counter.big { grid-column: 1 / -1; }
  .wr-counter b { font: 900 clamp(48px, 8vw, 110px)/.9 var(--display); font-variant-numeric: tabular-nums; }
  .wr-counter.big b { color: var(--tone); font-size: clamp(72px, 13vw, 170px); }
  .wr-counter span { color: var(--muted, #8b939b); font-size: clamp(13px, 1.6vw, 17px); }
  .tickets { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
  .tickets li { display: grid; gap: 4px; padding: 14px 16px; border: 1px solid var(--gold, #d9a441); background: linear-gradient(135deg, color-mix(in srgb, var(--gold, #d9a441) 26%, transparent), color-mix(in srgb, var(--gold, #d9a441) 6%, transparent)); animation: rise .45s cubic-bezier(.16, 1, .3, 1) both; animation-delay: calc(150ms + var(--i) * 70ms); }
  .tickets b { font: 800 18px/1.1 var(--display); text-transform: uppercase; }
  .tickets span { color: var(--gold, #d9a441); font-weight: 700; font-size: 13px; }
  .tickets .more { border-style: dashed; background: none; }
  .plays { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .plays li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 12px; background: color-mix(in srgb, var(--bg, #000) 55%, transparent); animation: rise .45s cubic-bezier(.16, 1, .3, 1) both; animation-delay: calc(300ms + var(--i) * 100ms); }
  .play-tag { padding: 4px 8px; background: var(--tone); color: #0b0d10; font: 800 12px/1 var(--body, sans-serif); letter-spacing: .06em; text-transform: uppercase; }
  .curve { width: 100%; height: clamp(140px, 26vh, 260px); color: var(--accent, #d6f05a); }
  .curve { clip-path: inset(0 100% 0 0); animation: reveal 2.2s cubic-bezier(.65, 0, .35, 1) .3s forwards; }
  @keyframes reveal { to { clip-path: inset(0 0 0 0); } }
  .outro-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .cta { min-height: 48px; padding: 0 22px; border: 0; background: var(--accent, #d6f05a); color: #0b0d10; font: 900 16px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; cursor: pointer; }
  .wr-btn.wr-wide { min-height: 48px; padding: 0 18px; }
  .s1, .s2, .s3, .s4 { animation: rise .6s cubic-bezier(.16, 1, .3, 1) both; }
  .s2 { animation-delay: .12s; }
  .s3 { animation-delay: .3s; }
  .s4 { animation-delay: .5s; }
  @keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
  .reduced .s1, .reduced .s2, .reduced .s3, .reduced .s4, .reduced .stairs li, .reduced .tickets li, .reduced .plays li { animation: none; }
  .reduced .curve { animation: none; clip-path: none; }
  @media (prefers-reduced-motion: reduce) {
    .s1, .s2, .s3, .s4, .stairs li, .tickets li, .plays li { animation: none; }
    .curve { animation: none; clip-path: none; }
    .wrapped { transition: none; }
  }
  @media (max-width: 640px) {
    .stairs li { grid-template-columns: auto minmax(0, 1fr) auto; margin-left: 0; }
    .stairs .chip, .stairs .count { display: none; }
    .wr-counters.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .team-line { flex-direction: column; align-items: flex-start; }
  }
</style>
