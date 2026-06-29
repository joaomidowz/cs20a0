<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import { players, teamById } from '$lib/game/data';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import {
    RANKING_ROLES,
    topPlayersByRole
  } from '$lib/game/playerRankings';
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { Player } from '$lib/game/types';

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);

  function teamName(player: Player) {
    const team = player.teamId ? teamById.get(player.teamId) : null;
    return team ? translateTeamName($language, team.name ?? team.id) : player.teamId ?? '—';
  }
</script>

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(l) => $language = l}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
>
  <section class="players-ranking-section">
    <div class="ranking-heading compact">
      <div>
        <span class="eyebrow">{t('byRole')}</span>
        <h2>{t('roleRankings')}</h2>
      </div>
    </div>
    <div class="role-ranking-grid">
      {#each RANKING_ROLES as role}
        <article class="role-ranking-card">
          <h3>{t('top')} {getRoleLabel(role)}</h3>
          <div>
            {#each topPlayersByRole(players, role, 10) as player, index (player.id)}
              <span>
                <b>#{index + 1}</b>
                <em>{player.nickname ?? 'Unknown'}</em>
                <small>{player.year ?? ''} · {teamName(player)}</small>
                <strong>{player.overall ?? 70}</strong>
              </span>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </section>
</PageLayout>

<style>
  .players-ranking-section { display: grid; gap: 13px; margin-bottom: 30px; }
  .ranking-heading { display: flex; justify-content: space-between; gap: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .ranking-heading.compact { margin-top: 4px; }
  .ranking-heading h2 { margin: 4px 0 0; font-size: clamp(1.8rem, 5vw, 3rem); }
  .role-ranking-grid { display: grid; gap: 12px; }
  .role-ranking-card { min-width: 0; padding: 13px; border: 1px solid var(--line); background: var(--surface); }
  .role-ranking-card h3 { margin: 0 0 12px; color: var(--accent); font-size: 1.25rem; }
  .role-ranking-card div { display: grid; gap: 6px; }
  .role-ranking-card span { display: grid; grid-template-columns: 34px 1fr auto; gap: 7px; align-items: center; min-height: 46px; padding: 8px; border: 1px solid var(--line); background: var(--surface-2); }
  .role-ranking-card b { color: var(--accent); }
  .role-ranking-card em { min-width: 0; font-style: normal; font-weight: 800; overflow-wrap: anywhere; }
  .role-ranking-card small { grid-column: 2; color: var(--muted); font-size: .56rem; text-transform: uppercase; }
  .role-ranking-card strong { grid-row: 1 / span 2; grid-column: 3; font: 900 1.35rem 'Barlow Condensed'; }

  @media (min-width: 720px) {
    .role-ranking-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (min-width: 1120px) {
    .role-ranking-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
