<script lang="ts">
  import { onMount } from 'svelte';
  import { playerTitle } from '$lib/game/data';
  import { translate, translateTitle } from '$lib/game/i18n';
  import { getPickReasonText } from '$lib/game/pickPresentation';
  import { getPlayerPlaystyle } from '$lib/game/playstyle';
  import { getEligibleSlotRoles, getRoleLabel, validatePlayerPick } from '$lib/game/roleRules';
  import type { GameMode, Language, LineupSlotRole, Player, SelectedPlayer } from '$lib/game/types';

  export let player: Player;
  export let mode: GameMode;
  export let language: Language = 'en';
  export let draftComplete = false;
  export let lineup: SelectedPlayer[] = [];
  export let playerLookup: (id: string) => Player | undefined;
  export let onConfirm: (player: Player, role: LineupSlotRole) => void = () => {};
  export let onClose: () => void = () => {};

  $: eligibleRoles = getEligibleSlotRoles(player);
  $: detailsValidation = validatePlayerPick(player, lineup, undefined, playerLookup);
  $: showFullIntel = mode === 'premier' || draftComplete;
  $: rarity = (player.rarity ?? 'common').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  onMount(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  });

  function vagueTraits() {
    const playstyle = getPlayerPlaystyle(player);
    const traits = [translate(language, playstyle === 'aggressive' ? 'veryAggressive' : playstyle === 'tactical' ? 'tacticalProfile' : 'consistentPlayer')];
    if ((player.clutch ?? 0) >= 92) traits.push(translate(language, 'greatClutch'));
    if ((player.role ?? '').includes('awp')) traits.push(translate(language, 'mainAwper'));
    if (traits.length === 1) traits.push(translate(language, 'versatileProfile'));
    return traits;
  }
</script>

<div class="sheet-backdrop" role="presentation" on:click={onClose} on:keydown={(event) => event.key === 'Escape' && onClose()}>
  <div class="player-sheet {mode === 'faceit' && !draftComplete ? 'rarity-hidden' : `rarity-${rarity}`}" role="dialog" aria-modal="true" aria-label={`Detalhes de ${player.nickname}`} tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
    <button class="sheet-close" type="button" on:click={onClose}>×</button>
    <div class="sheet-player">
      <div class="avatar huge">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</div>
      <div>
        <span class="eyebrow">{#if showFullIntel}{player.rarity ?? 'common'} · {/if}{player.teamId ?? ''}</span>
        <h2>{player.nickname ?? 'Unknown'}</h2>
        <p>{translateTitle(language, playerTitle(player))} · {player.role ?? 'rifler'}</p>
      </div>
      <strong>{showFullIntel ? player.overall ?? 70 : '??'}</strong>
    </div>
    {#if showFullIntel}
      <div class="attribute-grid">
        {#each ['firepower', 'clutch', 'entry', 'awp', 'support', 'igl', 'experience', 'consistency', 'mental'] as attribute}
          <div><span>{attribute}</span><b>{player[attribute as keyof Player] ?? 70}</b><i><em style={`width:${Number(player[attribute as keyof Player] ?? 70)}%`}></em></i></div>
        {/each}
      </div>
      {#if player.traits?.length}<div class="trait-list">{#each player.traits.slice(0, 4) as trait}<span>{trait}</span>{/each}{#if player.traits.length > 4}<span>+{player.traits.length - 4}</span>{/if}</div>{/if}
    {:else}
      <div class="blind-intel"><span class="eyebrow">{translate(language, 'hiddenStats')}</span>{#each vagueTraits() as trait}<strong>{trait}</strong>{/each}</div>
    {/if}
    {#if !draftComplete}
      <div class="role-picker">
        <span class="eyebrow">{translate(language, 'howUsePlayer')}</span>
        <h3>{player.nickname} · {translate(language, 'assignedRole')}</h3>
        {#if !detailsValidation.ok}<p class="pick-blocked-reason">{getPickReasonText(language, detailsValidation.reason)}</p>{/if}
        <div>
          {#each eligibleRoles as role}
            {@const roleValidation = validatePlayerPick(player, lineup, role, playerLookup)}
            <button class="secondary role-option" type="button" disabled={!roleValidation.ok} on:click={() => onConfirm(player, role)}>
              <span>{translate(language, eligibleRoles.length === 1 ? 'addAs' : 'useAs')} {getRoleLabel(role)}</span>
              {#if !roleValidation.ok}<small>{getPickReasonText(language, roleValidation.reason)}</small>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
