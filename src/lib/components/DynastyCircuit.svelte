<script lang="ts">
  import type { Snippet } from 'svelte';
  import PlayoffBracket from './PlayoffBracket.svelte';
  import { CIRCUIT_PRIZES, isEventAvailable, isEventDone } from '$lib/game/dynasty/circuit';
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { buildBracket, revealRounds } from '$lib/game/majorOverview';
  import type { CircuitEvent, CircuitPlacement, CircuitState, HistoricalTeam, Language } from '$lib/game/types';

  export let circuit: CircuitState;
  export let language: Language = 'pt-BR';
  export let cash = 0;
  export let playing: string | null = null;
  export let teamById: Map<string, HistoricalTeam> = new Map();
  /** Live view of the event being played (bracket + series), rendered in place of the event cards. */
  export let live: Snippet | null = null;
  export let onPlay: (eventId: string) => void = () => {};
  export let onSkip: (eventId: string) => void = () => {};
  export let onContinue: () => void = () => {};

  const copy = {
    'pt-BR': { title: 'Circuito entre Majors', intro: 'Campeonatos menores valem prêmio e já entram no caixa antes da janela.', cash: 'Caixa', elite: 'Elite Series', open: 'Open Cup', invite: 'Convite', signup: 'Inscrição', play: 'Aceitar e jogar', signupPlay: 'Inscrever e jogar', skip: 'Pular', skipped: 'Pulado', locked: 'Libera com final no Open Cup #1', lockedShort: 'Bloqueado', simulating: 'Simulando…', opponents: 'Adversários', prizes: 'Prêmios', champion: 'Campeão', runnerUp: 'Vice', semi: 'Semifinal', quarter: 'Quartas', earned: 'Prêmio', continue: 'Seguir para a janela', quarterfinal: 'Quartas', semifinal: 'Semifinal', final: 'Final', tbd: 'A definir', live: 'Ao vivo', pending: 'Aguardando', realPool: 'Premiação real', organizer: 'Organização', location: 'Local', year: 'Ano' },
    es: { title: 'Circuito entre Majors', intro: 'Los torneos menores dan premio y entran en la caja antes de la ventana.', cash: 'Caja', elite: 'Elite Series', open: 'Open Cup', invite: 'Invitación', signup: 'Inscripción', play: 'Aceptar y jugar', signupPlay: 'Inscribirse y jugar', skip: 'Saltar', skipped: 'Saltado', locked: 'Se abre con final en el Open Cup #1', lockedShort: 'Bloqueado', simulating: 'Simulando…', opponents: 'Rivales', prizes: 'Premios', champion: 'Campeón', runnerUp: 'Subcampeón', semi: 'Semifinal', quarter: 'Cuartos', earned: 'Premio', continue: 'Ir a la ventana', quarterfinal: 'Cuartos', semifinal: 'Semifinal', final: 'Final', tbd: 'Por definir', live: 'En vivo', pending: 'Pendiente', realPool: 'Premio real', organizer: 'Organizador', location: 'Sede', year: 'Año' },
    en: { title: 'Circuit between Majors', intro: 'Smaller events pay prize money that reaches your cash before the window.', cash: 'Cash', elite: 'Elite Series', open: 'Open Cup', invite: 'Invite', signup: 'Sign-up', play: 'Accept and play', signupPlay: 'Sign up and play', skip: 'Skip', skipped: 'Skipped', locked: 'Unlocks with a final at Open Cup #1', lockedShort: 'Locked', simulating: 'Simulating…', opponents: 'Opponents', prizes: 'Prizes', champion: 'Champion', runnerUp: 'Runner-up', semi: 'Semifinal', quarter: 'Quarterfinal', earned: 'Prize', continue: 'Go to the window', quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Final', tbd: 'TBD', live: 'Live', pending: 'Pending', realPool: 'Real prize pool', organizer: 'Organizer', location: 'Location', year: 'Year' }
  } as const;
  const placements: readonly CircuitPlacement[] = ['champion', 'runnerUp', 'semi', 'quarter'];

  $: c = copy[language];
  $: allDone = circuit.events.every((event) => isEventDone(circuit, event.id) || !isEventAvailable(circuit, event));
  const resultOf = (event: CircuitEvent) => circuit.results.find((result) => result.eventId === event.id) ?? null;
  const columnsOf = (event: CircuitEvent) => buildBracket(revealRounds(circuit.brackets[event.id] ?? [], { liveSeriesId: null, complete: true }));
  const championOf = (event: CircuitEvent) => (circuit.brackets[event.id] ?? []).find((round) => round.phase === 'final')?.series[0]?.winnerId ?? null;
  const eventTitle = (event: CircuitEvent) => event.name ?? `${c[event.tier]} #${event.index}`;
  const teamName = (id: string) => teamById.get(id)?.name ?? id;
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
            <li class:hit={result?.placement === placement}><span>{c[placement]}</span><b>{formatUsd(CIRCUIT_PRIZES[event.tier][placement], language)}</b></li>
          {/each}
        </ul>
        <p class="opponents"><span>{c.opponents}</span> {event.teamIds.map(teamName).join(' · ')}</p>
        {#if result}
          <p class="sr-only">{c[result.placement]} · {c.earned} {formatUsd(result.prize, language)}</p>
          <div class="bracket"><PlayoffBracket columns={columnsOf(event)} userTeamId="user" championId={championOf(event)} labels={{ quarterfinal: c.quarterfinal, semifinal: c.semifinal, final: c.final, tbd: c.tbd, live: c.live, pending: c.pending }} /></div>
          <div class="action-bar result" aria-hidden="true"><span>{c[result.placement]} · {formatUsd(result.prize, language)}</span></div>
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
  .prizes li.hit { border-color: #d9a441; background: color-mix(in srgb, #d9a441 10%, var(--surface)); }
  .prizes li.hit span { color: #d9a441; font-weight: 800; }

  .real { display: grid; gap: 6px; min-width: 0; }
  .real strong { font: 900 1.05rem/1.15 'Arial Narrow', Impact, sans-serif; letter-spacing: .02em; overflow-wrap: anywhere; }
  .real dl { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; font-size: .7rem; color: var(--muted); }
  .real dl div { display: flex; gap: 5px; min-width: 0; }
  .real dt { font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  .real dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
  .opponents { margin: 0; font-size: .74rem; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .opponents span { color: var(--text); font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }

  .bracket { overflow-x: auto; max-width: 100%; margin-top: 2px; }

  .action-bar { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: auto; min-height: 44px; padding: 0 12px; border: 0; background: var(--accent); color: #0a0d08; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .action-bar.result { border: 1px solid #d9a441; background: color-mix(in srgb, #d9a441 12%, var(--surface)); color: #d9a441; }
  .action-bar.state { border: 1px dashed var(--line); background: var(--surface-2); color: var(--muted); }
  .action-bar.live { border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, var(--surface-2)); color: var(--accent); }
  .action-bar.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: circuitPulse 1.1s ease-in-out infinite; }
  @keyframes circuitPulse { 50% { opacity: .35; } }

  .continue { margin-top: 4px; }
  @media (prefers-reduced-motion: no-preference) { .event.done { animation: settle .35s ease-out; } }
  @keyframes settle { from { transform: translateY(6px); opacity: .5; } }
</style>
