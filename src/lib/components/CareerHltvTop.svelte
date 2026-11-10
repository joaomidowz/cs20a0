<script lang="ts">
  // Top 20 HLTV da Carreira: posição, escudo, jogador, time, idade e rating; você destacado e o Rookie of the Year ao
  // lado. Na tela Mundo é o ranking de jogadores dos últimos 12 meses: pontos no lugar do rating, o motivo de cada um e
  // os símbolos de títulos e MVPs.
  import TeamBadge from './TeamBadge.svelte';
  import CareerHonors from './CareerHonors.svelte';
  import type { RankedPlayer } from '$lib/game/playerCareer/engine';
  import type { PlayerHonors } from '$lib/game/playerCareer/honors';
  import { reasonsLabel } from '$lib/game/playerCareer/playerRanking';

  export let year: number;
  export let top: RankedPlayer[] = [];
  export let rookie: RankedPlayer | null = null;
  /** A sua posição quando você ficou fora do top 20 (null: jogou pouco para ranquear). */
  export let myRank: number | null = null;
  export let myRating: number | null = null;
  export let compact = false;
  /** Ranking ao vivo da tela Mundo (últimos 12 meses), não o prêmio do fim da temporada. */
  export let live = false;
  /** Títulos e MVPs por nick (símbolos ao lado do nome); sem ele, nada aparece. */
  export let honorsOf: ((nick: string) => PlayerHonors | null) | null = null;

  $: best = Math.max(1.0, ...top.map((player) => player.rating ?? 1));
  $: bestPoints = Math.max(1, ...top.map((player) => player.points ?? 0));
  const ratingClass = (rating: number | undefined) => (rating === undefined ? '' : rating >= 1.2 ? 'hot' : rating >= 1.08 ? 'good' : rating < 0.98 ? 'low' : '');
</script>

