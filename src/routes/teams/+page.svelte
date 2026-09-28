<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import TeamRosterModal from '$lib/components/TeamRosterModal.svelte';
  import StyledSelect from '$lib/components/online/StyledSelect.svelte';
  import { readable } from 'svelte/store';
  import { CURRENT_CATALOG_VERSION, getCatalog } from '$lib/game/catalog';
  import { setCatalogContext } from '$lib/game/catalogContext';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { sortTeamsByPlacement } from '$lib/game/teamViews';
  import { countryName } from '$lib/game/visuals/flags';
  import type { HistoricalTeam, Language } from '$lib/game/types';
  import { SEO_BY_ROUTE } from '$lib/seo';

  // The whole current catalog (qualifier team-years included, once the expansion lands); cards and the modal resolve rosters on it.
  const catalog = getCatalog(CURRENT_CATALOG_VERSION);
  setCatalogContext(readable(catalog));
  const { teams } = catalog;

  let selectedTeam: HistoricalTeam | null = null;

  /** Filtros (2026-09-28): país, ano e organização; vazio = todos. Combinam entre si e o texto some quando nada sobra. */
  let countryFilter = '';
  let yearFilter = '';
  let orgFilter = '';

  const filterCopy: Record<Language, { country: string; year: string; org: string; all: string; clear: string; empty: string; showing: string }> = {
    'pt-BR': { country: 'País', year: 'Ano', org: 'Time', all: 'Todos', clear: 'Limpar filtros', empty: 'Nenhum time com esses filtros.', showing: 'times' },
    en: { country: 'Country', year: 'Year', org: 'Team', all: 'All', clear: 'Clear filters', empty: 'No team matches these filters.', showing: 'teams' },
    es: { country: 'País', year: 'Año', org: 'Equipo', all: 'Todos', clear: 'Limpiar filtros', empty: 'Ningún equipo con esos filtros.', showing: 'equipos' }
  };

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);
  $: f = filterCopy[$language];

  /** Nome de exibição de uma organização: o nome do time-ano mais recente dela, sem o ano. */
  const orgLabelOf = (team: HistoricalTeam) => translateTeamName($language, team.name ?? team.id).replace(/\s+\d{4}$/, '');

  $: countryOptions = [{ value: '', label: f.all }, ...[...new Set(teams.map((team) => catalog.teamCountry(team)).filter((code): code is string => Boolean(code)))]
    .map((code) => ({ value: code, label: countryName(code, $language) || code.toUpperCase() }))
    .sort((left, right) => left.label.localeCompare(right.label, $language))];
  $: yearOptions = [{ value: '', label: f.all }, ...[...new Set(teams.map((team) => Number(team.year)).filter(Boolean))]
    .sort((left, right) => right - left)
    .map((year) => ({ value: String(year), label: String(year) }))];
  $: orgOptions = (() => {
    const byOrg = new Map<string, { label: string; year: number; count: number }>();
    for (const team of teams) {
      const orgId = catalog.teamOrgId(team) ?? team.id;
      const year = Number(team.year) || 0;
      const current = byOrg.get(orgId);
      if (!current) byOrg.set(orgId, { label: orgLabelOf(team), year, count: 1 });
      else { current.count += 1; if (year > current.year) { current.year = year; current.label = orgLabelOf(team); } }
    }
    return [{ value: '', label: f.all }, ...[...byOrg.entries()]
      .map(([value, entry]) => ({ value, label: entry.label, caption: entry.count > 1 ? `${entry.count}` : undefined }))
      .sort((left, right) => left.label.localeCompare(right.label, $language))];
  })();

  $: filtered = teams.filter((team) => team.year
    && (!countryFilter || catalog.teamCountry(team) === countryFilter)
    && (!yearFilter || String(team.year) === yearFilter)
    && (!orgFilter || (catalog.teamOrgId(team) ?? team.id) === orgFilter));
  $: hasFilter = Boolean(countryFilter || yearFilter || orgFilter);

  $: teamsByYear = filtered
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

  const clearFilters = () => { countryFilter = ''; yearFilter = ''; orgFilter = ''; };
</script>

<SeoHead metadata={SEO_BY_ROUTE['/teams']} />

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

  <div class="teams-filters" role="group" aria-label={`${f.country} · ${f.year} · ${f.org}`}>
    <StyledSelect label={f.country} ariaLabel={f.country} options={countryOptions} value={countryFilter} onSelect={(value) => countryFilter = value} />
    <StyledSelect label={f.year} ariaLabel={f.year} options={yearOptions} value={yearFilter} onSelect={(value) => yearFilter = value} />
    <StyledSelect label={f.org} ariaLabel={f.org} options={orgOptions} value={orgFilter} onSelect={(value) => orgFilter = value} />
    <div class="teams-filters-meta">
      <span class="eyebrow">{filtered.length} {f.showing}</span>
      {#if hasFilter}<button class="ghost" type="button" on:click={clearFilters}>{f.clear}</button>{/if}
    </div>
  </div>

  <div class="teams-year-list">
    {#each yearSections as section (section.year)}
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
    {:else}
      <p class="teams-empty">{f.empty}</p>
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
  .teams-page-header { margin-bottom: 24px; }
  .teams-page-header h1 { margin: 10px 0 14px; font-size: clamp(2.6rem, 9vw, 5rem); }
  .teams-page-header p { max-width: 760px; color: var(--muted); line-height: 1.65; }
  /* Filtros no cromo dos menus do Time: três selects e o contador; no celular empilham. */
  .teams-filters { position: sticky; top: 0; z-index: 20; display: grid; gap: 10px; margin-bottom: 26px; padding: 12px; border: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px); }
  .teams-filters-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; }
  .teams-filters-meta .ghost { min-height: 36px; padding: 0 12px; font-size: .66rem; }
  .teams-empty { padding: 28px 12px; border: 1px dashed var(--line); color: var(--muted); text-align: center; }
  .teams-year-list { display: grid; gap: 34px; }
  .teams-year-section { display: grid; gap: 14px; }
  .teams-year-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .teams-year-heading h2 { margin: 4px 0 0; font-size: clamp(2rem, 6vw, 3.5rem); }
  .teams-grid { display: grid; gap: 12px; }

  @media (min-width: 680px) {
    .teams-filters { grid-template-columns: repeat(3, minmax(0, 1fr)) auto; align-items: end; }
  }

  @media (min-width: 820px) {
    .teams-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (min-width: 1180px) {
    .teams-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
