<script lang="ts">
  import type { Snippet } from 'svelte';
  import PlayoffBracket from './PlayoffBracket.svelte';
  import RunStatsGrid from './RunStatsGrid.svelte';
  import SeriesViewer from './SeriesViewer.svelte';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import { CIRCUIT_PRIZES, hasGroupStage, isEventAvailable, isEventDone } from '$lib/game/dynasty/circuit';
  import TeamBadge from './TeamBadge.svelte';
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { buildBracket, revealRounds } from '$lib/game/majorOverview';
  import type { CircuitEvent, CircuitPlacement, CircuitState, HistoricalTeam, Language, SeriesResult } from '$lib/game/types';

  export let circuit: CircuitState;
  export let language: Language = 'pt-BR';
  export let cash = 0;
  export let playing: string | null = null;
  export let teamById: Map<string, HistoricalTeam> = new Map();
  /** Custom name of the user's organization; undefined keeps the translated default. */
  export let userTeamName: string | undefined = undefined;
  /** Live view of the event being played (bracket + series), rendered in place of the event cards. */
  export let live: Snippet | null = null;
  export let onPlay: (eventId: string) => void = () => {};
  export let onSkip: (eventId: string) => void = () => {};
  export let onContinue: () => void = () => {};
  /** Opens a team's roster (historical team id). */
  export let onTeam: ((teamId: string) => void) | null = null;

  const copy = {
    'pt-BR': { title: 'Circuito entre Majors', intro: 'Campeonatos menores valem prêmio e já entram no caixa antes da janela.', cash: 'Caixa', elite: 'Elite Series', open: 'Open Cup', invite: 'Convite', signup: 'Inscrição', play: 'Aceitar e jogar', signupPlay: 'Inscrever e jogar', skip: 'Pular', skipped: 'Pulado', locked: 'Libera com final no Open Cup anterior', lockedShort: 'Bloqueado', simulating: 'Simulando…', opponents: 'Adversários', prizes: 'Prêmios', champion: 'Campeão', runnerUp: 'Vice', semi: 'Semifinal', quarter: 'Quartas', groups: 'Fase de grupos', swiss: 'Grupos', format: '16 times · Suíço + playoffs', formatLegacy: '8 times · playoffs', earned: 'Prêmio', continue: 'Seguir para a janela', quarterfinal: 'Quartas', semifinal: 'Semifinal', final: 'Final', tbd: 'A definir', live: 'Ao vivo', pending: 'Aguardando', realPool: 'Premiação real', organizer: 'Organização', location: 'Local', year: 'Ano', details: 'Ver resultado', hideDetails: 'Fechar resultado', result: 'Resultado', placement: 'Colocação', gamePrize: 'Prêmio no jogo', record: 'Séries V-D', series: 'Séries do time', stats: 'Stats do evento', bracket: 'Chave', noStats: 'Evento jogado antes das stats do circuito: só a chave ficou salva.', closeSeries: 'Fechar série', win: 'Vitória', loss: 'Derrota' },
    es: { title: 'Circuito entre Majors', intro: 'Los torneos menores dan premio y entran en la caja antes de la ventana.', cash: 'Caja', elite: 'Elite Series', open: 'Open Cup', invite: 'Invitación', signup: 'Inscripción', play: 'Aceptar y jugar', signupPlay: 'Inscribirse y jugar', skip: 'Saltar', skipped: 'Saltado', locked: 'Se abre con final en el Open Cup anterior', lockedShort: 'Bloqueado', simulating: 'Simulando…', opponents: 'Rivales', prizes: 'Premios', champion: 'Campeón', runnerUp: 'Subcampeón', semi: 'Semifinal', quarter: 'Cuartos', groups: 'Fase de grupos', swiss: 'Grupos', format: '16 equipos · Suizo + playoffs', formatLegacy: '8 equipos · playoffs', earned: 'Premio', continue: 'Ir a la ventana', quarterfinal: 'Cuartos', semifinal: 'Semifinal', final: 'Final', tbd: 'Por definir', live: 'En vivo', pending: 'Pendiente', realPool: 'Premio real', organizer: 'Organizador', location: 'Sede', year: 'Año', details: 'Ver resultado', hideDetails: 'Cerrar resultado', result: 'Resultado', placement: 'Posición', gamePrize: 'Premio en el juego', record: 'Series V-D', series: 'Series del equipo', stats: 'Stats del torneo', bracket: 'Cuadro', noStats: 'Torneo jugado antes de las stats del circuito: solo se guardó el cuadro.', closeSeries: 'Cerrar serie', win: 'Victoria', loss: 'Derrota' },
    en: { title: 'Circuit between Majors', intro: 'Smaller events pay prize money that reaches your cash before the window.', cash: 'Cash', elite: 'Elite Series', open: 'Open Cup', invite: 'Invite', signup: 'Sign-up', play: 'Accept and play', signupPlay: 'Sign up and play', skip: 'Skip', skipped: 'Skipped', locked: 'Unlocks with a final at the previous Open Cup', lockedShort: 'Locked', simulating: 'Simulating…', opponents: 'Opponents', prizes: 'Prizes', champion: 'Champion', runnerUp: 'Runner-up', semi: 'Semifinal', quarter: 'Quarterfinal', groups: 'Group stage', swiss: 'Groups', format: '16 teams · Swiss + playoffs', formatLegacy: '8 teams · playoffs', earned: 'Prize', continue: 'Go to the window', quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Final', tbd: 'TBD', live: 'Live', pending: 'Pending', realPool: 'Real prize pool', organizer: 'Organizer', location: 'Location', year: 'Year', details: 'View result', hideDetails: 'Close result', result: 'Result', placement: 'Placement', gamePrize: 'In-game prize', record: 'Series W-L', series: 'Team series', stats: 'Event stats', bracket: 'Bracket', noStats: 'Event played before circuit stats existed: only the bracket was saved.', closeSeries: 'Close series', win: 'Win', loss: 'Loss' }
  } as const;
  const placements: readonly CircuitPlacement[] = ['champion', 'runnerUp', 'semi', 'quarter', 'groups'];

  $: c = copy[language];
  $: allDone = circuit.events.every((event) => isEventDone(circuit, event.id) || !isEventAvailable(circuit, event));
  const resultOf = (event: CircuitEvent) => circuit.results.find((result) => result.eventId === event.id) ?? null;
  const columnsOf = (event: CircuitEvent) => buildBracket(revealRounds(circuit.brackets[event.id] ?? [], { liveSeriesId: null, complete: true }));
  const championOf = (event: CircuitEvent) => (circuit.brackets[event.id] ?? []).find((round) => round.phase === 'final')?.series[0]?.winnerId ?? null;
  const eventTitle = (event: CircuitEvent) => event.name ?? `${c[event.tier]} #${event.index}`;
  const teamName = (id: string) => teamById.get(id)?.name ?? id;

  let openEventId: string | null = null;
  let openSeriesId: string | null = null;
  let seenResults = circuit.results.length;
  // A freshly settled event opens its result right away.
  $: if (circuit.results.length > seenResults) {
    seenResults = circuit.results.length;
    openEventId = circuit.results.at(-1)?.eventId ?? null;
    openSeriesId = null;
  }
  $: openEvent = circuit.events.find((event) => event.id === openEventId) ?? null;
  $: openResult = openEvent ? resultOf(openEvent) : null;
  $: openStats = openEvent ? circuit.stats?.[openEvent.id] ?? null : null;
  $: openSeries = openStats?.series.find((series) => series.id === openSeriesId) ?? null;
  $: record = openStats ? { wins: openStats.series.filter((series) => series.winnerId === 'user').length, losses: openStats.series.filter((series) => series.winnerId !== 'user').length } : null;
  const toggleDetails = (eventId: string) => { openEventId = openEventId === eventId ? null : eventId; openSeriesId = null; };
  const opponentOf = (series: SeriesResult) => (series.teamA.id === 'user' ? series.teamB : series.teamA);
  const userScore = (series: SeriesResult) => (series.teamA.id === 'user' ? `${series.scoreA}-${series.scoreB}` : `${series.scoreB}-${series.scoreA}`);
  $: tr = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: viewerLabels = { start: tr('startSeries'), skip: tr('skipMap'), round: tr('round'), live: tr('live'), map: tr('map'), final: tr('final'), waiting: tr('waiting'), pending: tr('pending'), inProgress: tr('inProgress'), mapInProgress: tr('mapInProgress'), veto: tr('veto'), ban: tr('ban'), pick: tr('pick'), decider: tr('decider'), notPlayed: tr('mapNotPlayed'), mapStart: tr('mapStart') };
  $: phaseName = (phase: string) => (phase === 'quarterfinal' ? c.quarterfinal : phase === 'semifinal' ? c.semifinal : phase === 'final' ? c.final : phase === 'swiss' ? c.swiss : phase);
</script>

<section class="circuit">
  <header class="circuit-head">
    <div>
      <span class="eyebrow">DINASTIA · CIRCUIT</span>
      <h2>{c.title}</h2>
      <p>{c.intro}</p>
    </div>
    <div class="cash-box"><span>{c.cash}</span><b>{formatUsd(cash, language)}</b></div>
  </header>

  {#if live}
    {@const liveEvent = circuit.events.find((event) => event.id === playing) ?? null}
    <section class="circuit-live">
      <header class="live-head">
        <span class="live-badge"><i></i>{c.simulating}</span>
        {#if liveEvent}<strong class="live-title">{eventTitle(liveEvent)}</strong>{/if}
      </header>
      {@render live()}
    </section>
  {:else}
  <div class="events">
    {#each circuit.events as event (event.id)}
      {@const result = resultOf(event)}
      {@const skipped = circuit.skipped.includes(event.id)}
      {@const available = !result && !skipped && isEventAvailable(circuit, event)}
      {@const locked = !result && !skipped && !available}
      {@const isPlaying = playing === event.id}
      {@const actionLabel = event.access === 'invite' ? c.play : c.signupPlay}
      <article
        class="event {event.tier}"
        class:done={Boolean(result)}
        class:skipped={skipped}
        class:locked={locked}
        class:actionable={available && playing === null}
        class:playing={isPlaying}
      >
        {#if available}
          <button class="hit" type="button" disabled={playing !== null} on:click={() => onPlay(event.id)}>
            <span class="sr-only">{actionLabel} — {eventTitle(event)}</span>
          </button>
          <button class="skip-chip" type="button" disabled={playing !== null} on:click={() => onSkip(event.id)}>{c.skip}</button>
        {/if}
        <header class="event-head">
          <h3>{c[event.tier]} <b>#{event.index}</b></h3>
          <span class="tag">{event.access === 'invite' ? c.invite : c.signup}</span>
        </header>
        {#if event.name}
          <div class="real">
            <strong>{event.name}</strong>
            <dl>
              {#if event.year}<div><dt class="sr-only">{c.year}</dt><dd>{event.year}</dd></div>{/if}
              {#if event.organizer}<div><dt>{c.organizer}</dt><dd>{event.organizer}</dd></div>{/if}
              {#if event.location}<div><dt>{c.location}</dt><dd>{event.location}</dd></div>{/if}
              {#if event.realPrizePool !== undefined}<div><dt>{c.realPool}</dt><dd>{formatUsd(event.realPrizePool, language)}</dd></div>{/if}
            </dl>
          </div>
        {/if}
        <ul class="prizes" aria-label={c.prizes}>
          {#each placements as placement}
            {#if placement !== 'groups' || hasGroupStage(event)}
              <li class:earned={result?.placement === placement}><span>{c[placement]}</span><b>{formatUsd(CIRCUIT_PRIZES[event.tier][placement], language)}</b></li>
            {/if}
          {/each}
        </ul>
        <p class="format">{hasGroupStage(event) ? c.format : c.formatLegacy}</p>
        <div class="opponents">
          <span>{c.opponents}</span>
          <ul class="opponent-list">
            {#each event.teamIds as teamId (teamId)}
              {@const team = teamById.get(teamId)}
              <li>
                {#if onTeam}
                  <button class="opponent" type="button" on:click={() => onTeam?.(teamId)}><TeamBadge id={teamId} name={team?.name ?? teamId} size="sm" /><span>{teamName(teamId)}</span></button>
                {:else}
                  <span class="opponent static"><TeamBadge id={teamId} name={team?.name ?? teamId} size="sm" /><span>{teamName(teamId)}</span></span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
        {#if result}
          {@const path = circuit.stats?.[event.id]?.series ?? []}
          {#if path.length}
            <ol class="path">
              {#each path as series (series.id)}
                {@const won = series.winnerId === 'user'}
                <li class:won><span>{phaseName(series.phase)}</span><em>{translateTeamName(language, opponentOf(series).name, userTeamName)}</em><b>{userScore(series)}</b></li>
              {/each}
            </ol>
          {/if}
          <p class="sr-only">{c[result.placement]} · {c.earned} {formatUsd(result.prize, language)}</p>
          <div class="result-strip place-{result.placement}" aria-hidden="true"><span>{c[result.placement]}</span><b>{formatUsd(result.prize, language)}</b></div>
          <button class="details-toggle place-{result.placement}" type="button" aria-expanded={openEventId === event.id} aria-controls="circuit-result" on:click={() => toggleDetails(event.id)}>{openEventId === event.id ? c.hideDetails : c.details}</button>
        {:else if skipped}
          <div class="action-bar state" aria-hidden="true"><span>{c.skipped}</span></div>
        {:else if locked}
          <p class="note">{c.locked}</p>
          <div class="action-bar state" aria-hidden="true"><span>{c.lockedShort}</span></div>
        {:else if isPlaying}
          <div class="action-bar live" aria-hidden="true"><i></i><span>{c.simulating}</span></div>
        {:else}
          <div class="action-bar" aria-hidden="true"><span>{actionLabel} →</span></div>
        {/if}
      </article>
    {/each}
  </div>

  {#if openEvent && openResult}
    <section id="circuit-result" class="result-panel place-{openResult.placement}" aria-label={c.result}>
      <header class="result-head">
        <div>
          <span class="eyebrow">{c.result}{openEvent.year ? ` · ${openEvent.year}` : ''}</span>
          <h3>{eventTitle(openEvent)}</h3>
        </div>
        <strong class="place">{c[openResult.placement]}</strong>
      </header>
      <dl class="summary">
        <div><dt>{c.placement}</dt><dd>{c[openResult.placement]}</dd></div>
        <div><dt>{c.gamePrize}</dt><dd>{formatUsd(openResult.prize, language)}</dd></div>
        {#if openEvent.realPrizePool !== undefined}<div><dt>{c.realPool}</dt><dd>{formatUsd(openEvent.realPrizePool, language)}</dd></div>{/if}
        {#if record}<div><dt>{c.record}</dt><dd>{record.wins}-{record.losses}</dd></div>{/if}
      </dl>

      {#if openStats}
        <div class="block">
          <h4>{c.series}</h4>
          <ul class="series-list">
            {#each openStats.series as series (series.id)}
              {@const won = series.winnerId === 'user'}
              <li>
                <button type="button" class="series-row" class:won class:active={openSeriesId === series.id} aria-expanded={openSeriesId === series.id} on:click={() => (openSeriesId = openSeriesId === series.id ? null : series.id)}>
                  <span class="phase">{phaseName(series.phase)}</span>
                  <span class="vs">{translateTeamName(language, opponentOf(series).name, userTeamName)}</span>
                  <b>{userScore(series)}</b>
                  <span class="outcome">{won ? c.win : c.loss}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if openSeries}
            <div class="viewer">
              {#key openSeries.id}
                <SeriesViewer series={openSeries} language={language} {userTeamName} controlled={true} controlledStarted={true} controlledFinished={true} controlledActiveMap={Math.max(0, openSeries.maps.length - 1)} controlledVisibleRounds={openSeries.maps.at(-1)?.rounds.length ?? 0} simpleFeed={true} phaseLabel={`${phaseName(openSeries.phase)} · MD${openSeries.bestOf}`} labels={viewerLabels} />
              {/key}
              <button class="secondary close-series" type="button" on:click={() => (openSeriesId = null)}>{c.closeSeries}</button>
            </div>
          {/if}
        </div>
        <div class="block">
          <h4>{c.stats}</h4>
          <RunStatsGrid stats={openStats.players} {language} compact={true} />
        </div>
      {:else}
        <p class="note">{c.noStats}</p>
      {/if}

      <div class="block">
        <h4>{c.bracket}</h4>
        <div class="bracket"><PlayoffBracket columns={columnsOf(openEvent)} userTeamId="user" {userTeamName} championId={championOf(openEvent)} labels={{ quarterfinal: c.quarterfinal, semifinal: c.semifinal, final: c.final, tbd: c.tbd, live: c.live, pending: c.pending }} /></div>
      </div>
    </section>
  {/if}
  {/if}

  {#if !live}
    <button class="primary wide continue" type="button" disabled={!allDone || playing !== null} on:click={onContinue}>{c.continue} →</button>
  {/if}
</section>

<style>
  .circuit { display: grid; gap: 18px; min-width: 0; }
  .circuit-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px 18px; }
  .circuit-head h2 { margin: 8px 0 6px; font-size: clamp(1.5rem, 3vw, 2rem); }
  .circuit-head p { margin: 0; max-width: 560px; color: var(--muted); line-height: 1.5; }
  .cash-box { display: grid; gap: 3px; padding: 10px 14px; border: 1px solid var(--line); background: var(--surface-2); }
  .cash-box span { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .cash-box b { color: var(--accent); font: 900 1.35rem/1 'Arial Narrow', Impact, sans-serif; }

  .circuit-live { display: grid; gap: 14px; min-width: 0; padding: 16px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 6%, var(--surface)), var(--surface)); }
  .live-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .live-badge { display: inline-flex; align-items: center; gap: 7px; color: #ff7676; font-size: .6rem; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
  .live-badge i { width: 7px; height: 7px; border-radius: 50%; background: #ff3b3b; box-shadow: 0 0 0 0 rgb(255 59 59 / 22%); animation: circuitPulse 1.1s ease-in-out infinite; }
  .live-title { font: 900 1.15rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .04em; text-transform: uppercase; }

  .events { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); align-items: stretch; }
  .event { position: relative; display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); background: linear-gradient(155deg, var(--surface-2), var(--surface)); }
  .event.elite { border-color: color-mix(in srgb, #d9a441 45%, var(--line)); }
  .event.skipped, .event.locked { opacity: .62; }
  .event.actionable:hover { border-color: var(--accent); transform: translateY(-3px); box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 8%, transparent); }
  .event.actionable { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }

  .hit { position: absolute; inset: 0; z-index: 1; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .hit:disabled { cursor: not-allowed; }
  .hit:focus-visible { outline: 2px solid var(--accent); outline-offset: -4px; }
  .skip-chip { position: relative; z-index: 2; margin-left: auto; min-height: 36px; padding: 0 12px; border: 1px dashed var(--line); color: var(--muted); background: var(--surface); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; transition: border-color .18s ease, color .18s ease; }
  .skip-chip:hover:not(:disabled) { border-color: var(--accent-2); color: var(--accent-2); }

  .event-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .event-head h3 { display: inline-flex; align-items: baseline; gap: 6px; margin: 0; padding: 5px 10px; border: 1px solid color-mix(in srgb, #d9a441 55%, var(--line)); color: #d9a441; background: color-mix(in srgb, #d9a441 9%, var(--surface)); font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .event-head h3 b { font: 900 .95rem/1 'Arial Narrow', Impact, sans-serif; }
  .event.open .event-head h3 { border-color: var(--line); color: var(--text); background: var(--surface-2); }
  .event-head .tag { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }

  .prizes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .prizes li { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 7px 9px; border: 1px solid var(--line); background: var(--surface-2); font-size: .72rem; }
  .prizes span { color: var(--muted); }
  .prizes b { color: var(--accent); font-weight: 800; white-space: nowrap; }
  .prizes li:first-child span { color: #d9a441; }
  .prizes li.earned { border-color: #d9a441; background: color-mix(in srgb, #d9a441 10%, var(--surface)); }
  .prizes li.earned span { color: #d9a441; font-weight: 800; }

  .real { display: grid; gap: 6px; min-width: 0; }
  .real strong { font: 900 1.05rem/1.15 'Arial Narrow', Impact, sans-serif; letter-spacing: .02em; overflow-wrap: anywhere; }
  .real dl { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; font-size: .7rem; color: var(--muted); }
  .real dl div { display: flex; gap: 5px; min-width: 0; }
  .real dt { font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  .real dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
  .path { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .path li { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 9px; border-left: 3px solid #d65a5a; background: var(--surface-2); font-size: .72rem; }
  .path li.won { border-left-color: var(--accent); }
  .path span { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .path em { overflow: hidden; font-style: normal; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
  .path b { font: 900 .95rem/1 'Arial Narrow', Impact, sans-serif; }
  .format { margin: 0; color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .opponents { position: relative; z-index: 2; display: grid; gap: 6px; margin: 0; font-size: .74rem; color: var(--muted); }
  .opponents > span { color: var(--text); font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .opponent-list { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .opponent { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 30px; padding: 2px 8px 2px 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); color: var(--text); font: 700 .68rem/1 Inter, Arial, sans-serif; cursor: pointer; transition: border-color .18s ease, color .18s ease; }
  .opponent.static { cursor: default; }
  .opponent > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.opponent:hover { border-color: var(--accent); color: var(--accent); }
  button.opponent:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }

  .bracket { overflow-x: auto; max-width: 100%; margin-top: 2px; }

  .action-bar { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: auto; min-height: 44px; padding: 0 12px; border: 0; background: var(--accent); color: #0a0d08; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .event, .result-panel { --place: var(--muted); }
  .place-champion { --place: #d9a441; }
  .place-runnerUp { --place: #c9d1d9; }
  .place-semi { --place: #c07a45; }
  .place-quarter { --place: #7d8a99; }
  .place-groups { --place: #6b7683; }
  .result-strip { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: auto; padding: 9px 12px; border-left: 4px solid var(--place); background: color-mix(in srgb, var(--place) 12%, var(--surface)); font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--place); }
  .result-strip b { font: 900 1.05rem/1 'Arial Narrow', Impact, sans-serif; color: var(--text); }
  .details-toggle { min-height: 44px; padding: 0 12px; border: 1px solid color-mix(in srgb, var(--place) 55%, var(--line)); color: var(--text); background: var(--surface-2); font-size: .7rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; transition: border-color .18s ease, background-color .18s ease; }
  .details-toggle:hover, .details-toggle[aria-expanded='true'] { border-color: var(--place); background: color-mix(in srgb, var(--place) 10%, var(--surface-2)); }
  .details-toggle:focus-visible, .series-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .result-panel { display: grid; gap: 16px; min-width: 0; padding: 16px; border: 1px solid color-mix(in srgb, var(--place) 45%, var(--line)); border-top: 4px solid var(--place); background: linear-gradient(160deg, color-mix(in srgb, var(--place) 7%, var(--surface)), var(--surface)); }
  .result-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 8px 16px; }
  .result-head h3 { margin: 6px 0 0; font: 900 clamp(1.2rem, 3vw, 1.6rem)/1.1 'Arial Narrow', Impact, sans-serif; overflow-wrap: anywhere; }
  .result-head .place { color: var(--place); font: 900 1.4rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); gap: 8px; margin: 0; }
  .summary div { display: grid; gap: 4px; min-width: 0; padding: 9px 11px; border: 1px solid var(--line); background: var(--surface-2); }
  .summary dt { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .summary dd { margin: 0; font: 900 1.1rem/1 'Arial Narrow', Impact, sans-serif; overflow-wrap: anywhere; }
  .block { display: grid; gap: 10px; min-width: 0; }
  .block h4 { margin: 0; color: var(--muted); font-size: .64rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .series-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .series-row { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto auto; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-left: 4px solid #d65a5a; color: var(--text); background: var(--surface-2); text-align: left; cursor: pointer; transition: border-color .18s ease, background-color .18s ease; }
  .series-row.won { border-left-color: var(--accent); }
  .series-row:hover, .series-row.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface-2)); }
  .series-row .phase, .series-row .outcome { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .series-row .vs { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; }
  .series-row b { font: 900 1.05rem/1 'Arial Narrow', Impact, sans-serif; }
  .viewer { display: grid; gap: 8px; min-width: 0; overflow-x: auto; }
  .close-series { justify-self: end; min-height: 40px; }
  @media (max-width: 480px) {
    .series-row { grid-template-columns: minmax(0, 1fr) auto; }
    .series-row .phase { grid-column: 1 / -1; }
  }
  .action-bar.state { border: 1px dashed var(--line); background: var(--surface-2); color: var(--muted); }
  .action-bar.live { border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, var(--surface-2)); color: var(--accent); }
  .action-bar.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: circuitPulse 1.1s ease-in-out infinite; }
  @keyframes circuitPulse { 50% { opacity: .35; } }

  .continue { margin-top: 4px; }
  @media (prefers-reduced-motion: no-preference) { .event.done, .result-panel { animation: settle .35s ease-out; } }
  @media (prefers-reduced-motion: reduce) { .event.actionable, .details-toggle, .series-row { transition: none; } .event.actionable:hover { transform: none; } }
  @keyframes settle { from { transform: translateY(6px); opacity: .5; } }
</style>
