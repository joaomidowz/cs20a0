<script lang="ts">
  import { translatePlacement } from '$lib/game/i18n';
  import { translateOnline } from '$lib/game/online/i18n';
  import type { PublicSeason } from '$lib/game/online/contracts';
  import type { Language } from '$lib/game/types';

  export let season: PublicSeason;
  export let language: Language = 'pt-BR';
  export let selfParticipantId: string | null = null;
  /** True while a run is being drafted/played: the header then counts the run in progress instead of the last completed one. */
  export let inProgress = false;
  export let compact = false;

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline(language, key);
  $: runColumns = Array.from({ length: Math.max(1, season.totalRuns) }, (_, index) => index + 1);
  $: currentRun = Math.max(1, Math.min(season.totalRuns, inProgress ? season.run + 1 : season.run));
  /** The server already applies points and tournament tie-breakers; preserve that authoritative order. */
  $: standings = season.standings;
  $: leaderPoints = standings[0]?.points ?? 0;
  $: runOf = (standing: PublicSeason['standings'][number], run: number) => standing.runs.find((result) => result.run === run) ?? null;
</script>

<section class="panel season-panel" class:compact aria-label={t('seasonStandings')}>
  {#if season.championName}
    <header class="season-champion">
      <span class="eyebrow">{t('seasonChampion').toUpperCase()} · {t('season').toUpperCase()} {season.number}</span>
      <h2>{season.championName}</h2>
    </header>
  {/if}
  <div class="season-head">
    <div><span class="eyebrow">{t('season').toUpperCase()} {season.number} · {t('seasonRun').toUpperCase()} {currentRun}/{season.totalRuns}</span>{#if !compact}<h3>{t('seasonStandings')}</h3>{/if}</div>
    <small>{t('seasonLengthHint')}</small>
  </div>
  {#if !standings.length}
    <p class="season-empty">{t('noGames')}</p>
  {:else}
  <div class="season-scroll">
    <table class="season-table">
      <thead>
        <tr><th class="season-rank">#</th><th class="season-org">{t('participants')}</th>{#each runColumns as run}<th class="season-run">{t('seasonRun')} {run}</th>{/each}<th class="season-total">{t('seasonPoints')}</th></tr>
      </thead>
      <tbody>
        {#each standings as standing, index (`${standing.organizationName}:${standing.participantId ?? 'left'}`)}
          {@const leader = index === 0 && leaderPoints > 0}
          <tr class:leader class:mine={standing.participantId !== null && standing.participantId === selfParticipantId} class:left={standing.participantId === null}>
            <td class="season-rank">{index + 1}</td>
            <td class="season-org"><strong>{standing.organizationName}</strong><small>{standing.playerName}{#if standing.participantId === null} · {t('seasonLeft')}{/if}{#if leader && standings.length > 1} · {t('seasonLeader')}{/if}</small></td>
            {#each runColumns as run}
              {@const result = runOf(standing, run)}
              <td class="season-run">{#if result}<b class:champion={result.champion}>{result.points}</b><small>{translatePlacement(language, result.placement)}</small>{:else}<span class="season-pending">—</span>{/if}</td>
            {/each}
            <td class="season-total"><b>{standing.points}</b></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
</section>

<style>
  .season-panel{display:grid;gap:12px;min-width:0;margin:0 0 18px;padding:18px}.season-panel.compact{padding:14px;margin-bottom:14px}
  .season-champion{display:grid;gap:4px;padding:16px;border:1px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));text-align:center}.season-champion .eyebrow{color:var(--accent)}.season-champion h2{margin:0;font-size:clamp(2rem,7vw,3.4rem);line-height:1}
  .season-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.season-head h3{margin:4px 0 0;font-size:1.4rem}.season-head small{color:var(--muted);font-size:.62rem;line-height:1.4}
  .season-empty{margin:0;color:var(--muted);font-size:.68rem}
  .season-scroll{min-width:0;overflow-x:auto;scrollbar-width:thin}
  .season-table{width:100%;border-collapse:collapse;font-size:.72rem}
  .season-table th{padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.55rem;font-weight:900;letter-spacing:.1em;text-align:left;text-transform:uppercase;white-space:nowrap}
  .season-table td{padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}
  .season-rank{width:28px;color:var(--muted);font-weight:900}
  .season-org{min-width:150px}.season-org strong,.season-org small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.season-org small{margin-top:2px;color:var(--muted);font-size:.58rem}
  .season-run{min-width:88px;text-align:center}.season-run b{display:block;font:900 1.05rem 'Arial Narrow',Impact,sans-serif}.season-run b.champion{color:var(--accent)}.season-run b.champion::after{content:' ★';font-size:.7rem}.season-run small{display:block;color:var(--muted);font-size:.52rem;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.season-pending{color:var(--muted)}
  .season-total{text-align:right}.season-total b{font:900 1.35rem 'Arial Narrow',Impact,sans-serif}
  tr.leader td{background:color-mix(in srgb,var(--accent) 10%,transparent)}tr.leader .season-total b,tr.leader .season-org strong{color:var(--accent)}
  tr.mine .season-org strong{text-decoration:underline;text-underline-offset:3px}
  tr.left{opacity:.55}
  @media(max-width:679px){.season-head{align-items:start;flex-direction:column}.season-panel{padding:14px}}
</style>
