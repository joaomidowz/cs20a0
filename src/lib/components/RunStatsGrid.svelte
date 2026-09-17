<script lang="ts">
  import { getCatalogContext } from '$lib/game/catalogContext';
  import { playerTitle } from '$lib/game/data';
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

  // The offline page sets the run's catalog; without one (/online) this is core, exactly the dataset of today.
  const catalog = getCatalogContext();
  $: playerById = $catalog.playerById;
  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: override = new Map(players.map((player) => [player.id, player]));
  $: ranked = [...stats].sort((a, b) => getRunMvpScore(b) - getRunMvpScore(a));
  $: mvpId = ranked[0]?.playerId ?? null;
  $: worstId = stats.length > 1 ? [...stats].sort((a, b) => a.runRating - b.runRating)[0]?.playerId ?? null : null;
  const resolve = (id: string) => override.get(id) ?? playerById.get(id);
  $: hasRating3 = stats.some((stat) => stat.kast !== undefined);
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
</script>

<div class="stats-grid run-stats-grid" class:compact>
  {#each stats as stat (stat.playerId)}
    {@const player = resolve(stat.playerId)}
    {#if player}
      <article class="stat-card {showRarity ? `rarity-${(player.rarity ?? 'common').toLowerCase()}` : 'rarity-hidden'}" class:is-mvp={mvpId === player.id}>
        {#if mvpId === player.id}<span class="mvp-badge">{t('runMvp')}</span>{/if}
        {#if worstId === player.id && mvpId !== player.id}<span class="underperformer-badge">{t('worstRating')}</span>{/if}
        <div class="stat-player"><div class="avatar large">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">{getRoleLabel(stat.assignedRole)} · {player.year ?? ''}</span><h2>{player.nickname ?? 'Unknown'}</h2><p>{translateTitle(language, playerTitle(player))}</p></div><strong>{player.overall ?? 70}</strong></div>
        <div class="rating"><small>{stat.kast !== undefined ? t('rating3').toUpperCase() : 'RUN RATING'}</small><b>{stat.runRating.toFixed(2)}</b>{#if stat.swing !== undefined}<i class="swing" class:up={stat.swing > 0} class:down={stat.swing < 0}>{t('statSwing').toUpperCase()} {signed(stat.swing)}</i>{/if}</div>
        <div class="stat-numbers">
          {#if stat.assists !== undefined}<span><small>K / D / A</small><b>{stat.kills} / {stat.deaths} / {stat.assists}</b></span>{:else}<span><small>K / D</small><b>{stat.kills} / {stat.deaths}</b></span>{/if}
          <span><small>K/D</small><b>{stat.kdRatio.toFixed(2)}</b></span>
          {#if stat.kast !== undefined}<span><small>{t('statKast')}</small><b>{stat.kast.toFixed(1)}%</b></span>{/if}
          <span><small>ADR</small><b>{stat.adr}</b></span>
          {#if stat.utilityDamage !== undefined}<span><small>{t('statUtility')}</small><b>{stat.utilityDamage.toFixed(1)}</b></span>{/if}
          <span><small>IMPACT</small><b>{stat.impact.toFixed(2)}</b></span>
          {#if stat.openingDeaths !== undefined}<span><small>{t('statOpenings')}</small><b>{stat.openingKills}–{stat.openingDeaths}</b></span>{:else}<span><small>OPENINGS</small><b>{stat.openingKills}</b></span>{/if}
          {#if stat.tradeKills !== undefined}<span><small>{t('statTrades')}</small><b>{stat.tradeKills}</b></span>{/if}
          {#if stat.multiKills}<span><small>3K / 4K / ACE</small><b>{stat.multiKills.triple} / {stat.multiKills.quad} / {stat.multiKills.ace}</b></span>{/if}
          <span><small>CLUTCHES</small><b>{stat.clutches}</b></span>
          <span><small>{t('mapsWon')} / {t('mapsLost')}</small><b>{stat.mapsWon} / {stat.mapsLost}</b></span>
          <span><small>{t('roundsWon')} / {t('roundsLost')}</small><b>{stat.roundsWon} / {stat.roundsLost}</b></span>
          <span><small>CONSISTENCY</small><b>{stat.consistency}</b></span>
        </div>
        {#if stat.runRating < 0.85}<footer class="below-expected">{t('belowExpected')}</footer>{/if}
      </article>
    {/if}
  {/each}
</div>
{#if hasRating3}<p class="rating-help">{t('rating3Help')}</p>{/if}

<style>
  .run-stats-grid{min-width:0}
  .stat-card.is-mvp{border-color:var(--accent)}
  .compact .stat-card{padding:12px}
  .compact :global(.stat-player){gap:10px}
  .compact :global(.avatar.large){width:40px;height:40px;font-size:1rem}
  .compact :global(.stat-player h2){margin-top:2px;font-size:1.35rem}
  .compact :global(.stat-player p){font-size:.64rem}
  .compact :global(.stat-player>strong){font-size:1.5rem}
  .compact :global(.rating){margin:10px 0 8px;padding:8px 10px}
  .compact :global(.rating b){font-size:1.8rem}
  .compact :global(.stat-numbers){grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
  .compact :global(.stat-numbers span){padding:6px 6px}
  .compact :global(.stat-numbers small){font-size:.5rem}
  .compact :global(.stat-numbers b){margin-top:2px;font-size:.8rem}
  @media (max-width:520px){.compact :global(.stat-numbers){grid-template-columns:repeat(3,minmax(0,1fr))}}
  .rating .swing{display:block;margin-top:4px;font-style:normal;font-size:.62rem;font-weight:800;letter-spacing:.06em;color:var(--muted)}
  .rating .swing.up{color:var(--accent)}
  .rating .swing.down{color:var(--danger)}
  .rating-help{margin:-6px 0 18px;color:var(--muted);font-size:.72rem;line-height:1.5}
</style>
