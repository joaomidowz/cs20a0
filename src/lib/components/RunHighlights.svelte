<script lang="ts">
  import { getMapName } from '$lib/game/maps';
  import { WEAPON_LABELS } from '$lib/game/roundPresentation';
  import { collectRunHighlights, getMomentLabel, highlightHeadshotRate } from '$lib/game/runHighlights';
  import { WEAPON_ICONS } from '$lib/game/sandbox/weaponIcons';
  import type { Language, MapId, SeriesResult } from '$lib/game/types';

  /** The user's series, finished ones only contribute. */
  export let matches: SeriesResult[] = [];
  export let userTeamId: string;
  export let language: Language = 'pt-BR';
  export let maxMoments = 8;

  $: highlights = collectRunHighlights(matches, userTeamId);
  $: moments = highlights.moments.slice(0, maxMoments);
  $: text = {
    'pt-BR': { title: 'Resenha da run', moments: 'Melhores momentos', players: 'Por jogador', empty: 'Nenhum round jogado ainda.', rounds: 'rounds', clutches: 'clutches', aces: 'aces', opening: 'aberturas', hs: 'HS', kd: 'K / D', multi: '3K / 4K / ACE', weapon: 'Arma preferida', map: 'Mapa', round: 'Round', vs: 'contra' },
    es: { title: 'Resumen de la partida', moments: 'Mejores momentos', players: 'Por jugador', empty: 'Ninguna ronda jugada todavía.', rounds: 'rondas', clutches: 'clutches', aces: 'aces', opening: 'aperturas', hs: 'HS', kd: 'K / D', multi: '3K / 4K / ACE', weapon: 'Arma preferida', map: 'Mapa', round: 'Ronda', vs: 'contra' },
    en: { title: 'Run recap', moments: 'Best moments', players: 'Per player', empty: 'No rounds played yet.', rounds: 'rounds', clutches: 'clutches', aces: 'aces', opening: 'opening kills', hs: 'HS', kd: 'K / D', multi: '3K / 4K / ACE', weapon: 'Favourite weapon', map: 'Map', round: 'Round', vs: 'vs' }
  }[language];
</script>

<section class="run-highlights panel">
  <div class="section-heading"><div><span class="eyebrow">HIGHLIGHTS</span><h2>{text.title}</h2></div></div>

  {#if highlights.totals.rounds === 0}
    <p class="highlights-empty">{text.empty}</p>
  {:else}
    <div class="highlight-totals">
      <article><small>{text.rounds}</small><strong>{highlights.totals.rounds}</strong></article>
      <article><small>{text.clutches}</small><strong>{highlights.totals.clutches}</strong></article>
      <article><small>{text.aces}</small><strong>{highlights.totals.aces}</strong></article>
      <article><small>{text.opening}</small><strong>{highlights.totals.openingKills}</strong></article>
      <article><small>{text.hs}</small><strong>{highlights.totals.kills ? Math.round((highlights.totals.headshots / highlights.totals.kills) * 100) : 0}%</strong></article>
    </div>

    {#if moments.length}
      <div class="highlight-moments">
        <span class="eyebrow">{text.moments}</span>
        <ol>
          {#each moments as moment (`${moment.seriesId}:${moment.mapNumber}:${moment.round}:${moment.playerId}:${moment.kind}`)}
            <li>
              <b class="moment-kind {moment.kind}">{getMomentLabel(language, moment.kind)}</b>
              <strong>{moment.name}</strong>
              <span>{getMapName(moment.mapId as MapId, moment.mapNumber, text.map)} · {text.round} {moment.round}</span>
              <small>{text.vs} {moment.opponentName}</small>
            </li>
          {/each}
        </ol>
      </div>
    {/if}

    <div class="highlight-players">
      <span class="eyebrow">{text.players}</span>
      <div class="highlight-grid">
        {#each highlights.players as player (player.playerId)}
          <article>
            <header><strong>{player.name}</strong>{#if player.bestWeapon}<em class="weapon" role="img" aria-label={WEAPON_LABELS[player.bestWeapon]} title={WEAPON_LABELS[player.bestWeapon]}>{@html WEAPON_ICONS[player.bestWeapon]}<span>{player.bestWeaponKills}</span></em>{/if}</header>
            <div class="player-numbers">
              <span><small>{text.kd}</small><b>{player.kills} / {player.deaths}</b></span>
              <span><small>{text.hs}</small><b>{highlightHeadshotRate(player)}%</b></span>
              <span><small>{text.clutches}</small><b>{player.clutches}</b></span>
              <span><small>{text.opening}</small><b>{player.openingKills}</b></span>
              <span><small>{text.multi}</small><b>{player.threeKills} / {player.fourKills} / {player.aces}</b></span>
            </div>
          </article>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .run-highlights{display:grid;gap:16px;padding:20px;margin-bottom:18px}
  .run-highlights .section-heading h2{margin:6px 0 0;font-size:1.5rem}
  .highlights-empty{margin:0;color:var(--muted);font-size:.8rem}
  .highlight-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
  .highlight-totals article{display:grid;gap:3px;padding:10px 12px;border:1px solid var(--line);background:var(--surface-2)}
  .highlight-totals small{color:var(--muted);font-size:.55rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  .highlight-totals strong{font:900 1.7rem 'Arial Narrow',Impact,sans-serif;color:var(--accent)}
  .highlight-moments{display:grid;gap:8px}
  .highlight-moments ol{display:grid;gap:5px;margin:0;padding:0;list-style:none}
  .highlight-moments li{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line)}
  .moment-kind{padding:2px 8px;font-size:.58rem;font-weight:900;letter-spacing:.12em;background:var(--surface-2);color:var(--muted)}
  .moment-kind.ace{background:var(--accent);color:#0a0d08}
  .moment-kind.four-kill{color:var(--accent);border:1px solid var(--accent)}
  .moment-kind.clutch{color:var(--accent-2);border:1px solid var(--accent-2)}
  .highlight-moments strong{font-size:.95rem;text-transform:uppercase}
  .highlight-moments span{color:var(--muted);font-size:.68rem}
  .highlight-moments small{margin-left:auto;color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}
  .highlight-players{display:grid;gap:8px}
  .highlight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
  .highlight-grid article{display:grid;gap:8px;padding:12px;border:1px solid var(--line);background:var(--surface-2)}
  .highlight-grid header{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .highlight-grid header strong{font-size:1rem;text-transform:uppercase}
  .highlight-grid header em{display:inline-flex;align-items:center;gap:6px;font-style:normal;color:var(--muted);font-size:.72rem}
  .highlight-grid header em :global(svg){width:34px;height:14px}
  .player-numbers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .player-numbers span{display:grid;gap:2px}
  .player-numbers small{color:var(--muted);font-size:.52rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .player-numbers b{font-size:.9rem;font-variant-numeric:tabular-nums}
  @media (max-width:679px){.run-highlights{padding:14px}.highlight-moments small{margin-left:0}}
</style>