<section class="hltv" class:compact aria-label={live ? `Ranking de jogadores de ${year}` : `Top 20 HLTV de ${year}`}>
  <header class="hltv-head">
    <div>
      <p class="hltv-kicker">{live ? 'Ranking dos últimos 12 meses' : 'Ranking da temporada'}</p>
      <h3>Top 20 HLTV · {year}</h3>
    </div>
    {#if rookie}
      <div class="roty" class:you={rookie.you}>
        {#if rookie.teamId}<TeamBadge id={rookie.teamId} name={rookie.team} size="md" highlight={rookie.you} />{/if}
        <span class="roty-copy">
          <span class="roty-label">Rookie of the Year</span>
          <b>{rookie.you ? `${rookie.nick} (você)` : rookie.nick}</b>
          <span class="roty-meta">{rookie.team}{rookie.age ? ` · ${rookie.age} anos` : ''}{rookie.rating ? ` · rating ${rookie.rating.toFixed(2)}` : ''}</span>
        </span>
      </div>
    {/if}
  </header>

  <ol class="hltv-list">
    {#each top as player, index (player.nick + index)}
      <li class:you={player.you} class:podium={index < 3} class:first={index === 0}>
        <span class="rank">{index + 1}</span>
        {#if player.teamId}<TeamBadge id={player.teamId} name={player.team} size="sm" highlight={player.you} />{/if}
        <span class="who">
          <span class="who-top">
            <b>{player.nick}{player.you ? ' · você' : ''}</b>
            {#if honorsOf}<CareerHonors honors={honorsOf(player.nick)} />{/if}
          </span>
          <small>{player.team}{player.age ? ` · ${player.age} anos` : ''}</small>
          {#if player.reasons?.events}
            {@const why = player.reasons}
            <span class="season-line" title={reasonsLabel(why)}>
              <b class={ratingClass(why.rating)}>{(why.rating ?? 0).toFixed(2)}</b><span>rating</span>
              <span class="sep" aria-hidden="true">·</span><span>{why.events} camp.</span>
              {#if why.titles}<span class="sep" aria-hidden="true">·</span><span class="gold">{why.titles} {why.titles === 1 ? 'título' : 'títulos'}</span>{/if}
              {#if why.mvps}<span class="sep" aria-hidden="true">·</span><span class="mvp">{why.mvps} MVP{why.mvps > 1 ? 's' : ''}</span>{/if}
              {#if why.evps}<span class="sep" aria-hidden="true">·</span><span>{why.evps} EVP{why.evps > 1 ? 's' : ''}</span>{/if}
            </span>
          {:else if player.reasons}<small class="why">{reasonsLabel(player.reasons)}</small>{/if}
        </span>
        {#if player.points !== undefined}
          <span class="hl-rating hl-points" class:hot={index === 0}>
            {player.points.toLocaleString('pt-BR')}
            <small>pts</small>
            <i style={`width:${Math.max(10, Math.round((player.points / bestPoints) * 100))}%`}></i>
          </span>
        {:else}
          <span class="hl-rating {ratingClass(player.rating)}">
            {player.rating !== undefined ? player.rating.toFixed(2) : '—'}
            {#if player.rating !== undefined}<i style={`width:${Math.max(10, Math.round((player.rating - 0.9) / Math.max(0.05, best - 0.9) * 100))}%`}></i>{/if}
          </span>
        {/if}
      </li>
    {/each}
  </ol>

  {#if myRank && myRank > 20}
    <p class="me-out">{live ? 'Você está em' : 'Você ficou em'} <b>#{myRank}</b>{myRating ? ` com rating ${myRating.toFixed(2)}` : ''}. {live ? 'O rating em Major e Tier S é o que mais pesa; título, MVP e EVP somam por cima.' : 'Para entrar no Top 20, rating alto em Major e Tier S pesa mais.'}</p>
  {:else if myRank === null}
    <p class="me-out">{live ? 'Você entra no ranking com 4 campeonatos contados nos últimos 12 meses.' : 'Você jogou menos de 4 campeonatos e ficou fora do ranking.'}</p>
  {/if}
</section>

<style>
  .hltv { display: grid; gap: 12px; padding: 16px 18px; border: 1px solid var(--line); background: linear-gradient(160deg, color-mix(in srgb, var(--gold, #d9a441) 7%, var(--surface-2)), var(--surface-2) 45%); }
  .hltv-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
  .hltv-kicker { margin: 0 0 4px; color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .hltv-head h3 { margin: 0; font: 900 28px/1 var(--display); text-transform: uppercase; letter-spacing: .01em; }
  .roty { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--line); background: var(--surface); }
  .roty.you { border-color: var(--gold, #d9a441); box-shadow: 0 0 18px color-mix(in srgb, var(--gold, #d9a441) 30%, transparent); }
  .roty-copy { display: grid; gap: 2px; }
  .roty-label { color: var(--gold, #d9a441); font: 800 10px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .roty b { font: 900 18px/1 var(--display); text-transform: uppercase; }
  .roty-meta { color: var(--muted); font-size: 12px; }
  .hltv-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; grid-template-rows: repeat(10, auto); column-gap: 18px; row-gap: 2px; margin: 0; padding: 0; list-style: none; }
  .hltv-list li { display: grid; grid-template-columns: 30px auto minmax(0, 1fr) 76px; align-items: center; gap: 10px; padding: 6px 6px; border-bottom: 1px solid var(--line); }
  .hltv-list li.you { background: color-mix(in srgb, var(--accent) 12%, transparent); border-bottom-color: var(--accent); }
  .rank { color: var(--muted); font: 900 18px/1 var(--display); font-variant-numeric: tabular-nums; text-align: right; }
  .podium .rank { color: var(--text); }
  .first .rank { color: var(--gold, #d9a441); font-size: 22px; }
  .who { display: grid; gap: 2px; min-width: 0; }
  .who-top { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; min-width: 0; }
  .who-top b { min-width: 0; }
  .who b { overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .you .who b { color: var(--accent); }
  .who small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  /* O motivo dos pontos quebra linha: nada cortado no celular. */
  .who small.why { overflow: visible; color: color-mix(in srgb, var(--muted) 80%, var(--text)); line-height: 1.3; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }
  /* A temporada de cada um: rating, campeonatos, títulos, MVPs e EVPs, na mesma régua para todos. */
  .season-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 5px; color: var(--muted); font-size: 11px; line-height: 1.3; }
  .season-line b { color: var(--text); font: 800 13px/1 var(--display); font-variant-numeric: tabular-nums; }
  .season-line b.hot { color: var(--gold, #d9a441); }
  .season-line b.good { color: var(--accent); }
  .season-line .sep { opacity: .5; }
  .season-line .gold { color: var(--gold, #d9a441); }
  .season-line .mvp { color: var(--text); font-weight: 700; }
  .hl-rating { display: grid; gap: 3px; justify-items: end; font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; }
  .hl-rating i { display: block; width: 100%; height: 3px; background: var(--muted); justify-self: stretch; }
  .hl-rating.hot { color: var(--gold, #d9a441); }
  .hl-rating.hot i { background: var(--gold, #d9a441); }
  .hl-rating.good { color: var(--accent); }
  .hl-rating.good i { background: var(--accent); }
  .hl-rating.low { color: var(--muted); }
  .hl-points small { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; }
  .me-out { margin: 0; color: var(--muted); font-size: 13px; }
  .me-out b { color: var(--text); }
  .compact .hltv-head h3 { font-size: 22px; }
  @media (max-width: 760px) {
    .hltv-list { grid-template-columns: minmax(0, 1fr); grid-auto-flow: row; grid-template-rows: none; }
  }
  /* Celular: menos respiro na linha para sobrar espaço ao nick (a 320px a coluna do nome tinha ~50px). */
  @media (max-width: 520px) {
    .hltv { padding: 12px; }
    .hltv-list li { grid-template-columns: 24px auto minmax(0, 1fr) 60px; gap: 6px; padding: 6px 4px; }
  }
</style>
