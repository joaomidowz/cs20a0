<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import { MAP_POOL, getMapName } from '$lib/game/maps';
  import type { Language, MapId, MapVetoStep } from '$lib/game/types';

  export let available: MapId[] = [];
  export let steps: MapVetoStep[] = [];
  export let turnTeamId: string | null = null;
  export let action: 'ban' | 'pick' | null = null;
  export let teamNames: Record<string, string> = {};
  export let myTeamId: string | null = null;
  /** Familiarity (0-100) of the viewer's lineup per map, when known. */
  export let familiarity: Partial<Record<MapId, number>> = {};
  export let countdown = '';
  export let language: Language = 'pt-BR';
  export let onAction: (mapId: MapId) => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: myTurn = Boolean(myTeamId && turnTeamId === myTeamId);
  $: stepByMap = new Map(steps.map((step) => [step.mapId, step]));
  $: ordered = [...MAP_POOL].filter((mapId) => stepByMap.has(mapId) || available.includes(mapId));
  $: isMine = (teamId: string | null) => Boolean(teamId && teamId === myTeamId);
</script>

<section class="veto-board panel" aria-live="polite">
  <header>
    <div><span class="eyebrow">{t('vetoTitle')}</span><h2>{myTurn ? (action === 'pick' ? t('vetoPickNow') : t('vetoBanNow')) : turnTeamId ? `${t('vetoWaiting')} · ${teamNames[turnTeamId] ?? ''}` : t('vetoDecider')}</h2></div>
    {#if turnTeamId}<div class="veto-turn" class:mine={myTurn}><span>{myTurn ? t('vetoYourTurn') : t('vetoOpponentTurn')}</span>{#if countdown}<b>{countdown}</b>{/if}</div>{/if}
  </header>
  <ol class="veto-steps">
    {#each steps as step (step.order)}
      <li class={step.action} class:mine={isMine(step.teamId)}><small>{step.action === 'ban' ? t('vetoBanned') : step.action === 'pick' ? t('vetoPicked') : t('vetoDecider')}</small><strong>{getMapName(step.mapId)}</strong><span>{step.teamId ? teamNames[step.teamId] ?? '' : ''}</span></li>
    {/each}
  </ol>
  <div class="veto-grid">
    {#each ordered as mapId (mapId)}
      {@const step = stepByMap.get(mapId)}
      <button
        type="button"
        class:banned={step?.action === 'ban'}
        class:picked={step?.action === 'pick'}
        class:decider={step?.action === 'decider'}
        class:mine={Boolean(step) && isMine(step?.teamId ?? null)}
        class:selectable={myTurn && !step}
        disabled={!myTurn || Boolean(step)}
        on:click={() => onAction(mapId)}
      >
        <strong>{getMapName(mapId)}</strong>
        <span>{step ? (step.action === 'ban' ? t('vetoBanned') : step.action === 'pick' ? `${t('vetoPicked')} · ${teamNames[step.teamId ?? ''] ?? ''}` : t('vetoDecider')) : t('vetoAvailable')}</span>
        {#if familiarity[mapId] !== undefined}<i class="familiarity"><em style={`width:${familiarity[mapId]}%`}></em></i>{/if}
      </button>
    {/each}
  </div>
</section>

<style>
  .veto-board{display:grid;gap:14px;margin-bottom:14px;padding:20px}
  .veto-board header{display:flex;align-items:start;justify-content:space-between;gap:12px}.veto-board h2{margin:4px 0 0;font-size:1.5rem}
  .veto-turn{display:grid;justify-items:end;gap:4px;color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.veto-turn.mine{color:var(--accent)}.veto-turn b{font:900 1.6rem 'Arial Narrow',Impact,sans-serif;font-variant-numeric:tabular-nums}
  .veto-steps{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
  .veto-steps li{display:grid;gap:2px;min-width:92px;padding:6px 8px;border:1px solid var(--line);background:var(--surface-2);animation:stepIn .25s ease-out}
  .veto-steps li.ban{opacity:.55}.veto-steps li.ban strong{text-decoration:line-through}.veto-steps li.pick{border-color:var(--accent-2)}.veto-steps li.mine{border-color:var(--accent)}.veto-steps li.decider{border-color:var(--text)}
  .veto-steps small{color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.08em}.veto-steps strong{font-size:.85rem;text-transform:uppercase}.veto-steps span{overflow:hidden;color:var(--muted);font-size:.55rem;text-overflow:ellipsis;white-space:nowrap}
  .veto-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px}
  .veto-grid button{display:grid;gap:4px;padding:12px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);text-align:left;cursor:default;transition:border-color .15s ease,transform .15s ease}
  .veto-grid button strong{font-size:1rem;text-transform:uppercase}.veto-grid button span{color:var(--muted);font-size:.55rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  .veto-grid button.selectable{cursor:pointer;border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.veto-grid button.selectable:hover{border-color:var(--accent);transform:translateY(-2px)}
  .veto-grid button.banned{opacity:.35}.veto-grid button.banned strong{text-decoration:line-through}.veto-grid button.picked{border-color:var(--accent-2)}.veto-grid button.picked span{color:var(--accent-2)}.veto-grid button.mine{border-color:var(--accent)}.veto-grid button.mine span{color:var(--accent)}.veto-grid button.decider{border-color:var(--text)}
  .veto-grid .familiarity{display:block;height:3px;background:var(--line)}.veto-grid .familiarity em{display:block;height:100%;background:var(--accent)}
  @keyframes stepIn{from{transform:translateY(4px);opacity:0}}
</style>
