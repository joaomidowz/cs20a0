<script lang="ts">
  import { playerById, players, teamById, teams } from '$lib/game/data';
  import { getEligibleSlotRoles, getPlayerBaseId, getRoleLabel, validatePlayerPick } from '$lib/game/roleRules';
  import type { LineupSlotRole, Player, SelectedPlayer } from '$lib/game/types';

  export let open = false;
  export let slotIndex = 0;
  export let selectedPlayers: SelectedPlayer[] = [];
  export let onPick: (player: Player, role: LineupSlotRole) => void = () => {};
  export let onClose: () => void = () => {};

  let organizationSearch = '';
  let playerSearch = '';
  let organizationFilterId = '';

  $: otherSelections = selectedPlayers.filter((_, index) => index !== slotIndex);
  $: selectedBaseIds = new Set(otherSelections
    .map((selected) => playerById.get(selected.playerId))
    .filter((player): player is Player => Boolean(player))
    .map(getPlayerBaseId));
  $: matchingOrganizations = teams
    .filter((team) => `${team.name ?? ''} ${team.year ?? ''}`.toLowerCase().includes(organizationSearch.trim().toLowerCase()))
    .slice(0, 12);
  $: matchingPlayers = players
    .filter((player) => !organizationFilterId || player.teamId === organizationFilterId)
    .filter((player) => {
      const query = playerSearch.trim().toLowerCase();
      if (!query) return true;
      const team = player.teamId ? teamById.get(player.teamId) : null;
      return `${player.nickname ?? ''} ${player.year ?? ''} ${team?.name ?? ''}`.toLowerCase().includes(query);
    })
    .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0))
    .slice(0, 60);

  function validRoles(player: Player) {
    const validation = validatePlayerPick(player, otherSelections, undefined, (id) => playerById.get(id));
    if (!validation.ok && selectedBaseIds.has(getPlayerBaseId(player))) return [];
    return validation.validRoles.length ? validation.validRoles : getEligibleSlotRoles(player);
  }

  function chooseOrganization(id: string) {
    organizationFilterId = id;
    playerSearch = '';
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }
</script>

