<script lang="ts">
  import { onMount } from 'svelte';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { AccountError } from '$lib/game/online/account';
  import { claimMission, fetchMissions, type MissionState } from '$lib/game/online/collection';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  /** Chamado depois de um resgate, com o saldo novo (e se vieram sobres grátis). */
  export let onClaimed: (result: { wallet: number; packs: number }) => void = () => {};

  type Scope = MissionState['scope'];
  const TABS: Array<{ scope: Scope; key: OnlineTranslationKey }> = [
    { scope: 'daily', key: 'missionsDaily' },
    { scope: 'weekly', key: 'missionsWeekly' },
    { scope: 'season', key: 'missionsSeason' },
    { scope: 'solo', key: 'missionsSolo' }
  ];

  let missions: MissionState[] = [];
  let streak = { current: 0, best: 0 };
  let tab: Scope = 'daily';
  let busyId = '';
  let error = '';
  let loading = true;
  let notice = '';

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: shown = missions.filter((mission) => mission.scope === tab).sort((a, b) => Number(a.claimed) * 2 + Number(a.progress < a.target) - (Number(b.claimed) * 2 + Number(b.progress < b.target)));
  $: ready = (scope: Scope) => missions.filter((mission) => mission.scope === scope && !mission.claimed && mission.progress >= mission.target).length;

  const label = (id: string) => translateOnline(language, `mission_${id}` as OnlineTranslationKey) ?? id;
  const resetsIn = (iso: string) => {
    const ms = Math.max(0, Date.parse(iso) - Date.now());
    const hours = Math.floor(ms / 3_600_000);
    return hours >= 48 ? `${Math.floor(hours / 24)}d` : `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  };

  async function load() {
    try {
      const result = await fetchMissions(serverUrl);
      missions = result.missions;
      streak = result.soloStreak;
      error = '';
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { loading = false; }
  }

  async function claim(mission: MissionState) {
    if (busyId) return;
    busyId = mission.id;
    notice = '';
    try {
      const result = await claimMission(serverUrl, mission.id);
      onClaimed({ wallet: result.wallet, packs: result.packs });
      notice = `${uiCopy(language, 'received')}: ${mission.coins.toLocaleString(language)} coins${mission.packs ? ` + ${mission.packs} ${t('missionPacks')}` : ''}.`;
      await load();
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally {
      busyId = '';
    }
  }

  onMount(() => { void load(); });
</script>

<section class="panel missions-panel" aria-label={t('missions')}>
  <div class="section-heading">
    <div><span class="eyebrow">{t('missions').toUpperCase()}</span><h2>{t('missions')}</h2></div>
    {#if tab === 'solo'}<strong class="count">{t('soloStreakNow')} {streak.current} <small>· {t('missionBest')} {streak.best}</small></strong>{/if}
  </div>
  <div class="segmented-control missions-tabs" role="group" aria-label={t('missions')}>
    {#each TABS as item}
      <button type="button" aria-pressed={tab === item.scope} class:active={tab === item.scope} on:click={() => (tab = item.scope)}>
        {t(item.key)}{#if ready(item.scope)}<b class="missions-badge">{ready(item.scope)}</b>{/if}
      </button>
    {/each}
  </div>
  <p class="note">{tab === 'solo' ? t('missionSoloHint') : t('missionOnlineHint')}</p>
  {#if error}<p class="missions-error" role="alert">{error}</p>{/if}
  {#if loading}<p class="note" role="status">{uiCopy(language, 'loading')}</p>{/if}
  {#if notice}<p class="missions-notice" role="status">{notice}</p>{/if}
  <ul class="missions-list">
    {#each shown as mission (mission.id)}
      {@const done = mission.progress >= mission.target}
      <li class:ready={done && !mission.claimed} class:claimed={mission.claimed}>
        <div class="missions-text">
          <strong>{label(mission.id)}</strong>
          <small>{t('missionResets')} {resetsIn(mission.resetsAt)}</small>
        </div>
        <div class="missions-progress">
          <div class="missions-bar" role="progressbar" aria-valuemin="0" aria-valuemax={mission.target} aria-label={label(mission.id)} aria-valuenow={Math.min(mission.progress, mission.target)}>
            <span style={`width: ${Math.min(100, (mission.progress / mission.target) * 100)}%`}></span>
          </div>
          <span class="missions-count">{Math.min(mission.progress, mission.target)}/{mission.target}</span>
        </div>
        <span class="missions-reward"><i></i>{mission.coins.toLocaleString(language)}{#if mission.packs}<em>+ {mission.packs} {t('missionPacks')}</em>{/if}</span>
        <div class="missions-action">
          {#if mission.claimed}
            <span class="missions-claimed">✓ {t('missionClaimed')}</span>
          {:else}
            <button type="button" class={done ? 'primary' : 'secondary'} disabled={!done || !!busyId} on:click={() => claim(mission)}>{busyId === mission.id ? uiCopy(language, 'working') : done ? t('missionClaim') : uiCopy(language, 'progress')}</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .missions-notice { margin:0; padding:12px; border-left:3px solid var(--accent); color:var(--accent); background:var(--surface-2); }
  @media(max-width:520px) { .missions-tabs { display:grid; grid-template-columns:1fr 1fr; } .missions-panel { padding:14px; } .missions-list li { padding:12px; } }
  .missions-panel { display: grid; gap: 16px; padding: 22px; align-content: start; }
  .count { color: var(--accent); font: 900 1.3rem/1 'Arial Narrow', Impact, sans-serif; white-space: nowrap; }
  .count small { color: var(--muted); font: 700 .7rem Inter, Arial, sans-serif; }
  .missions-tabs button { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 0; }
  .missions-badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; background: var(--accent); color: #0a0d08; font-size: .6rem; font-weight: 900; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .missions-error { margin: 0; padding: 10px 12px; border: 1px solid var(--danger); color: #ff9b90; font-size: .78rem; }
  .missions-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .missions-list li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(140px, 1fr) 150px 150px; gap: 16px; align-items: center; padding: 14px 16px; border: 1px solid var(--line); border-left: 3px solid var(--line); background: var(--surface-2); }
  .missions-list li.ready { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }
  .missions-list li.claimed { border-left-color: var(--line); background: var(--surface); }
  .missions-list li.claimed .missions-text, .missions-list li.claimed .missions-progress, .missions-list li.claimed .missions-reward { opacity: .5; }
  .missions-text { display: grid; gap: 4px; min-width: 0; }
  .missions-text strong { font-size: .86rem; line-height: 1.3; }
  .missions-text small { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .missions-progress { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
  .missions-bar { height: 6px; background: var(--surface); border: 1px solid var(--line); }
  .missions-bar span { display: block; height: 100%; background: var(--accent); transition: width 300ms ease-out; }
  .missions-count { color: var(--text); font: 900 1rem/1 'Arial Narrow', Impact, sans-serif; font-variant-numeric: tabular-nums; }
  .missions-reward { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 7px; font-size: .8rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .missions-reward i { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a8, #d9a441 60%, #8a5d10); }
  .missions-reward em { color: var(--accent); font-size: .66rem; font-style: normal; text-transform: uppercase; }
  .missions-action { display: grid; }
  .missions-action button { min-height: 42px; padding: 0 12px; border-radius: 0; font-size: .66rem; }
  .missions-claimed { display: grid; place-items: center; min-height: 42px; border: 1px solid var(--line); color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  @media (max-width: 860px) {
    .missions-list li { grid-template-columns: minmax(0, 1fr) auto; gap: 10px 14px; }
    .missions-text, .missions-progress { grid-column: 1 / -1; }
  }
</style>
