<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import TeamRosterModal from '$lib/components/TeamRosterModal.svelte';
  import { teams } from '$lib/game/data';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { sortTeamsByPlacement } from '$lib/game/teamViews';
  import type { HistoricalTeam } from '$lib/game/types';

  let selectedTeam: HistoricalTeam | null = null;

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);
  $: teamsByYear = [...teams]
    .filter((team) => team.year)
    .reduce((groups, team) => {
      const year = Number(team.year);
      const group = groups.get(year) ?? [];
      group.push(team);
      groups.set(year, group);
      return groups;
    }, new Map<number, HistoricalTeam[]>());
  $: yearSections = [...teamsByYear.entries()]
    .sort(([left], [right]) => left - right)
    .map(([year, yearTeams]) => ({ year, teams: yearTeams.sort(sortTeamsByPlacement) }))
    .filter((section) => section.teams.length);
</script>

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(l) => $language = l}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
>
  <header class="teams-page-header">
    <span class="eyebrow">{t('teamsPageEyebrow')}</span>
    <h1>{t('teamsPageTitle')}</h1>
    <p>{t('teamsPageIntro')}</p>
  </header>

  <div class="teams-year-list">
    {#each yearSections as section}
      <section id={`year-${section.year}`} class="teams-year-section" aria-labelledby={`teams-${section.year}`}>
        <div class="teams-year-heading">
          <div>
            <span class="eyebrow">{section.teams.length} {t('teams')}</span>
            <h2 id={`teams-${section.year}`}>{section.year}</h2>
          </div>
        </div>
        <div class="teams-grid">
          {#each section.teams as team (team.id)}
            <TeamCard {team} language={$language} onOpen={(openedTeam) => selectedTeam = openedTeam} />
          {/each}
        </div>
      </section>
    {/each}
  </div>
</PageLayout>

<TeamRosterModal
  team={selectedTeam}
  isOpen={Boolean(selectedTeam)}
  language={$language}
  showPlayerAwards={true}
  onClose={() => selectedTeam = null}
/>

<style>
  .teams-page-header { margin-bottom: 32px; }
  .teams-page-header h1 { margin: 10px 0 14px; font-size: clamp(2.6rem, 9vw, 5rem); }
  .teams-page-header p { max-width: 760px; color: var(--muted); line-height: 1.65; }
  .teams-year-list { display: grid; gap: 34px; }
  .teams-year-section { display: grid; gap: 14px; }
  .teams-year-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .teams-year-heading h2 { margin: 4px 0 0; font-size: clamp(2rem, 6vw, 3.5rem); }
  .teams-grid { display: grid; gap: 12px; }

  @media (min-width: 820px) {
    .teams-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (min-width: 1180px) {
    .teams-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
