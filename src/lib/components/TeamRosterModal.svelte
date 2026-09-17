<script lang="ts">
  import { tick } from 'svelte';
  import { getCatalogContext } from '$lib/game/catalogContext';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import {
    teamAverageOverall,
    teamPlacementLabel,
    teamStyle,
    teamTags
  } from '$lib/game/teamViews';
  import type { HistoricalTeam, Language } from '$lib/game/types';
  import CountryFlag from './CountryFlag.svelte';
  import PlayerMiniCard from './PlayerMiniCard.svelte';
  import TeamBadge from './TeamBadge.svelte';

  export let team: HistoricalTeam | null = null;
  export let isOpen = false;
  export let language: Language = 'en';
  export let showPlayerAwards = false;
  export let onClose: () => void = () => {};

  let dialog: HTMLDivElement;
  let closeButton: HTMLButtonElement;
  let wasOpen = false;

  // Rosters resolve on the page's catalog (core when no page set one, e.g. /online).
  const catalog = getCatalogContext();
  $: roster = $catalog.getTeamPlayers(team);
  $: average = teamAverageOverall(team, roster);
  $: tags = teamTags(team);
  $: style = teamStyle(team, roster);
  $: placement = teamPlacementLabel(team);
  $: orgId = $catalog.teamOrgId(team);
  $: country = $catalog.teamCountry(team);
  $: if (isOpen && !wasOpen) {
    wasOpen = true;
    void focusDialog();
  } else if (!isOpen) {
    wasOpen = false;
  }

  async function focusDialog() {
    await tick();
    closeButton?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog) return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hasAttribute('disabled'));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && team}
  <div class="sheet-backdrop team-modal-backdrop" role="presentation" on:mousedown={onClose}>
    <div
      bind:this={dialog}
      class="team-roster-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${translateTeamName(language, team.name ?? team.id)} ${team.year ?? ''}`}
      tabindex="-1"
      on:mousedown|stopPropagation
    >
      <button bind:this={closeButton} class="sheet-close" type="button" aria-label={translate(language, 'close')} on:click={onClose}>×</button>
      <header class="team-modal-header">
        <TeamBadge id={team.id} name={team.name ?? ''} size="xl" {orgId} />
        <div>
          <span class="eyebrow"><CountryFlag code={country} {language} /> {team.game ?? 'CS'} · {team.year ?? '—'} · {placement}</span>
          <h2>{translateTeamName(language, team.name ?? team.id)}</h2>
          <p>{style} · OVR {average}</p>
        </div>
      </header>

      <div class="team-modal-tags">
        {#each tags as tag}<span>{tag}</span>{/each}
      </div>

      {#if roster.length}
        <div class="team-modal-roster">
          {#each roster as player (player.id)}
            <PlayerMiniCard {player} {language} {showPlayerAwards} />
          {/each}
        </div>
      {:else}
        <p class="empty-roster">Jogadores ainda não cadastrados para este time.</p>
      {/if}

      <footer class="team-modal-footer">
        <button class="secondary" type="button" on:click={onClose}>{translate(language, 'close')}</button>
      </footer>
    </div>
  </div>
{/if}
