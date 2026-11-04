<script lang="ts">
  // Top 20 HLTV da temporada da Carreira: posição, escudo, jogador, time, idade e rating; você destacado e o
  // Rookie of the Year ao lado.
  import TeamBadge from './TeamBadge.svelte';
  import type { RankedPlayer } from '$lib/game/playerCareer/engine';

  export let year: number;
  export let top: RankedPlayer[] = [];
  export let rookie: RankedPlayer | null = null;
  /** A sua posição quando você ficou fora do top 20 (null: jogou pouco para ranquear). */
  export let myRank: number | null = null;
  export let myRating: number | null = null;
  export let compact = false;

  $: best = Math.max(1.0, ...top.map((player) => player.rating ?? 1));
  const ratingClass = (rating: number | undefined) => (rating === undefined ? '' : rating >= 1.2 ? 'hot' : rating >= 1.08 ? 'good' : rating < 0.98 ? 'low' : '');
</script>

<section class="hltv" class:compact aria-label={`Top 20 HLTV de ${year}`}>
  <header class="hltv-head">
    <div>
      <p class="hltv-kicker">Ranking da temporada</p>
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
          <b>{player.nick}{player.you ? ' · você' : ''}</b>
          <small>{player.team}{player.age ? ` · ${player.age} anos` : ''}</small>
        </span>
        <span class="hl-rating {ratingClass(player.rating)}">
          {player.rating !== undefined ? player.rating.toFixed(2) : '—'}
          {#if player.rating !== undefined}<i style={`width:${Math.max(10, Math.round((player.rating - 0.9) / Math.max(0.05, best - 0.9) * 100))}%`}></i>{/if}
        </span>
      </li>
    {/each}
  </ol>

  {#if myRank && myRank > 20}
    <p class="me-out">Você ficou em <b>#{myRank}</b>{myRating ? ` com rating ${myRating.toFixed(2)}` : ''}. Para entrar no Top 20, rating alto em Major e Tier S pesa mais.</p>
  {:else if myRank === null}
    <p class="me-out">Você jogou menos de 4 campeonatos e ficou fora do ranking.</p>
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
  .who b { overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .you .who b { color: var(--accent); }
  .who small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .hl-rating { display: grid; gap: 3px; justify-items: end; font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; }
  .hl-rating i { display: block; width: 100%; height: 3px; background: var(--muted); justify-self: stretch; }
  .hl-rating.hot { color: var(--gold, #d9a441); }
  .hl-rating.hot i { background: var(--gold, #d9a441); }
  .hl-rating.good { color: var(--accent); }
  .hl-rating.good i { background: var(--accent); }
  .hl-rating.low { color: var(--muted); }
  .me-out { margin: 0; color: var(--muted); font-size: 13px; }
  .me-out b { color: var(--text); }
  .compact .hltv-head h3 { font-size: 22px; }
  @media (max-width: 760px) {
    .hltv-list { grid-template-columns: minmax(0, 1fr); grid-auto-flow: row; grid-template-rows: none; }
  }
</style>
