<!-- src/lib/components/DynastyHeader.svelte -->
<script lang="ts">
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { translate } from '$lib/game/i18n';
  import { userTeamLabel } from '$lib/game/dynasty/teamLabel';
  import type { DynastyState, Language } from '$lib/game/types';

  export let dynasty: DynastyState;
  export let language: Language = 'pt-BR';
  export let coachName: string | null = null;
  export let eraName: string | null = null;
  export let liveStage: string | null = null;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<div class="dynasty-bar" role="status">
  <span class="eyebrow">DINASTIA</span>
  <strong class="org-name">{userTeamLabel(language, dynasty)}</strong>
  {#if eraName}<span class="pill legend">{eraName}</span>{/if}
  <strong>{t('dynastyMajorNumber')} #{dynasty.majorNumber}</strong>
  {#if liveStage}<span class="pill live-stage">{liveStage}</span>{/if}
  <span class="pill" class:legend={dynasty.status === 'legend'}>{dynasty.status === 'legend' ? t('dynastyLegend') : t('dynastyChallenger')} · {t('dynastyEntry')} {t(dynasty.entryStage)}</span>
  <span>{t('dynastyTitles')} <b>{dynasty.titles}</b></span>
  <span>{t('dynastyCash')} <b>{formatUsd(dynasty.cash, language)}</b></span>
  {#if coachName}<span>{t('dynastyCoach')} <b>{coachName}</b></span>{/if}
</div>

<style>
  .dynasty-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin: 12px 0 0; padding: 10px 14px; border: 1px solid var(--line); background: var(--surface); font-size: .78rem; }
  .dynasty-bar strong { font-size: .95rem; }
  .dynasty-bar b { color: var(--accent); }
  .pill { padding: 2px 8px; border: 1px solid var(--line); color: var(--muted); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; font-size: .62rem; }
  .pill.legend { border-color: #d9a441; color: #d9a441; }
  .pill.live-stage { border-color: var(--accent); color: var(--accent); }
</style>
