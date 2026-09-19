<script lang="ts">
  import { onMount } from 'svelte';
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

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: shown = missions.filter((mission) => mission.scope === tab);
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
    }
  }

  async function claim(mission: MissionState) {
    if (busyId) return;
    busyId = mission.id;
    try {
      const result = await claimMission(serverUrl, mission.id);
      onClaimed({ wallet: result.wallet, packs: result.packs });
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
  <header class="missions-head">
    <h2>{t('missions')}</h2>
    <div class="missions-tabs" role="tablist">
      {#each TABS as item}
        <button type="button" role="tab" aria-selected={tab === item.scope} class:active={tab === item.scope} on:click={() => (tab = item.scope)}>
          {t(item.key)}{#if ready(item.scope)}<i class="missions-dot" aria-hidden="true"></i>{/if}
        </button>
      {/each}
    </div>
  </header>
  <p class="missions-hint">
    {tab === 'solo' ? t('missionSoloHint') : t('missionOnlineHint')}
    {#if tab === 'solo'} · {t('soloStreakNow')}: <b>{streak.current}</b> (máx. {streak.best}){/if}
  </p>
  {#if error}<p class="missions-error" role="alert">{error}</p>{/if}
  <ul class="missions-list">
    {#each shown as mission (mission.id)}
      {@const done = mission.progress >= mission.target}
      <li class:done class:claimed={mission.claimed}>
        <div class="missions-text">
          <strong>{label(mission.id)}</strong>
          <small>{mission.coins.toLocaleString(language)} coins{#if mission.packs} + {mission.packs} {t('missionPacks')}{/if} · {t('missionResets')} {resetsIn(mission.resetsAt)}</small>
          <div class="missions-bar" role="progressbar" aria-valuemin="0" aria-valuemax={mission.target} aria-valuenow={mission.progress}>
            <span style={`width: ${Math.min(100, (mission.progress / mission.target) * 100)}%`}></span>
          </div>
        </div>
        <div class="missions-action">
          <span class="missions-count">{mission.progress}/{mission.target}</span>
          {#if mission.claimed}
            <span class="missions-claimed">{t('missionClaimed')}</span>
          {:else}
            <button type="button" class="primary" disabled={!done || busyId === mission.id} on:click={() => claim(mission)}>{t('missionClaim')}</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .missions-panel { display: grid; gap: 0.75rem; }
  .missions-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .missions-head h2 { margin: 0; }
  .missions-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .missions-tabs button { position: relative; padding: 0.35rem 0.75rem; border-radius: 999px; border: 1px solid var(--line, #444); background: transparent; color: inherit; cursor: pointer; }
  .missions-tabs button.active { background: var(--accent, #f5a623); color: var(--accent-ink, #111); border-color: transparent; }
  .missions-dot { position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%; background: #3ddc84; }
  .missions-hint { margin: 0; font-size: 0.85rem; opacity: 0.8; }
  .missions-error { margin: 0; color: #ff6b6b; }
  .missions-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
  .missions-list li { display: flex; gap: 0.75rem; align-items: center; justify-content: space-between; padding: 0.6rem 0.75rem; border-radius: 10px; border: 1px solid var(--line, #333); }
  .missions-list li.done:not(.claimed) { border-color: #3ddc84; }
  .missions-list li.claimed { opacity: 0.6; }
  .missions-text { display: grid; gap: 0.25rem; flex: 1; min-width: 0; }
  .missions-text small { opacity: 0.75; }
  .missions-bar { height: 6px; border-radius: 999px; background: rgba(127, 127, 127, 0.25); overflow: hidden; }
  .missions-bar span { display: block; height: 100%; background: var(--accent, #f5a623); transition: width 300ms ease-out; }
  .missions-action { display: grid; gap: 0.25rem; justify-items: end; }
  .missions-count { font-variant-numeric: tabular-nums; font-size: 0.85rem; }
  .missions-claimed { font-size: 0.8rem; opacity: 0.8; }
  @media (max-width: 520px) { .missions-list li { flex-direction: column; align-items: stretch; } .missions-action { justify-items: stretch; grid-auto-flow: column; align-items: center; } }
</style>