{#if open}
  <div class="picker-backdrop" role="presentation" on:click={onClose}>
    <div
      class="player-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sandbox-picker-title"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={handleDialogKeydown}
    >
      <header>
        <div>
          <span class="eyebrow">Slot {slotIndex + 1}</span>
          <h2 id="sandbox-picker-title">Trocar jogador</h2>
        </div>
        <button class="picker-close" type="button" on:click={onClose} aria-label="Fechar seletor">×</button>
      </header>

      <div class="picker-tools">
        <label>
          <span>Buscar organização</span>
          <input name="organization-search" bind:value={organizationSearch} placeholder="Astralis 2018" autocomplete="off" />
        </label>
        <label>
          <span>Buscar jogador</span>
          <input name="player-search" bind:value={playerSearch} placeholder="s1mple" autocomplete="off" />
        </label>
      </div>

      <div class="organization-filter" aria-label="Filtrar jogadores por organização">
        <button class:active={!organizationFilterId} type="button" on:click={() => chooseOrganization('')}>Todos</button>
        {#each matchingOrganizations as organization (organization.id)}
          <button
            class:active={organizationFilterId === organization.id}
            type="button"
            on:click={() => chooseOrganization(organization.id)}
          >{organization.name} <small>{organization.year}</small></button>
        {/each}
      </div>

      <div class="picker-results" aria-live="polite">
        {#each matchingPlayers as player (player.id)}
          {@const roles = validRoles(player)}
          {@const duplicate = selectedBaseIds.has(getPlayerBaseId(player))}
          <article class:blocked={duplicate}>
            <div class="picker-player-copy">
              <span class="picker-avatar">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{player.nickname ?? 'Unknown'}</strong>
                <small>{teamById.get(player.teamId ?? '')?.name ?? 'Sem organização'} · {player.year ?? '—'}</small>
              </div>
              <b>{player.overall ?? 70}</b>
            </div>
            {#if duplicate}
              <span class="duplicate-note">Já está na escalação</span>
            {:else}
              <div class="role-actions" aria-label={`Funções disponíveis para ${player.nickname ?? 'jogador'}`}>
                {#each roles as role}
                  <button type="button" on:click={() => onPick(player, role)}>{getRoleLabel(role)}</button>
                {/each}
              </div>
            {/if}
          </article>
        {:else}
          <p class="empty-result">Nenhum jogador encontrado. Limpe um dos filtros e tente novamente.</p>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .picker-backdrop { position: fixed; z-index: 130; inset: 0; display: grid; place-items: center; padding: 18px; background: rgb(2 4 6 / 82%); backdrop-filter: blur(10px); }
  .player-picker { width: min(920px, 100%); max-height: min(88dvh, 780px); display: grid; grid-template-rows: auto auto auto minmax(0, 1fr); border: 1px solid #d8aa45; background: var(--surface); box-shadow: 0 28px 90px rgb(0 0 0 / 58%); overflow: hidden; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px; border-bottom: 1px solid var(--line); }
  h2 { margin: 5px 0 0; font-size: clamp(2rem, 6vw, 3.25rem); }
  .eyebrow { color: #e6bd62; }
  .picker-close { width: 42px; height: 42px; border: 1px solid var(--line); color: var(--text); background: var(--surface-2); font-size: 1.6rem; cursor: pointer; }
  .picker-tools { display: grid; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
  label { display: grid; gap: 6px; }
  label span { color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  input { width: 100%; min-height: 46px; padding: 0 12px; border: 1px solid var(--line); border-radius: 0; color: var(--text); background: var(--surface-2); font: inherit; }
  input:focus-visible { outline: 2px solid #d8aa45; outline-offset: 2px; }
  .organization-filter { display: flex; gap: 7px; padding: 12px 20px; border-bottom: 1px solid var(--line); overflow-x: auto; }
  .organization-filter button, .role-actions button { min-height: 36px; padding: 0 10px; border: 1px solid var(--line); color: var(--muted); background: var(--surface-2); white-space: nowrap; cursor: pointer; }
  .organization-filter button.active { border-color: #d8aa45; color: #e6bd62; }
  .organization-filter small { color: inherit; }
  .picker-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 14px 20px 20px; overflow-y: auto; }
  article { min-width: 0; padding: 12px; border: 1px solid var(--line); background: var(--surface-2); }
  article.blocked { opacity: .52; }
  .picker-player-copy { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .picker-avatar { display: grid; place-items: center; width: 42px; height: 42px; color: #120e05; background: #d8aa45; font-weight: 900; }
  .picker-player-copy strong, .picker-player-copy small { display: block; min-width: 0; }
  .picker-player-copy strong { overflow-wrap: anywhere; }
  .picker-player-copy small { margin-top: 3px; color: var(--muted); font-size: .58rem; text-transform: uppercase; }
  .picker-player-copy b { font-size: 1.65rem; }
  .role-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
  .role-actions button { min-height: 32px; border-color: color-mix(in srgb, #d8aa45 45%, var(--line)); color: #e6bd62; font-size: .62rem; font-weight: 800; text-transform: uppercase; }
  .role-actions button:hover { border-color: #d8aa45; background: color-mix(in srgb, #d8aa45 12%, var(--surface-2)); }
  .duplicate-note { display: block; margin-top: 10px; color: var(--muted); font-size: .62rem; text-transform: uppercase; }
  .empty-result { grid-column: 1 / -1; padding: 28px; color: var(--muted); text-align: center; }

  @media (min-width: 720px) { .picker-tools { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 679px) {
    .picker-backdrop { place-items: end center; padding: 0; }
    .player-picker { max-height: 94dvh; }
    .picker-results { grid-template-columns: 1fr; padding-inline: 12px; }
    header, .picker-tools { padding-inline: 12px; }
    .organization-filter { padding-inline: 12px; }
  }
  @media (prefers-reduced-motion: reduce) { .picker-backdrop { backdrop-filter: none; } }
</style>
