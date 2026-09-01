<script lang="ts">
  import { getTeamPlayers, playerById, teamById, teams } from '$lib/game/data';
  import { getEligibleSlotRoles, getRoleLabel, ROLE_LIMITS } from '$lib/game/roleRules';
  import type { SimulationMode } from '$lib/game/preferences';
  import type { LineupSlotRole, OrgStyle, Player, SelectedPlayer } from '$lib/game/types';
  import type { SandboxLineupSelection } from '$lib/game/sandbox/types';
  import SandboxPlayerPicker from './SandboxPlayerPicker.svelte';

  export let selection: SandboxLineupSelection;
  export let errors: Record<string, string> = {};
  export let simulationMode: SimulationMode = 'auto';
  export let onChange: (selection: SandboxLineupSelection) => void = () => {};
  export let onSimulationMode: (mode: SimulationMode) => void = () => {};

  const SANDBOX_SLOT_COUNT = 5;
  const styles: Array<{ value: OrgStyle; label: string; note: string }> = [
    { value: 'tactical', label: 'Tático', note: 'Domínio, utilitárias e rounds longos' },
    { value: 'balanced', label: 'Equilibrado', note: 'Controle com mudanças de cadência' },
    { value: 'aggressive', label: 'Agressivo', note: 'Rushes, meio e contato rápido' }
  ];
  const rolePreference: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];

  let organizationQuery = '';
  let editingSlot: number | null = null;

  $: selectedOrganization = teamById.get(selection.organizationId) ?? null;
  $: organizationResults = teams
    .filter((team) => `${team.name ?? ''} ${team.year ?? ''}`.toLowerCase().includes(organizationQuery.trim().toLowerCase()))
    .slice(0, 10);

  function historicalRoster(organizationId: string): SelectedPlayer[] {
    const organization = teamById.get(organizationId) ?? null;
    const used = new Map<LineupSlotRole, number>();
    return getTeamPlayers(organization).slice(0, SANDBOX_SLOT_COUNT).map((player) => {
      const eligible = getEligibleSlotRoles(player);
      const selectedSlotRole = rolePreference.find((role) => eligible.includes(role) && (used.get(role) ?? 0) < ROLE_LIMITS[role])
        ?? eligible.find((role) => (used.get(role) ?? 0) < ROLE_LIMITS[role])
        ?? 'rifler';
      used.set(selectedSlotRole, (used.get(selectedSlotRole) ?? 0) + 1);
      return { playerId: player.id, selectedSlotRole };
    });
  }

  function chooseOrganization(organizationId: string) {
    const organization = teamById.get(organizationId);
    if (!organization) return;
    organizationQuery = `${organization.name ?? ''} ${organization.year ?? ''}`.trim();
    onChange({ ...selection, organizationId, players: historicalRoster(organizationId) });
  }

  function updateStyle(style: OrgStyle) {
    onChange({ ...selection, style });
  }

  function replacePlayer(index: number, player: Player, role: LineupSlotRole) {
    const nextPlayers = Array.from({ length: SANDBOX_SLOT_COUNT }, (_, slot) => selection.players[slot])
      .map((selected, slot) => slot === index ? { playerId: player.id, selectedSlotRole: role } : selected)
      .filter((selected): selected is SelectedPlayer => Boolean(selected));
    onChange({ ...selection, players: nextPlayers });
    editingSlot = null;
  }

  function updateRole(index: number, selectedSlotRole: LineupSlotRole) {
    const nextPlayers = selection.players.map((selected, slot) => slot === index ? { ...selected, selectedSlotRole } : selected);
    onChange({ ...selection, players: nextPlayers });
  }
</script>

