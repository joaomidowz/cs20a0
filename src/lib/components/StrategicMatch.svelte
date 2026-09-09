<script lang="ts">
  import { onDestroy } from 'svelte';
  import SandboxSeriesViewer from './SandboxSeriesViewer.svelte';
  import { getMapName } from '$lib/game/maps';
  import { getCurrentVetoAction } from '$lib/game/map-veto';
  import { roundEventsToSandboxDetails } from '$lib/game/sandbox/rounds';
  import { advanceStrategicRound, applyStrategicVeto, resolveAutomaticVetos, strategicRoundContext, type StrategicAutomationPreferences, type StrategicSeriesState } from '$lib/game/strategic-series';
  import type { BuyDecision, MapId } from '$lib/game/types';
  export let state: StrategicSeriesState;
  export let preferences: StrategicAutomationPreferences;
  export let userTeamId: string;
  export let delay = 2400;
  export let onChange: (state: StrategicSeriesState) => void;
  export let onTeam: (id: string) => void = () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  $: pauseQueued = state.queuedPauses?.includes(userTeamId) ?? false;
  $: side = state.result.teamA.id === userTeamId ? 'a' as const : 'b' as const;
  $: context = state.map && !state.map.finished ? strategicRoundContext(state, side) : null;
  $: vetoAction = getCurrentVetoAction(state.veto);
  $: schedule(state, preferences, delay);
  $: match = { ...state.result, userMatch: true, roundNumber: 1, resolved: Boolean(state.result.winnerId), maps: state.result.maps.map(map => ({ ...map, details: roundEventsToSandboxDetails(map.events ?? []) })) };
  function schedule(current: StrategicSeriesState, prefs: StrategicAutomationPreferences, interval: number) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (current.result.winnerId) return;
    const ready = resolveAutomaticVetos(current, { [userTeamId]: prefs });
    if (ready !== current) {
      timer = setTimeout(() => onChange(ready), 0);
      return;
    }
    if (!current.veto.finished || !current.map) return;
    const ctx = strategicRoundContext(current, current.result.teamA.id === userTeamId ? 'a' : 'b');
    if (!prefs.autoEconomy && ctx.legalBuys.length > 1) return;
    timer = setTimeout(() => playRound(), Math.max(150, interval));
  }
  function playRound(buy?: BuyDecision) {
    if (!context) return;
    const decision = { buy: buy ?? context.recommendation.buy, tacticalPause: pauseQueued || (preferences.autoPause && context.recommendation.tacticalPause) };
    onChange(advanceStrategicRound(state, { [side]: decision }));
  }
  function veto(mapId: MapId) { onChange(applyStrategicVeto(state, mapId)); }
  onDestroy(() => { if (timer) clearTimeout(timer); });
</script>

{#if !state.veto.finished && vetoAction?.actorId === userTeamId}
  <section class="panel decision" aria-live="polite">
    <span class="eyebrow">{vetoAction.action === 'ban' ? 'BANIR MAPA' : 'ESCOLHER MAPA'}</span>
    <div class="actions">{#each state.veto.available as mapId}<button class="secondary" type="button" on:click={() => veto(mapId)}>{getMapName(mapId)}</button>{/each}</div>
  </section>
{/if}
<SandboxSeriesViewer {match} {userTeamId} {onTeam} {delay} controlled controlledActiveMap={Math.max(0, match.maps.length - 1)} controlledVisibleRounds={match.maps.at(-1)?.rounds.length ?? 0} controlledFinished={Boolean(state.result.winnerId)} />
{#if context && !state.result.winnerId}
  <section class="panel decision" aria-live="polite">
    <span class="eyebrow">PRÓXIMO ROUND · R{state.map!.round + 1} · ${context.money}</span>
    {#if !preferences.autoEconomy && context.legalBuys.length > 1}
      <div class="actions">{#each ['eco', 'force', 'full'] as buy}<button class="secondary" type="button" disabled={!context.legalBuys.includes(buy as BuyDecision)} title={!context.legalBuys.includes(buy as BuyDecision) ? 'Dinheiro insuficiente' : ''} on:click={() => playRound(buy as BuyDecision)}>{buy === 'eco' ? 'Eco' : buy === 'force' ? 'Force' : 'Full Buy'}</button>{/each}</div>
    {:else}<small>Compra automática · {context.recommendation.buy.toUpperCase()}</small>{/if}
    {#if !preferences.autoPause}<button class="secondary" type="button" disabled={!context.pauseAvailable || pauseQueued} on:click={() => onChange({ ...state, queuedPauses: [...(state.queuedPauses ?? []), userTeamId] })}>{pauseQueued ? 'Pausa tática solicitada' : context.pauseAvailable ? 'Pedir pausa tática' : 'Pausa indisponível neste round'}</button>{/if}
  </section>
{/if}
<style>
  .decision{display:grid;gap:12px;padding:16px;margin:12px 0}.actions{display:flex;flex-wrap:wrap;gap:8px}.decision small{color:var(--muted)}
</style>
