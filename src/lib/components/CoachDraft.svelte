<!-- src/lib/components/CoachDraft.svelte -->
<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Coach, Language } from '$lib/game/types';

  export let offer: Coach[] = [];
  export let language: Language = 'pt-BR';
  export let rerollsLeft = 0;
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onPick: (coach: Coach) => void = () => {};
  export let onReroll: () => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const attributes = ['tactics', 'discipline', 'aggression', 'development'] as const;
  const labelKey = { tactics: 'coachTactics', discipline: 'coachDiscipline', aggression: 'coachAggression', development: 'coachDevelopment' } as const;
</script>

<section class="coach-draft">
  <div class="coach-grid">
    {#each offer as coach (coach.id)}
      <article class="coach-card panel rarity-{coach.rarity}">
        <header>
          <span class="coach-avatar" aria-hidden="true">{coach.name.slice(0, 2).toUpperCase()}</span>
          <div><h2>{coach.name}</h2><small>{teamLabel(coach.teamId)}</small></div>
          <b class="coach-overall">{coach.overall}</b>
        </header>
        <dl>
          {#each attributes as key}
            <div><dt>{t(labelKey[key])}</dt><dd><span style={`width:${coach[key]}%`}></span><b>{coach[key]}</b></dd></div>
          {/each}
        </dl>
        {#if coach.needsReview}<p class="coach-review">{t('coachNeedsReview')}</p>{/if}
        <button class="primary" type="button" on:click={() => onPick(coach)}>{t('coachPick')}</button>
      </article>
    {/each}
  </div>
  <button class="secondary" type="button" disabled={rerollsLeft <= 0} on:click={onReroll}>{t('coachReroll')} ({rerollsLeft})</button>
</section>

<style>
  .coach-draft { display: grid; gap: 16px; justify-items: start; }
  .coach-grid { display: grid; gap: 14px; width: 100%; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .coach-card { display: grid; gap: 14px; padding: 18px; }
  .coach-card header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; }
  .coach-card h2 { margin: 0; font-size: 1.25rem; overflow-wrap: anywhere; }
  .coach-card small { color: var(--muted); }
  .coach-avatar { display: grid; place-items: center; width: 44px; height: 44px; background: var(--surface-2); color: var(--accent); font-weight: 900; }
  .coach-overall { font-size: 1.6rem; color: var(--accent); }
  .coach-card dl { display: grid; gap: 8px; margin: 0; }
  .coach-card dl div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; align-items: center; font-size: .78rem; }
  .coach-card dd { position: relative; display: flex; align-items: center; gap: 8px; margin: 0; }
  .coach-card dd span { display: block; height: 6px; background: var(--accent); }
  .coach-review { margin: 0; color: var(--accent-2); font-size: .72rem; }
</style>