<section class="sandbox-builder" aria-labelledby="sandbox-lineup-title">
  <div class="builder-grid">
    <aside class="setup-instruments">
      <div class="instrument-heading">
        <span class="eyebrow">Identidade do Time A</span>
        <h2 id="sandbox-lineup-title">Monte sua organização</h2>
        <p>A camisa define o nome. Os cinco jogadores podem vir de qualquer time ou era.</p>
      </div>

      <label class="organization-control">
        <span>Organização</span>
        <input
          name="sandbox-organization"
          bind:value={organizationQuery}
          placeholder="Busque por time ou ano"
          autocomplete="off"
          aria-describedby={errors.organizationId ? 'organization-error' : undefined}
        />
      </label>
      <div class="organization-results" aria-label="Organizações encontradas">
        {#each organizationResults as organization (organization.id)}
          <button
            class:active={organization.id === selection.organizationId}
            type="button"
            on:click={() => chooseOrganization(organization.id)}
          >
            <strong>{organization.name ?? 'Time'}</strong>
            <small>{organization.year ?? '—'} · PWR {organization.power ?? organization.teamPowerPreview ?? 70}</small>
          </button>
        {/each}
      </div>
      {#if errors.organizationId}<p id="organization-error" class="field-error">{errors.organizationId}</p>{/if}

      <div class="control-group" role="group" aria-label="Estilo de jogo">
        <span class="control-label">Estilo de jogo</span>
        {#each styles as style}
          <button class:active={selection.style === style.value} type="button" on:click={() => updateStyle(style.value)}>
            <strong>{style.label}</strong><small>{style.note}</small>
          </button>
        {/each}
      </div>

      <div class="control-group compact" role="group" aria-label="Ritmo do Major">
        <span class="control-label">Ritmo do Major</span>
        <button class:active={simulationMode === 'auto'} type="button" on:click={() => onSimulationMode('auto')}>
          <strong>Automático</strong><small>Partidas avançam sozinhas</small>
        </button>
        <button class:active={simulationMode === 'manual'} type="button" on:click={() => onSimulationMode('manual')}>
          <strong>Manual</strong><small>Você libera cada partida</small>
        </button>
      </div>
    </aside>

    <div class="lineup-workbench">
      <header>
        <div>
          <span class="eyebrow">Bancada de escalação</span>
          <h2>{selectedOrganization?.name ?? 'Time A'} <span>{selectedOrganization?.year ?? ''}</span></h2>
        </div>
        <span class="lineup-count">{selection.players.length}/5</span>
      </header>

      <div class="lineup-rail" aria-label="Cinco jogadores do Time A">
        {#each Array(SANDBOX_SLOT_COUNT) as _, index}
          {@const selected = selection.players[index]}
          {@const player = selected ? playerById.get(selected.playerId) : null}
          <article
            class:filled={Boolean(player)}
            class:invalid={Boolean(errors[`players.${index}.playerId`] || errors[`players.${index}.selectedSlotRole`])}
            data-testid={`sandbox-slot-${index + 1}`}
          >
            <span class="slot-number">0{index + 1}</span>
            {#if player && selected}
              <button class="player-identity" type="button" on:click={() => editingSlot = index} aria-label={`Trocar ${player.nickname ?? 'jogador'}`}>
                <span class="player-avatar">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</span>
                <strong>{player.nickname ?? 'Unknown'}</strong>
                <small>{teamById.get(player.teamId ?? '')?.name ?? 'Free agent'} · {player.year ?? '—'}</small>
                <b>{player.overall ?? 70}</b>
              </button>
              <label class="role-control">
                <span>Função</span>
                <select value={selected.selectedSlotRole} on:change={(event) => updateRole(index, (event.currentTarget as HTMLSelectElement).value as LineupSlotRole)}>
                  {#each getEligibleSlotRoles(player) as role}
                    <option value={role}>{getRoleLabel(role)}</option>
                  {/each}
                </select>
              </label>
              {#if errors[`players.${index}.playerId`]}
                <p class="slot-error">{errors[`players.${index}.playerId`]}</p>
              {:else if errors[`players.${index}.selectedSlotRole`]}
                <p class="slot-error">{errors[`players.${index}.selectedSlotRole`]}</p>
              {/if}
            {:else}
              <button class="empty-slot" type="button" on:click={() => editingSlot = index}>
                <strong>Adicionar jogador</strong><small>Escolha qualquer era</small>
              </button>
            {/if}
          </article>
        {/each}
      </div>
      {#if errors.players}<p class="field-error lineup-error">{errors.players}</p>{/if}

      <footer>
        <p><strong>Linha livre.</strong> A organização não limita quem veste a camisa.</p>
        {#if selectedOrganization}
          <button class="restore-roster" type="button" on:click={() => chooseOrganization(selectedOrganization!.id)}>Restaurar elenco histórico</button>
        {/if}
      </footer>
    </div>
  </div>
</section>

<SandboxPlayerPicker
  open={editingSlot !== null}
  slotIndex={editingSlot ?? 0}
  selectedPlayers={selection.players}
  onPick={(player, role) => replacePlayer(editingSlot ?? 0, player, role)}
  onClose={() => editingSlot = null}
/>

<style>
  .sandbox-builder { --sandbox-gold: #d8aa45; --sandbox-gold-bright: #f0cb78; }
  .builder-grid { display: grid; gap: 16px; }
  .setup-instruments, .lineup-workbench { border: 1px solid var(--line); background: var(--surface); }
  .setup-instruments { padding: 20px; }
  .instrument-heading h2 { max-width: 100%; margin: 7px 0 10px; font-size: clamp(1.9rem, 3vw, 2.5rem); overflow-wrap: anywhere; }
  .instrument-heading p { max-width: 480px; color: var(--muted); font-size: .84rem; line-height: 1.55; }
  .eyebrow { color: var(--sandbox-gold-bright); }
  .organization-control { display: grid; gap: 7px; margin-top: 20px; }
  .organization-control > span, .control-label, .role-control span { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .organization-control input { min-height: 46px; padding: 0 12px; border: 1px solid var(--line); border-radius: 0; color: var(--text); background: var(--surface-2); font: inherit; }
  .organization-control input:focus-visible, select:focus-visible { outline: 2px solid var(--sandbox-gold); outline-offset: 2px; }
  .organization-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; max-height: 180px; margin-top: 7px; overflow-y: auto; }
  .organization-results button, .control-group button { padding: 10px; border: 1px solid var(--line); color: var(--text); background: var(--surface-2); text-align: left; cursor: pointer; }
  .organization-results button.active, .control-group button.active { border-color: var(--sandbox-gold); box-shadow: inset 3px 0 var(--sandbox-gold); }
  .organization-results strong, .organization-results small, .control-group strong, .control-group small { display: block; }
  .organization-results small, .control-group small { margin-top: 3px; color: var(--muted); font-size: .56rem; line-height: 1.35; }
  .control-group { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 20px; }
  .control-group.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .control-label { grid-column: 1 / -1; margin-bottom: 1px; }
  .field-error, .slot-error { color: #ff9a8c; font-size: .68rem; line-height: 1.35; }
  .field-error { margin: 8px 0 0; }
  .lineup-workbench { position: relative; padding: 20px; overflow: hidden; }
  .lineup-workbench::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: linear-gradient(90deg, transparent, var(--sandbox-gold), transparent); }
  .lineup-workbench > header { display: flex; align-items: end; justify-content: space-between; gap: 15px; margin-bottom: 18px; }
  .lineup-workbench h2 { margin: 6px 0 0; font-size: clamp(2rem, 6vw, 3.4rem); }
  .lineup-workbench h2 span { color: var(--muted); font-size: .55em; }
  .lineup-count { display: grid; place-items: center; min-width: 58px; min-height: 48px; border: 1px solid var(--sandbox-gold); color: var(--sandbox-gold-bright); font: 900 1.4rem 'Arial Narrow', Impact, sans-serif; }
  .lineup-rail { position: relative; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; }
  .lineup-rail::before { content: ''; position: absolute; z-index: 0; left: 4%; right: 4%; top: 35px; height: 1px; background: var(--sandbox-gold); box-shadow: 0 0 16px color-mix(in srgb, var(--sandbox-gold) 45%, transparent); }
  .lineup-rail article { position: relative; z-index: 1; min-width: 0; min-height: 264px; padding: 11px; border: 1px solid var(--line); border-right: 0; background: linear-gradient(165deg, var(--surface-2), var(--surface)); }
  .lineup-rail article:last-child { border-right: 1px solid var(--line); }
  .lineup-rail article.filled { border-top-color: var(--sandbox-gold); }
  .lineup-rail article.invalid { border-color: var(--danger); }
  .slot-number { display: grid; place-items: center; width: 42px; height: 42px; margin-inline: auto; border: 1px solid var(--sandbox-gold); color: var(--sandbox-gold-bright); background: var(--surface); font: 900 1rem 'Arial Narrow', Impact, sans-serif; }
  .player-identity, .empty-slot { width: 100%; border: 0; color: var(--text); background: transparent; cursor: pointer; }
  .player-identity { position: relative; display: grid; justify-items: center; padding: 18px 3px 9px; text-align: center; }
  .player-avatar { display: grid; place-items: center; width: 54px; height: 54px; margin-bottom: 9px; color: #171005; background: var(--sandbox-gold); font-weight: 900; clip-path: polygon(9% 0, 100% 0, 91% 100%, 0 100%); }
  .player-identity strong, .player-identity small { display: block; max-width: 100%; overflow-wrap: anywhere; }
  .player-identity strong { font-size: 1rem; }
  .player-identity small { min-height: 28px; margin-top: 4px; color: var(--muted); font-size: .5rem; line-height: 1.35; text-transform: uppercase; }
  .player-identity b { margin-top: 8px; color: var(--sandbox-gold-bright); font-size: 1.65rem; }
  .role-control { display: grid; gap: 5px; margin-top: 2px; }
  .role-control select { width: 100%; min-height: 36px; padding: 0 6px; border: 1px solid var(--line); border-radius: 0; color: var(--text); background: var(--surface-2); font-size: .62rem; font-weight: 800; text-transform: uppercase; }
  .slot-error { margin: 7px 0 0; }
  .empty-slot { display: grid; align-content: center; min-height: 185px; color: var(--muted); }
  .empty-slot strong, .empty-slot small { display: block; }
  .empty-slot strong { color: var(--sandbox-gold-bright); font-size: .85rem; text-transform: uppercase; }
  .empty-slot small { margin-top: 5px; font-size: .57rem; }
  .lineup-error { margin-top: 10px; }
  .lineup-workbench footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--line); }
  .lineup-workbench footer p { margin: 0; color: var(--muted); font-size: .7rem; }
  .lineup-workbench footer strong { color: var(--sandbox-gold-bright); }
  .restore-roster { min-height: 38px; padding: 0 12px; border: 1px solid var(--line); color: var(--text); background: var(--surface-2); font-size: .61rem; font-weight: 800; text-transform: uppercase; cursor: pointer; }

  @media (min-width: 1040px) { .builder-grid { grid-template-columns: 320px minmax(0, 1fr); align-items: start; } }
  @media (max-width: 820px) {
    .lineup-rail { grid-template-columns: 1fr; gap: 8px; }
    .lineup-rail::before { left: 32px; right: auto; top: 20px; bottom: 20px; width: 1px; height: auto; }
    .lineup-rail article, .lineup-rail article:last-child { min-height: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr) minmax(120px, .62fr); gap: 9px; align-items: center; border-right: 1px solid var(--line); }
    .slot-number { margin: 0; }
    .player-identity { grid-template-columns: auto minmax(0, 1fr) auto; justify-items: start; gap: 8px; padding: 0; text-align: left; }
    .player-avatar { grid-row: 1 / span 2; width: 42px; height: 42px; margin: 0; }
    .player-identity small { min-height: 0; margin: 0; }
    .player-identity b { grid-column: 3; grid-row: 1 / span 2; margin: 0; }
    .slot-error { grid-column: 2 / -1; }
    .empty-slot { min-height: 66px; align-content: center; text-align: left; }
  }
  @media (max-width: 560px) {
    .control-group { grid-template-columns: 1fr; }
    .control-group.compact { grid-template-columns: 1fr 1fr; }
    .organization-results { grid-template-columns: 1fr; }
    .lineup-workbench, .setup-instruments { padding: 14px; }
    .lineup-rail article, .lineup-rail article:last-child { grid-template-columns: 42px minmax(0, 1fr); }
    .role-control { grid-column: 2; }
    .lineup-workbench footer { align-items: stretch; flex-direction: column; }
  }
</style>
