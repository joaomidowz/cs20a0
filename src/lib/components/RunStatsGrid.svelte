<script lang="ts">
  import { playerById, playerTitle } from '$lib/game/data';
  import { translate, translateTitle } from '$lib/game/i18n';
  import { getRoleLabel } from '$lib/game/roleRules';
  import { getRunMvpScore } from '$lib/game/runStats';
  import type { Language, Player, PlayerRunStats } from '$lib/game/types';

  export let stats: PlayerRunStats[] = [];
  export let language: Language = 'pt-BR';
  /** Optional player overrides (e.g. PRO-adjusted attributes). */
  export let players: Player[] = [];
  export let showRarity = true;
  export let compact = false;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: override = new Map(players.map((player) => [player.id, player]));
  $: ranked = [...stats].sort((a, b) => getRunMvpScore(b) - getRunMvpScore(a));
  $: mvpId = ranked[0]?.playerId ?? null;
  $: worstId = stats.length > 1 ? [...stats].sort((a, b) => a.runRating - b.runRating)[0]?.playerId ?? null : null;
  const resolve = (id: string) => override.get(id) ?? playerById.get(id);
</script>

<div class="stats-grid run-stats-grid" class:compact>
  {#each stats as stat (stat.playerId)}
    {@const player = resolve(stat.playerId)}
    {#if player}
      <article class="stat-card {showRarity ? `rarity-${(player.rarity ?? 'common').toLowerCase()}` : 'rarity-hidden'}" class:is-mvp={mvpId === player.id}>
        {#if mvpId === player.id}<span class="mvp-badge">{t('runMvp')}</span>{/if}
        {#if worstId === player.id && mvpId !== player.id}<span class="underperformer-badge">{t('worstRating')}</span>{/if}
        <div class="stat-player"><div class="avatar large">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">{getRoleLabel(stat.assignedRole)} · {player.year ?? ''}</span><h2>{player.nickname ?? 'Unknown'}</h2><p>{translateTitle(language, playerTitle(player))}</p></div><strong>{player.overall ?? 70}</strong></div>
        <div class="rating"><small>RUN RATING</small><b>{stat.runRating.toFixed(2)}</b></div>
        <div class="stat-numbers"><span><small>K / D</small><b>{stat.kills} / {stat.deaths}</b></span><span><small>K/D</small><b>{stat.kdRatio.toFixed(2)}</b></span><span><small>ADR</small><b>{stat.adr}</b></span><span><small>IMPACT</small><b>{stat.impact.toFixed(2)}</b></span><span><small>CLUTCHES</small><b>{stat.clutches}</b></span><span><small>OPENINGS</small><b>{stat.openingKills}</b></span><span><small>{t('mapsWon')} / {t('mapsLost')}</small><b>{stat.mapsWon} / {stat.mapsLost}</b></span><span><small>{t('roundsWon')} / {t('roundsLost')}</small><b>{stat.roundsWon} / {stat.roundsLost}</b></span><span><small>CONSISTENCY</small><b>{stat.consistency}</b></span></div>
        {#if stat.runRating < 0.85}<footer class="below-expected">{t('belowExpected')}</footer>{/if}
      </article>
    {/if}
  {/each}
</div>

<style>
  .run-stats-grid{min-width:0}
  .stat-card.is-mvp{border-color:var(--accent)}
  .compact .stat-card{padding:14px}
</style>
