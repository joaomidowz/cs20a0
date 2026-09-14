<script lang="ts">
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
  export let onPlay: (eventId: string) => void = () => {};
  export let onSkip: (eventId: string) => void = () => {};
  export let onContinue: () => void = () => {};

  const copy = {
    'pt-BR': { title: 'Circuito entre Majors', intro: 'Campeonatos menores valem prêmio e já entram no caixa antes da janela.', cash: 'Caixa', elite: 'Elite Series', open: 'Open Cup', invite: 'Convite', signup: 'Inscrição', play: 'Aceitar e jogar', signupPlay: 'Inscrever e jogar', skip: 'Pular', skipped: 'Pulado', locked: 'Libera com final no Open Cup #1', simulating: 'Simulando…', opponents: 'Adversários', prizes: 'Prêmios', champion: 'Campeão', runnerUp: 'Vice', semi: 'Semifinal', quarter: 'Quartas', earned: 'Prêmio', continue: 'Seguir para a janela', quarterfinal: 'Quartas', semifinal: 'Semifinal', final: 'Final', tbd: 'A definir', live: 'Ao vivo', pending: 'Aguardando' },
    es: { title: 'Circuito entre Majors', intro: 'Los torneos menores dan premio y entran en la caja antes de la ventana.', cash: 'Caja', elite: 'Elite Series', open: 'Open Cup', invite: 'Invitación', signup: 'Inscripción', play: 'Aceptar y jugar', signupPlay: 'Inscribirse y jugar', skip: 'Saltar', skipped: 'Saltado', locked: 'Se abre con final en el Open Cup #1', simulating: 'Simulando…', opponents: 'Rivales', prizes: 'Premios', champion: 'Campeón', runnerUp: 'Subcampeón', semi: 'Semifinal', quarter: 'Cuartos', earned: 'Premio', continue: 'Ir a la ventana', quarterfinal: 'Cuartos', semifinal: 'Semifinal', final: 'Final', tbd: 'Por definir', live: 'En vivo', pending: 'Pendiente' },
    en: { title: 'Circuit between Majors', intro: 'Smaller events pay prize money that reaches your cash before the window.', cash: 'Cash', elite: 'Elite Series', open: 'Open Cup', invite: 'Invite', signup: 'Sign-up', play: 'Accept and play', signupPlay: 'Sign up and play', skip: 'Skip', skipped: 'Skipped', locked: 'Unlocks with a final at Open Cup #1', simulating: 'Simulating…', opponents: 'Opponents', prizes: 'Prizes', champion: 'Champion', runnerUp: 'Runner-up', semi: 'Semifinal', quarter: 'Quarterfinal', earned: 'Prize', continue: 'Go to the window', quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Final', tbd: 'TBD', live: 'Live', pending: 'Pending' }
  } as const;
  const placements: readonly CircuitPlacement[] = ['champion', 'runnerUp', 'semi', 'quarter'];

  $: c = copy[language];
  $: allDone = circuit.events.every((event) => isEventDone(circuit, event.id) || !isEventAvailable(circuit, event));
  const resultOf = (event: CircuitEvent) => circuit.results.find((result) => result.eventId === event.id) ?? null;
  const columnsOf = (event: CircuitEvent) => buildBracket(revealRounds(circuit.brackets[event.id] ?? [], { liveSeriesId: null, complete: true }));
  const championOf = (event: CircuitEvent) => (circuit.brackets[event.id] ?? []).find((round) => round.phase === 'final')?.series[0]?.winnerId ?? null;
  const teamName = (id: string) => teamById.get(id)?.name ?? id;
</script>

<section class="circuit">
  <header class="circuit-head">
    <div><span class="eyebrow">DINASTIA · CIRCUIT</span><h2>{c.title}</h2><p>{c.intro}</p></div>
    <strong class="cash">{c.cash} <b>{formatUsd(cash, language)}</b></strong>
  </header>

  <div class="events">
    {#each circuit.events as event (event.id)}
      {@const result = resultOf(event)}
      {@const available = isEventAvailable(circuit, event)}
      <article class="event {event.tier}" class:done={Boolean(result)} class:skipped={circuit.skipped.includes(event.id)}>
        <header>
          <span class="tag">{event.access === 'invite' ? c.invite : c.signup}</span>
          <h3>{c[event.tier]} #{event.index}</h3>
        </header>
        <ul class="prizes" aria-label={c.prizes}>
          {#each placements as placement, index}
            <li class:hit={result?.placement === placement}><span>{c[placement]}</span><b>{formatUsd(CIRCUIT_PRIZES[event.tier][placement], language)}</b></li>
          {/each}
        </ul>
        <p class="opponents"><span>{c.opponents}</span> {event.teamIds.map(teamName).join(' · ')}</p>
        {#if result}
          <p class="earned">{c[result.placement]} · {c.earned} <b>{formatUsd(result.prize, language)}</b></p>
          <div class="bracket"><PlayoffBracket columns={columnsOf(event)} userTeamId="user" championId={championOf(event)} labels={{ quarterfinal: c.quarterfinal, semifinal: c.semifinal, final: c.final, tbd: c.tbd, live: c.live, pending: c.pending }} /></div>
        {:else if circuit.skipped.includes(event.id)}
          <p class="muted">{c.skipped}</p>
        {:else if !available}
          <p class="muted">{c.locked}</p>
        {:else}
          <div class="actions">
            <button class="primary" type="button" disabled={playing !== null} on:click={() => onPlay(event.id)}>{playing === event.id ? c.simulating : event.access === 'invite' ? c.play : c.signupPlay}</button>
            <button class="ghost" type="button" disabled={playing !== null} on:click={() => onSkip(event.id)}>{c.skip}</button>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  <button class="primary wide" type="button" disabled={!allDone || playing !== null} on:click={onContinue}>{c.continue} →</button>
</section>

<style>
  .circuit { display: grid; gap: 18px; min-width: 0; }
  .circuit-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px; }
  .circuit-head h2, .circuit-head p { margin: 0; } .circuit-head p { color: var(--muted); }
  .cash { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; } .cash b { color: var(--accent); font-size: 1.2rem; }
  .events { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); }
  .event { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 6%, var(--surface)), var(--surface)); }
  .event.elite { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .event.skipped { opacity: .6; }
  .event header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; } .event h3 { margin: 0; font-size: 1.3rem; }
  .tag { padding: 2px 8px; border: 1px solid var(--line); color: var(--muted); font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .prizes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .prizes li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; background: var(--surface-2); font-size: .74rem; }
  .prizes li.hit { outline: 1px solid var(--accent); } .prizes b { color: var(--accent); }
  .opponents { margin: 0; font-size: .74rem; color: var(--muted); overflow-wrap: anywhere; } .opponents span { color: var(--text); font-weight: 800; text-transform: uppercase; }
  .earned { margin: 0; font-weight: 800; } .earned b { color: var(--accent); }
  .muted { margin: 0; color: var(--muted); font-size: .8rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; } .actions button { flex: 1 1 140px; }
  .bracket { overflow-x: auto; max-width: 100%; }
  @media (prefers-reduced-motion: no-preference) { .event.done { animation: settle .35s ease-out; } }
  @keyframes settle { from { transform: translateY(6px); opacity: .5; } }
</style>
