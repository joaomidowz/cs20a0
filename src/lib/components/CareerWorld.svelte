<script lang="ts">
  // Tela Mundo da Carreira: ranking de times, ranking de jogadores (D7b), trocas da temporada e os
  // campeonatos de Major, Tier S e Tier A do mundo. Os dados saem de worldView.ts (puro); aqui é só desenho. Resultado
  // só até o mês da sua temporada; o campeonato que o circuito ainda calcula em segundo plano mostra carregamento na
  // própria linha, e a tela relê o cache a cada 2 s sem travar nada.
  import { onMount } from 'svelte';
  import CareerHltvTop from './CareerHltvTop.svelte';
  import TeamBadge from './TeamBadge.svelte';
  import { honorsIndex, type PlayerHonors } from '$lib/game/playerCareer/honors';
  import { playerRankingView, type PlayerRankingView } from '$lib/game/playerCareer/playerRanking';
  import { teamRanking } from '$lib/game/playerCareer/ranking';
  import {
    careerClock,
    rankingView,
    worldEventsView,
    worldMovesView,
    type RankingView,
    type WorldEventRow,
    type WorldEventsView,
    type WorldMoveGroup
  } from '$lib/game/playerCareer/worldView';
  import type { PlayerCareerState } from '$lib/game/playerCareer/engine';

  export let state: PlayerCareerState;
  /** Abre a ficha do time (a mesma do adversário). */
  export let onTeam: (orgId: string) => void = () => {};

  const TABS = [
    { key: 'ranking', label: 'Ranking' },
    { key: 'top', label: 'Top jogadores' },
    { key: 'trocas', label: 'Trocas' },
    { key: 'campeonatos', label: 'Campeonatos' }
  ] as const;
  type WorldTab = (typeof TABS)[number]['key'];
  const RANKING_TOP = 30;
  const MONTH_NAME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  let tab: WorldTab = 'ranking';
  let showAll = false;
  let tick = 0;
  let events: WorldEventsView | null = null;
  let ranking: RankingView | null = null;
  let top: PlayerRankingView | null = null;
  let moves: WorldMoveGroup[] = [];
  let honors: Map<string, PlayerHonors> | null = null;

  /** Relê a aba aberta e os campeonatos (que dizem se ainda há resultado calculando). Só leitura de cache. */
  function refresh(_tick: number, active: WorldTab, current: PlayerCareerState, all: boolean) {
    events = worldEventsView(current);
    ranking = active === 'ranking' ? rankingView(teamRanking(current, careerClock(current)), current.orgId, all ? Number.POSITIVE_INFINITY : RANKING_TOP) : null;
    top = active === 'top' ? playerRankingView(current) : null;
    honors = active === 'top' ? honorsIndex(current) : null;
    moves = active === 'trocas' ? worldMovesView(current) : [];
  }
  $: refresh(tick, tab, state, showAll);
  $: honorsOf = (nick: string): PlayerHonors | null => honors?.get(nick.toLowerCase()) ?? null;
  $: until = !events ? '' : events.month === 0 ? 'Pré-temporada' : events.month >= 12 ? 'Temporada encerrada' : `Até ${MONTH_NAME[events.month - 1]}`;

  onMount(() => {
    const timer = setInterval(() => {
      if ((events && events.computing > 0) || (top && top.pending > 0)) tick += 1;
    }, 2000);
    return () => clearInterval(timer);
  });

  const youLine = (row: WorldEventRow) => (row.mine === 'qualifier' ? 'Sua qualificatória' : row.myPlacement ? `Você: ${row.myPlacement}` : 'No seu calendário');
  const rankLabel = (row: RankingView['rows'][number]) =>
    `${row.rank}º ${row.name}, ${row.tierLabel}, ${row.pointsLabel} pontos${row.trend === 'up' ? `, subiu ${Math.abs(row.delta)}` : row.trend === 'down' ? `, caiu ${Math.abs(row.delta)}` : ''}. Abrir o time`;
