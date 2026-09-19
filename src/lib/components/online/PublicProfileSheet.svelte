<script lang="ts">
  import { onMount } from 'svelte';
  import { authFetch } from '$lib/game/online/account';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';

  /** Another player's public card: team, majors played and won, season points and awards. */
  export let serverUrl: string;
  export let userId: string;
  export let language: Language = 'en';
  export let onClose: () => void = () => {};

  type Profile = { teamName: string | null; displayName: string; memberSince: string; majorsPlayed: number; majorsWon: number; seasonPoints: number; awards: Array<{ kind: string; count: number }> };
  let profile: Profile | null = null;
  let failed = false;
  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  const awardName = (kind: string) => { const label = translateOnline(language, `award_${kind}` as OnlineTranslationKey); return label || kind.replace(/_/g, ' '); };
  onMount(async () => { try { profile = (await authFetch<{ profile: Profile }>(serverUrl, `/players/${userId}`)).profile; } catch { failed = true; } });
</script>

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') onClose(); }} />

<div class="pp-backdrop" role="presentation" on:click={onClose}>
  <div class="pp-sheet" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
    <button class="pp-close" type="button" aria-label={t('close')} on:click={onClose}>×</button>
    {#if profile}
      <span class="eyebrow">{profile.displayName} · {new Date(profile.memberSince).toLocaleDateString(language)}</span>
      <h2>{profile.teamName ?? profile.displayName}</h2>
      <div class="pp-numbers">
        <article><small>{t('profileMajors')}</small><strong>{profile.majorsPlayed}</strong></article>
        <article><small>{t('profileTitles')}</small><strong>{profile.majorsWon}</strong></article>
        <article><small>{t('seasonPointsMine')}</small><strong>{profile.seasonPoints}</strong></article>
      </div>
      <h3>AWARDS</h3>
      {#if profile.awards.length}
        <ul>{#each profile.awards as award (award.kind)}<li class:gold={award.kind === 'major_title' || award.kind.startsWith('season_top')}><span>{awardName(award.kind)}</span><b>×{award.count}</b></li>{/each}</ul>
      {:else}<p>{t('noAwards')}</p>{/if}
    {:else}<p>{failed ? t('connectionFailed') : '…'}</p>{/if}
  </div>
</div>

<style>
  .pp-backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; background: rgb(3 5 6 / .82); overflow-y: auto; }
  .pp-sheet { position: relative; display: grid; gap: 12px; width: min(100%, 460px); padding: 24px; border: 1px solid var(--accent); background: var(--surface); }
  .pp-close { position: absolute; top: 10px; right: 10px; width: 38px; height: 38px; min-height: 0; padding: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font-size: 1.3rem; cursor: pointer; }
  h2 { margin: 0; padding-right: 40px; font-size: 2rem; overflow-wrap: anywhere; } h3 { margin: 4px 0 0; color: var(--muted); font-size: .62rem; letter-spacing: .12em; }
  .pp-numbers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .pp-numbers article { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); background: var(--surface-2); } .pp-numbers small { color: var(--muted); font-size: .56rem; font-weight: 800; text-transform: uppercase; } .pp-numbers strong { color: var(--accent); font: 900 1.8rem/1 'Arial Narrow', Impact, sans-serif; }
  ul { display: grid; gap: 4px; max-height: 260px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
  li { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; background: var(--surface-2); font-size: .78rem; } li.gold { border-left: 3px solid #d9a441; }
  p { margin: 0; color: var(--muted); }
</style>
