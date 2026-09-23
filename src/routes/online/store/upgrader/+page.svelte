<script lang="ts">
  import '../../../../app.css';
  import StoreNav from '$lib/components/online/StoreNav.svelte';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import Upgrader from '$lib/components/online/Upgrader.svelte';
  import CoachCardSheet from '$lib/components/online/CoachCardSheet.svelte';
  import CollectionCardSheet from '$lib/components/online/CollectionCardSheet.svelte';
  import { collectionTeamById as teamById } from '$lib/game/online/collection-pool';
  import { AccountError, accountUser, loadAccount } from '$lib/game/online/account';
  import { fetchCollection, lineupLockedIds, type CollectionState } from '$lib/game/online/collection';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { UPGRADER_RARITY_CAP, upgradeChance, type Rarity } from '$lib/game/online/collection-rules';
  import { language, theme } from '$lib/game/pageState';
  import type { Coach, Player } from '$lib/game/types';

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  const serverUrl = getOnlineServerUrl();

  let state: CollectionState | null = null;
  let loading = true;
  let error = '';
  let detailsPlayer: Player | null = null;
  let detailsCoach: Coach | null = null;
  let coachReturnFocus: HTMLElement | null = null;

  /** FAQ examples, computed with the same rule the server uses. */
  const EXAMPLES = ([[12000, 'superstar', 24000, 'legend'], [6000, 'elite', 24000, 'legend'], [12000, 'superstar', 14400, 'superstar'], [48000, 'legend', 100000, 'goat']] as const)
    .map(([stake, from, target, to]) => ({ stake, target, chance: upgradeChance(stake, target, to, [from as Rarity]), cap: UPGRADER_RARITY_CAP[to] }));
  const VERIFY_SNIPPET = [
    "const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);",
    "const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${clientSeed}:${nonce}`)));",
    "const roll = parseInt([...mac].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 13), 16) / 16 ** 13; // vence se roll < chance"
  ].join('\n');
  const pct = (value: number) => `${(value * 100).toLocaleString($language, { maximumFractionDigits: 2 })}%`;

  const teamNameOf = (player: Player) => teamById.get(player.teamId ?? '')?.name ?? '';
  const coachTeamName = (coach: Coach) => teamById.get(coach.teamId)?.name ?? '';
  const openCoachDetails = (coach: Coach, trigger: HTMLButtonElement) => { detailsCoach = coach; coachReturnFocus = trigger; };
  $: ownedIds = state ? state.players.map((item) => item.playerId) : [];
  $: lockedIds = lineupLockedIds(state);

  async function refresh() {
    try {
      state = await fetchCollection(serverUrl);
      error = '';
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    }
  }

  onMount(async () => {
    try {
      await loadAccount(serverUrl);
      if ($accountUser) await refresh();
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{t('upgrader')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="upgrader-page">
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · STORE</span>
      <h1>{t('upgrader')}</h1>
      <p>{t('upgraderIntro')}</p>
      <a class="faq-link" href="#faq-title">{t('faqLink')}</a>
    </header>

    <StoreNav language={$language} />

    {#if !isOnlineEnabled()}
      <section class="panel box"><p>{t('accountsDisabled')}</p></section>
    {:else if loading}
      <section class="panel box" aria-busy="true"><p role="status">{uiCopy($language, 'loading')}</p></section>
    {:else if !$accountUser}
      <section class="panel box"><p>{t('loginFirst')}</p><a class="primary link" href="/online/conta?next=/online/store/upgrader">{t('goAccount')}</a></section>
    {:else if state}

      <p class="loss-warning" role="note">{t('upgraderLossWarning')}</p>

      <Upgrader {serverUrl} language={$language} {ownedIds} {lockedIds} onDone={() => void refresh()}
        playerTeam={teamNameOf} coachTeam={coachTeamName} onOpen={(selected) => detailsPlayer = selected} onOpenCoach={openCoachDetails} />
    {/if}
    {#if error}<p class="online-error" role="alert"><span>{error}</span>{#if !state}<button class="secondary" type="button" on:click={() => refresh()}>{uiCopy($language, 'retry')}</button>{/if}</p>{/if}

    <section class="faq panel" aria-labelledby="faq-title">
      <h2 id="faq-title">{t('faqTitle')}</h2>
      <details>
        <summary>{t('faqFairQ')}</summary>
        <p>{t('faqFairA')}</p>
      </details>
      <details>
        <summary>{t('faqLossQ')}</summary>
        <p>{t('faqLossA')}</p>
      </details>
      <details>
        <summary>{t('faqChanceQ')}</summary>
        <p>{t('faqChanceA')}</p>
      </details>
      <details>
        <summary>{t('faqEdgeQ')}</summary>
        <p>{t('faqEdgeA')}</p>
        <ul>
          <li class="fair-ok">{t('faqEdgeFair')}</li>
          <li class="bad">{t('faqEdgeBad')}</li>
          <li class="generous">{t('faqEdgeGenerous')}</li>
        </ul>
        <table>
          <thead><tr><th>{t('faqTableStake')}</th><th>{t('faqTableTarget')}</th><th>{t('faqTableChance')}</th></tr></thead>
          <tbody>
            {#each EXAMPLES as example}
              <tr><td>{example.stake.toLocaleString($language)}</td><td>{example.target.toLocaleString($language)}</td><td>{pct(example.chance)}{#if example.chance >= example.cap} ({t('faqTableCap')}){/if}</td></tr>
            {/each}
          </tbody>
        </table>
      </details>
      <details>
        <summary>{t('faqVerifyQ')}</summary>
        <p>{t('faqVerifyA')}</p>
        <pre><code>{VERIFY_SNIPPET}</code></pre>
      </details>
    </section>
  </section>
</PageLayout>

{#if detailsPlayer}
  <CollectionCardSheet player={detailsPlayer} teamName={teamNameOf(detailsPlayer)} language={$language} labels={{ close: t('close'), attributes: t('sheetAttributes'), roles: t('sheetRoles'), awards: t('sheetAwards'), value: t('sheetValue'), sell: t('sell'), coins: t('coins') }} onClose={() => detailsPlayer = null} />
{/if}
{#if detailsCoach}
  <CoachCardSheet coach={detailsCoach} teamName={coachTeamName(detailsCoach)} closeLabel={t('close')} returnFocus={coachReturnFocus} onClose={() => detailsCoach = null} />
{/if}

<style>
  .upgrader-page { display: grid; gap: 18px; padding: 28px 0 70px; }
  .box { display: grid; gap: 12px; padding: 22px; }
  .link { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 16px; border-radius: 0; text-decoration: none; }
  .faq { display: grid; gap: 0; padding: 18px 20px; }
  .faq-link { display: inline-flex; align-items: center; justify-content: center; justify-self: center; min-height: 40px; margin-top: 10px; padding: 0 14px; border: 1px solid var(--line); border-radius: 0; background: var(--surface-2); color: var(--text); font-size: .64rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; }
  .faq-link:hover, .faq-link:focus-visible { border-color: var(--accent); color: var(--accent); }
  .loss-warning { margin: 0; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--danger) 60%, var(--line)); border-left: 3px solid var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--surface)); color: #ff9b90; font-size: .8rem; font-weight: 700; }
  .faq h2 { scroll-margin-top: 90px; margin: 0 0 10px; font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  .faq details { border-top: 1px solid var(--line); }
  .faq summary { padding: 12px 0; font-size: .86rem; font-weight: 800; cursor: pointer; }
  .faq summary:hover { color: var(--accent); }
  .faq p, .faq li { margin: 0 0 10px; color: var(--muted); font-size: .8rem; line-height: 1.55; }
  .faq ul { margin: 0 0 12px; padding-left: 18px; }
  .faq li.fair-ok { color: var(--accent); } .faq li.bad { color: #ff9b90; } .faq li.generous { color: #ffd36b; }
  .faq table { margin: 0 0 14px; border-collapse: collapse; font-size: .78rem; font-variant-numeric: tabular-nums; }
  .faq th, .faq td { padding: 6px 14px 6px 0; border-bottom: 1px solid var(--line); text-align: left; }
  .faq th { color: var(--muted); font-size: .6rem; letter-spacing: .1em; text-transform: uppercase; }
  .faq pre { margin: 0 0 14px; padding: 12px; overflow-x: auto; border: 1px solid var(--line); background: var(--surface-2); font-size: .7rem; line-height: 1.5; }
  .online-error { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
  .online-error button { min-height: 44px; border-radius: 0; }
</style>