</script>

<div class="world">
  <div class="world-tabs" role="tablist" aria-label="Seções do Mundo">
    {#each TABS as item (item.key)}
      <button type="button" role="tab" id={`world-tab-${item.key}`} aria-selected={tab === item.key} aria-controls="world-panel" class:on={tab === item.key} on:click={() => (tab = item.key)}>{item.label}</button>
    {/each}
  </div>

  <div class="world-panel" id="world-panel" role="tabpanel" aria-labelledby={`world-tab-${tab}`}>
    {#if tab === 'ranking' && ranking}
      <p class="world-note">{until}. Pontos dos últimos 12 meses pelo tier do campeonato, a colocação e a força do elenco. Toque num time para ver o elenco.</p>
      <ol class="rank-list">
        {#each ranking.rows as row (row.orgId)}
          <li class:mine={row.mine} class:gap={row.gap}>
            <button type="button" class="rank-row" aria-label={rankLabel(row)} on:click={() => onTeam(row.orgId)}>
              <span class="rk">{row.rank}</span>
              <span class="trend {row.trend}">
                {#if row.trend === 'up'}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5l8 11H4z" /></svg>
                {:else if row.trend === 'down'}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 19L4 8h16z" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 12h12" /></svg>
                {/if}
                {#if row.trend !== 'same'}<span>{row.deltaLabel}</span>{/if}
              </span>
              <TeamBadge id={row.orgId} name={row.name} size="sm" highlight={row.mine} />
              <span class="rk-name">
                <b>{row.name}{row.mine ? ' · você' : ''}</b>
                <small>{row.tierLabel} · <abbr title={row.regionName}>{row.regionLabel}</abbr></small>
              </span>
              <span class="rk-pts">{row.pointsLabel}<small>pts</small></span>
            </button>
          </li>
        {/each}
      </ol>
      {#if ranking.total > RANKING_TOP}
        <button type="button" class="world-more" on:click={() => (showAll = !showAll)}>{showAll ? `Mostrar só o top ${RANKING_TOP}` : `Ver os ${ranking.total} times`}</button>
      {/if}
    {:else if tab === 'top' && top}
      <p class="world-note">{until}. Ranking dos últimos 12 meses: anda no fim de cada bloco de campeonatos{top.blocksTotal ? ` (${top.blocksClosed} de ${top.blocksTotal} blocos fechados)` : ''}{top.baseWeight > 0 ? `; o ranking real da HLTV ainda pesa ${Math.round(top.baseWeight * 100)}%` : ''}.{top.pending ? ` ${top.pending} campeonato${top.pending === 1 ? '' : 's'} do mundo ainda calculando: o ranking muda quando terminarem.` : ''}</p>
      <CareerHltvTop year={top.year} top={top.rows} myRank={top.myRank} live={true} compact={true} {honorsOf} />
    {:else if tab === 'trocas'}
      {#if !moves.length}
        <p class="world-empty">Nenhuma troca no mundo nesta temporada. O mercado mexe na virada do ano.</p>
      {:else}
        {#each moves as group (group.kind)}
          <section class="moves" aria-label={group.label}>
            <h4 class="world-h">{group.label}<small>{group.lines.length}</small></h4>
            <ul class="move-list">
              {#each group.lines as line (line.key)}
                <li class="move {group.kind}">
                  {#if line.orgId}<TeamBadge id={line.orgId} name={line.orgName} size="sm" />{:else}<span class="mv-dot" aria-hidden="true"></span>{/if}
                  <span class="mv-copy"><b>{line.nick}</b><span>{line.detail}</span><small>{line.note}</small></span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    {:else if tab === 'campeonatos' && events}
      <p class="world-note">{until}. Majors, Tier S e Tier A do mundo em {events.year}. Resultado só do que já aconteceu no seu calendário.</p>
      <section class="evs" aria-label="Campeonatos já jogados">
        <h4 class="world-h">Já jogados<small>{events.done.length}</small></h4>
        {#if !events.done.length}
          <p class="world-empty">Nenhum campeonato do mundo terminou ainda nesta temporada.</p>
        {:else}
          <ul class="ev-list">
            {#each events.done as row (row.key)}
              <li class="ev" class:mine={row.mine !== null}>
                <div class="ev-head">
                  <span class="ev-when">{row.monthLabel}</span>
                  <b class="ev-name">{row.name}</b>
                  <span class="ev-tier" class:major={row.tier === 'Major'}>{row.tierLabel}</span>
                  {#if row.mine}<span class="ev-you">{youLine(row)}</span>{/if}
                </div>
                {#if row.status === 'computing'}
                  <p class="ev-loading" role="status"><i aria-hidden="true"></i>Calculando o resultado</p>
                {:else}
                  <dl class="ev-podium">
                    {#if row.champion}
                      <div class="champ"><dt>Campeão</dt><dd>{#if row.champion.orgId}<TeamBadge id={row.champion.orgId} name={row.champion.name} size="sm" highlight={row.champion.mine} />{/if}<b>{row.champion.name}</b></dd></div>
                    {/if}
                    {#if row.runnerUp}
                      <div><dt>Vice</dt><dd>{#if row.runnerUp.orgId}<TeamBadge id={row.runnerUp.orgId} name={row.runnerUp.name} size="sm" highlight={row.runnerUp.mine} />{/if}<b>{row.runnerUp.name}</b></dd></div>
                    {/if}
                    {#if row.mvp}
                      <div class="mvp"><dt>MVP</dt><dd><b>{row.mvp.you ? `${row.mvp.nick} · você` : row.mvp.nick}</b><small>{row.mvp.team} · {row.mvp.rating.toFixed(2)}</small></dd></div>
                    {/if}
                  </dl>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      <section class="evs" aria-label="Próximos campeonatos">
        <h4 class="world-h">Próximos<small>{events.upcoming.length}</small></h4>
        {#if !events.upcoming.length}
          <p class="world-empty">O circuito do mundo desta temporada acabou. Os próximos aparecem na virada do ano.</p>
        {:else}
          <ul class="ev-list">
            {#each events.upcoming as row (row.key)}
              <li class="ev upcoming" class:mine={row.mine !== null}>
                <div class="ev-head">
                  <span class="ev-when">{row.monthLabel}</span>
                  <b class="ev-name">{row.name}</b>
                  <span class="ev-tier" class:major={row.tier === 'Major'}>{row.tierLabel}</span>
                  {#if row.mine}<span class="ev-you">{youLine(row)}</span>{/if}
                </div>
                <p class="ev-field">{row.field}</p>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .world { display: grid; gap: 12px; min-width: 0; }
  /* Celular: 2 x 2, nada corta nem rola de lado. Fica presa no topo do modal ao rolar a lista. */
  .world-tabs { position: sticky; top: 0; z-index: 2; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding-block: 4px 8px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .world-tabs button { min-width: 0; min-height: 40px; padding: 6px 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); font: 800 12px/1.15 var(--body); letter-spacing: .06em; text-align: center; text-transform: uppercase; overflow-wrap: anywhere; cursor: pointer; transition: border-color .14s ease, color .14s ease; }
  .world-tabs button:hover { color: var(--text); }
  .world-tabs button.on { border-color: var(--accent); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
  .world-panel { display: grid; gap: 10px; min-width: 0; }
  .world-note { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
  .world-empty { margin: 0; padding: 12px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px; }
  .world-h { display: flex; align-items: baseline; gap: 8px; margin: 4px 0 6px; color: var(--muted); font: 800 12px/1.2 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .world-h small { color: var(--text); font-size: 12px; }
  .world-more { justify-self: center; min-height: 40px; padding: 0 14px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 700 12px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .world-more:hover { border-color: var(--accent); color: var(--accent); }

  .rank-list { display: grid; margin: 0; padding: 0; list-style: none; }
  .rank-list li.gap { margin-top: 10px; border-top: 1px dashed var(--line); }
  .rank-row { display: grid; grid-template-columns: 24px 38px 26px minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; min-height: 46px; padding: 6px 4px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .rank-row:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .mine .rank-row { background: color-mix(in srgb, var(--accent) 12%, transparent); border-bottom-color: var(--accent); }
  .rk { color: var(--muted); font: 900 17px/1 var(--display); font-variant-numeric: tabular-nums; text-align: right; }
  .trend { display: inline-flex; align-items: center; gap: 2px; font: 700 11px/1 var(--body); font-variant-numeric: tabular-nums; }
  .trend svg { flex: none; width: 10px; height: 10px; }
  .trend.up { color: var(--accent); }
  .trend.down { color: var(--accent-2); }
  .trend.same { color: var(--muted); }
  .rk-name { display: grid; gap: 2px; min-width: 0; }
  .rk-name b { overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .mine .rk-name b { color: var(--accent); }
  .rk-name small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .rk-name abbr { text-decoration: none; }
  .rk-pts { display: grid; justify-items: end; gap: 2px; font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; }
  .rk-pts small { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; }

  .moves { display: grid; gap: 2px; }
  .move-list { display: grid; margin: 0; padding: 0; list-style: none; }
  .move { display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: start; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--line); }
  .move.vaga { padding-left: 8px; border-left: 3px solid var(--accent); }
  .mv-dot { width: 26px; height: 26px; border: 1px dashed var(--line); }
  .mv-copy { display: grid; gap: 2px; min-width: 0; }
  .mv-copy b { font: 800 15px/1.1 var(--display); text-transform: uppercase; overflow-wrap: anywhere; }
  .mv-copy span { font-size: 13px; overflow-wrap: anywhere; }
  .mv-copy small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }

  .evs { display: grid; gap: 2px; }
  .ev-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .ev { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-left-width: 3px; background: var(--surface-2); }
  .ev.mine { border-left-color: var(--accent); }
  .ev.upcoming { background: transparent; }
  .ev-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 4px 10px; }
  .ev-when { color: var(--muted); font: 800 12px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .ev-name { min-width: 0; font: 800 17px/1.1 var(--display); text-transform: uppercase; overflow-wrap: anywhere; }
  .ev-tier { padding: 3px 6px; border: 1px solid var(--line); color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .ev-tier.major { border-color: var(--gold, #d9a441); color: var(--gold, #d9a441); }
  .ev-you { grid-column: 1 / -1; color: var(--accent); font: 700 12px/1.2 var(--body); }
  .ev-podium { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 6px 14px; margin: 0; }
  .ev-podium div { display: grid; gap: 3px; min-width: 0; }
  .ev-podium dt { color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .ev-podium dd { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 0; }
  .ev-podium dd b { min-width: 0; overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .ev-podium .champ dt { color: var(--gold, #d9a441); }
  .ev-podium .mvp dd { display: grid; gap: 2px; }
  .ev-podium dd small { color: var(--muted); font-size: 12px; }
  .ev-field { margin: 0; color: var(--muted); font-size: 13px; }
  .ev-loading { display: flex; align-items: center; gap: 10px; margin: 0; color: var(--muted); font-size: 13px; }
  .ev-loading i { position: relative; flex: none; width: 64px; height: 6px; overflow: hidden; background: color-mix(in srgb, var(--line) 80%, transparent); }
  .ev-loading i::after { content: ''; position: absolute; inset: 0; width: 40%; background: var(--accent); animation: world-load 1.1s ease-in-out infinite; }
  @keyframes world-load { from { transform: translateX(-100%); } to { transform: translateX(250%); } }

  @media (min-width: 560px) {
    .world-tabs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ev-loading i::after { width: 100%; opacity: .4; animation: none; }
  }
</style>
