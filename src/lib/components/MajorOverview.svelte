<script lang="ts">
  import PlayoffBracket from './PlayoffBracket.svelte';
  import StandingsTable from './StandingsTable.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SwissGraph from './SwissGraph.svelte';
  import { translate } from '$lib/game/i18n';
  import { buildBracket, buildSwissGraph, computeStandings, countCompletedRounds, revealRounds, swissRoundsOf, type RevealCursor } from '$lib/game/majorOverview';
  import type { Language, MajorStage, MajorTournament } from '$lib/game/types';

  export let tournament: MajorTournament | null = null;
  export let cursor: RevealCursor = { liveSeriesId: null };
  export let userTeamId = '';
  export let language: Language = 'pt-BR';
  export let onTeam: (teamId: string) => void = () => {};
  /** Opens a series (online: switches the live viewer to it). Null keeps the cards static. */
  export let onSeries: ((seriesId: string) => void) | null = null;
  /** Online rounds carry running scores that are safe to show; offline/sandbox series hold final results and must stay hidden while live. */
  export let showLiveScores = false;

  let swissCollapsed = false;
  let autoCollapsed = false;
  let selectedStage: MajorStage | null = null;
  let followedStage: MajorStage | null = null;

  const pickStage = (value: string) => { selectedStage = value as MajorStage; };

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: revealed = tournament ? revealRounds(tournament.rounds, cursor) : [];
  $: stageOptions = tournament?.stages?.map((item) => item.stage) ?? [];
  $: multiStage = stageOptions.length > 1;
  // The stage of the live series (or the last revealed Swiss round) is the default; the viewer can look back at earlier stages.
  $: liveStage = (revealed.find((round) => round.series.some((entry) => entry.status === 'live')) ?? [...revealed].reverse().find((round) => round.phase === 'swiss'))?.stage ?? stageOptions.at(-1) ?? null;
  $: if (liveStage !== followedStage) { followedStage = liveStage; selectedStage = liveStage; }
  $: activeStage = multiStage ? selectedStage : null;
  $: swiss = buildSwissGraph(swissRoundsOf(revealed, activeStage));
  $: playoffRounds = revealed.filter((round) => round.phase !== 'swiss');
  // Only the last Swiss stage leads into the bracket; an earlier stage being done must not fold the panel or open the bracket.
  $: swissFinal = swiss.done && (!activeStage || activeStage === stageOptions.at(-1));
  $: showBracket = playoffRounds.length > 0 || swissFinal;
  // Once every team has qualified or been eliminated the Swiss stage folds away so the bracket takes the stage; it stays expandable.
  $: if (swissFinal && !autoCollapsed) { swissCollapsed = true; autoCollapsed = true; }
  $: if (!swissFinal && autoCollapsed) { swissCollapsed = false; autoCollapsed = false; }
  $: bracket = showBracket ? buildBracket(playoffRounds, { liveScores: showLiveScores }) : [];
  $: standings = tournament ? computeStandings(tournament, countCompletedRounds(revealed), activeStage) : [];
  $: championId = cursor.complete ? tournament?.championId ?? null : (bracket.find((column) => column.phase === 'final')?.matches[0]?.status === 'completed' ? tournament?.championId ?? null : null);
  $: phaseLabel = (phase: 'quarterfinal' | 'semifinal' | 'final') => (phase === 'final' ? (language === 'en' ? 'Grand final' : language === 'es' ? 'Gran final' : 'Grande final') : t(phase));
</script>

{#if tournament}
  <div class="major-overview">
    {#if swiss.columns.length || !showBracket}
      <section class="panel overview-panel" class:collapsed={swissCollapsed}>
        <header class="overview-head"><span class="eyebrow">{activeStage ? `${t(activeStage)} · ${t('overviewSwissWord')}` : t('overviewSwiss')}{#if swiss.done} · {language === 'en' ? 'COMPLETE' : language === 'es' ? 'COMPLETO' : 'CONCLUÍDO'}{/if}</span>{#if multiStage}<SegmentedControl value={selectedStage ?? ''} label={t('overviewStage')} options={stageOptions.map((stage) => ({ value: stage, label: t(stage) }))} onChange={pickStage} />{/if}{#if swiss.done}<button type="button" class="secondary overview-toggle" aria-expanded={!swissCollapsed} on:click={() => swissCollapsed = !swissCollapsed}>{swissCollapsed ? t('overviewExpand') : t('overviewCollapse')}</button>{/if}</header>
        {#if swissCollapsed}
          <p class="overview-summary">{swiss.qualified.flatMap((group) => group.teams.map((team) => team.name)).join(' · ')}</p>
        {:else}
        <SwissGraph graph={swiss} {userTeamId} {onTeam} {onSeries} {showLiveScores} labels={{ round: t('overviewRound'), playoffs: t('overviewPlayoffs'), eliminated: t('overviewEliminated'), live: t('live'), pending: t('pending'), noRounds: t('overviewNoRounds') }} />
        {/if}
      </section>
    {/if}
    {#if showBracket}
      <section class="panel overview-panel">
        <span class="eyebrow">{t('overviewBracket')}</span>
        <PlayoffBracket columns={bracket} {userTeamId} {championId} {onTeam} {onSeries} labels={{ quarterfinal: phaseLabel('quarterfinal'), semifinal: phaseLabel('semifinal'), final: phaseLabel('final'), tbd: t('overviewTbd'), live: t('live'), pending: t('pending') }} />
      </section>
    {/if}
    <section class="panel overview-panel">
      <span class="eyebrow">{t('overviewStandings')}</span>
      <StandingsTable {standings} {userTeamId} {onTeam} labels={{ record: t('overviewRecord'), buchholz: t('overviewBuchholz'), active: t('overviewActive'), qualified: t('overviewQualified'), eliminated: t('overviewOut'), champion: t('overviewChampion'), runnerUp: t('placementRunnerUp'), third: t('placement3to4'), fifth: t('placement5to8'), playoffs: t('overviewInPlayoffs') }} />
    </section>
  </div>
{/if}

<style>
  .major-overview{display:grid;gap:14px;min-width:0}
  .overview-panel{display:grid;gap:12px;min-width:0;padding:16px}.overview-panel>:global(*){min-width:0}
  .overview-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}.overview-toggle{min-height:34px;padding:0 12px;font-size:.58rem}
  .overview-summary{margin:0;color:var(--muted);font-size:.66rem;line-height:1.6}.overview-summary::before{content:'▸ ';color:var(--accent)}
  @media(min-width:980px){.overview-panel{padding:20px}}
</style>
