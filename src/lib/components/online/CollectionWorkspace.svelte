<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import StoreNav from './StoreNav.svelte';
  import SelectionSheet from './SelectionSheet.svelte';
  export let section: 'team' | 'store' = 'team';
  $: u = (key: Parameters<typeof uiCopy>[1]) => uiCopy($language, key);
  import { onMount, tick } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import BuyCoins from '$lib/components/online/BuyCoins.svelte';
  import PromosPanel from '$lib/components/online/PromosPanel.svelte';
  import PackCase from '$lib/components/online/PackCase.svelte';
  import PackOdds from '$lib/components/online/PackOdds.svelte';
  import PackReveal from '$lib/components/online/PackReveal.svelte';
  import CollectionCard from '$lib/components/online/CollectionCard.svelte';
  import CollectionCardSheet from '$lib/components/online/CollectionCardSheet.svelte';
  import { COLLECTION_YEARS, collectionCoachById, collectionPlayerById as playerById, collectionPlayers as players, collectionTeamById as teamById, collectionTeams } from '$lib/game/online/collection-pool';
  import CoachCard from '$lib/components/online/CoachCard.svelte';
  import MiniCard from '$lib/components/online/MiniCard.svelte';
  import { applyCoachToTeam, coachAffinity } from '$lib/game/dynasty/coach';
  import { AccountError, accountUser, authFetch, loadAccount } from '$lib/game/online/account';
  import { buyPack, fetchCollection, openDailyPack, openFreePack, saveLineup, sellCard, type CollectionState, type PackOpened } from '$lib/game/online/collection';
  import { applyCollectionLineup, cardEffects, collectionRoleLabel, eligibleRolesOf, isStarEffective, starRoleAllowed, styleReady, synergyOf, themeOf, primaryRoleOf, toSelectedPlayer, type CollectionSlotRole } from '$lib/game/online/collection-lineup';
  import { PACK_PRICES, RARITIES, coachSellValue, rarityOf, sellValue, type PackTier } from '$lib/game/online/collection-rules';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import { getRoleLabel } from '$lib/game/roleRules';
  import { countryName } from '$lib/game/visuals/flags';
  import { powerRating, powerRatingDelta } from '$lib/game/powerRating';
  import { calculateUserTeamPower } from '$lib/game/simulation';
  import type { Coach, LineupSlotRole, MapId, OrgStyle, Player } from '$lib/game/types';
  import { ACTIVE_DUTY_MAPS, MAP_NAMES, getActiveDutyMapsForYear, getDefaultMapSelection, getLineupMapContributors, isValidLineupMapSelection } from '$lib/game/maps';

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  $: gameT = (key: Parameters<typeof translate>[1]) => translate($language, key);
  const serverUrl = getOnlineServerUrl();
  const ROLES: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const YEARS = COLLECTION_YEARS;

  let state: CollectionState | null = null;
  let loading = true;
  let error = '';
  let toast = '';
  let busy = false;
  let loadedLineup = false;
  let allowLeave = false;
  let choosingSlot: number | null = null;
  let pickerQuery = '';
  let pickerCandidate: Player | null = null;
  $: pickerPlayers = owned.filter(player => !lineupIds.has(player.id) && (!pickerQuery.trim() || (player.nickname ?? player.id).toLowerCase().includes(pickerQuery.trim().toLowerCase())));
  function openSlot(index: number) { choosingSlot = index; pickerQuery = ''; pickerCandidate = null; }
  function applyPick() {
    if (choosingSlot === null || !pickerCandidate) return;
    swapIn = pickerCandidate; swapInto(choosingSlot);
    choosingSlot = null; pickerCandidate = null;
  }
  beforeNavigate((navigation) => {
    if (!dirty || allowLeave) return;
    navigation.cancel();
    if (navigation.type === 'leave') return;
    if (navigation.to?.url) void confirmDialog({ title: u('leaveTitle'), body: u('leaveBody'), confirmLabel: u('discard'), cancelLabel: t('cancel'), tone: 'danger' }).then(async confirmed => {
      if (confirmed) { allowLeave = true; await goto(navigation.to!.url); allowLeave = false; }
    });
  });
  async function saveAndPlay() {
    if (dirty || !savedLineup) { if (!await persistLineup()) return; }
    allowLeave = true; await goto('/online');
  }
  let detailsPlayer: Player | null = null;

  // Pack reveal: three roulette spins, then the cards.
  type RevealCard = { kind: 'player'; player: Player } | { kind: 'coach'; coach: Coach };
  let reveal: { cards: RevealCard[]; duplicates: Set<string>; coins: number; tier: PackTier; key: number; done: boolean } | null = null;
  let coachId: string | null = null;

  // Lineup builder.
  let slots: Array<Player | null> = [null, null, null, null, null];
  let roles: Array<CollectionSlotRole | null> = [null, null, null, null, null];
  let starPlayerId: string | null = null;
  let style: OrgStyle = 'balanced';
  let eraYear = YEARS.at(-1) ?? 2026;

  // Filters.
  let query = '';
  let filterYear = '';
  let filterRole = '';
  let filterRarity = '';

  $: filtersOn = Boolean(query.trim() || filterYear || filterRole || filterRarity);
  const clearFilters = () => { query = ''; filterYear = ''; filterRole = ''; filterRarity = ''; };
  const showToast = (message: string) => { toast = message; setTimeout(() => { if (toast === message) toast = ''; }, 2400); };
  const fail = (caught: unknown) => {
    if (caught instanceof AccountError) {
      error = caught.code === 'NO_PACKS_LEFT' ? t('noPacksLeft') : caught.code === 'INSUFFICIENT_COINS' ? `${t('wallet')}: ${caught.message}` : caught.code === 'IN_LINEUP' ? t('inLineup') : caught.message;
      return;
    }
    error = t('connectionFailed');
  };

  $: owned = state ? state.players.map((item) => playerById.get(item.playerId)).filter((player): player is Player => Boolean(player)) : [];
  $: ownedCoaches = state ? state.players.map((item) => collectionCoachById.get(item.playerId)).filter((coach): coach is Coach => Boolean(coach)).sort((a, b) => b.overall - a.overall) : [];
  $: activeCoach = coachId ? collectionCoachById.get(coachId) ?? null : null;
  $: coachBonus = activeCoach && complete ? coachAffinity(activeCoach, lineupPlayers, collectionTeams) : 0;
  $: ownedIds = new Set(owned.map((player) => player.id));
  $: lineupIds = new Set(slots.filter((slot): slot is Player => Boolean(slot)).map((player) => player.id));
  $: visible = owned
    .filter((player) => !filterYear || String(player.year) === filterYear)
    .filter((player) => !filterRole || primaryRoleOf(player) === filterRole)
    .filter((player) => !filterRarity || rarityOf(player) === filterRarity)
    .filter((player) => !query.trim() || (player.nickname ?? player.id).toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  $: complete = slots.every(Boolean) && roles.every(Boolean);
  $: lineupPlayers = slots.filter((slot): slot is Player => Boolean(slot));
  $: lineupRoles = roles.filter((role): role is CollectionSlotRole => Boolean(role));
  $: synergy = complete ? synergyOf({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : [];
  $: starOk = complete && isStarEffective(lineupPlayers, starPlayerId, lineupRoles);
  /** The star is set but plays support or pure IGL: it cannot carry the team from there. */
  $: starRoleBlocked = complete && Boolean(starPlayerId) && !starRoleAllowed(lineupRoles[lineupPlayers.findIndex((player) => player.id === starPlayerId)]);
  $: baseTeam = complete ? calculateUserTeamPower(lineupPlayers, style, lineupPlayers.map((player, index) => toSelectedPlayer(player.id, lineupRoles[index])), 'preview') : null;
  $: synergized = baseTeam ? applyCollectionLineup(baseTeam, { players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : null;
  $: readyStyle = styleReady({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style });
  $: themes = complete ? themeOf({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : [];
  /** The tight level names the theme ("Mesmo time"); the loose one says so ("Mesma organização"). */
  const themeTitle = (key: string, line: { exact: boolean } | undefined): string => {
    if (line && !line.exact && key === 'theme_team') return t('syn_theme_team_org');
    if (line && !line.exact && key === 'theme_country') return t('syn_theme_country_bloc');
    return t(`syn_${key}` as Parameters<typeof t>[0]);
  };
  /** The org slug back to the name people know it by ("ninjasinpyjamas" → "Ninjas in Pyjamas"). */
  const orgDisplayName = (slug: string): string =>
    collectionTeams.find((team) => (team.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === slug)?.name ?? slug;
  /** "…: SK 2017 · 5 cartas" — the name comes from the data, the label from the language. */
  const themeLabel = (key: string, line: { theme: string; count: number; exact: boolean } | undefined): string => {
    if (!line) return '';
    const name = key === 'theme_country'
      ? (line.exact ? countryName(line.theme, $language) : t(`bloc_${line.theme}` as Parameters<typeof t>[0]))
      : key === 'theme_team'
        ? (line.exact ? teamById.get(line.theme)?.name ?? line.theme : orgDisplayName(line.theme))
        : line.theme;
    return `: ${name} · ${line.count} ${t('themeCards')}`;
  };
  let teamSection: HTMLElement | null = null;
  let shopSection: HTMLElement | null = null;
  let shopTop: HTMLElement | null = null;
  let cardsSection: HTMLElement | null = null;
  const scrollTo = (element: HTMLElement | null) => setTimeout(() => element?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  /** Power on screen is the 0-99 rating, never the raw engine number (src/lib/game/powerRating.ts). */
  const fmt = (value: number) => Math.round(powerRating(value)).toLocaleString($language);
  /** A difference between two powers, in rating points: the anchored conversion would be meaningless on a delta. */
  const fmtDelta = (value: number) => Math.round(powerRatingDelta(value)).toLocaleString($language);
  $: preview = synergized && activeCoach ? applyCoachToTeam(synergized, activeCoach, coachBonus) : synergized;
  // The saved team, built the same way, so the player sees what changes before saving.
  $: savedLineup = state?.lineup ?? null;
  $: savedPlayers = savedLineup ? savedLineup.playerIds.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player)) : [];
  $: savedTeam = (() => {
    if (!savedLineup || savedPlayers.length !== 5) return null;
    const input = { players: savedPlayers, roles: savedLineup.roles, starPlayerId: savedLineup.starPlayerId, style: savedLineup.style, coachId: savedLineup.coachId };
    const built = applyCollectionLineup(calculateUserTeamPower(savedPlayers, savedLineup.style, savedPlayers.map((player, index) => toSelectedPlayer(player.id, savedLineup.roles[index])), 'preview'), input);
    const coach = savedLineup.coachId ? collectionCoachById.get(savedLineup.coachId) ?? null : null;
    return coach ? applyCoachToTeam(built, coach, coachAffinity(coach, savedPlayers, collectionTeams)) : built;
  })();
  const lineupKey = (ids: Array<string | null>, assigned: Array<string | null>, star: string | null, coach: string | null, orgStyle: string, maps: string[]) => JSON.stringify([ids, assigned, star, coach, orgStyle, maps]);
  $: dirty = loadedLineup && section === 'team' && lineupKey(slots.map(slot => slot?.id ?? null), roles, starPlayerId, coachId, style, mapPicks) !== lineupKey(savedLineup?.playerIds ?? [null,null,null,null,null], savedLineup?.roles ?? [null,null,null,null,null], savedLineup?.starPlayerId ?? null, savedLineup?.coachId ?? null, savedLineup?.style ?? 'balanced', savedLineup?.mapPreferences ?? []);
  $: comparison = savedTeam && preview && dirty ? [
    { label: t('power'), before: powerRating(savedTeam.power), after: powerRating(preview.power), digits: 0 },
    { label: t('mentalStat'), before: savedTeam.mental, after: preview.mental, digits: 1 },
    { label: t('clutchStat'), before: savedTeam.clutch, after: preview.clutch, digits: 1 },
    { label: t('consistencyStat'), before: savedTeam.consistency ?? 0, after: preview.consistency ?? 0, digits: 1 }
  ] : [];
  $: leavingPlayers = dirty ? savedPlayers.filter((player) => !lineupIds.has(player.id)) : [];
  $: joiningPlayers = dirty && savedLineup ? lineupPlayers.filter((player) => !savedLineup.playerIds.includes(player.id)) : [];
  $: effects = complete ? cardEffects({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : {};
  const PACK_LABEL: Record<PackTier, Parameters<typeof translateOnline>[1]> = { basic: 'packBasic', prata: 'packPrata', ouro: 'packOuro', era: 'packEra', diamante: 'packDiamante', icone: 'packIcone' };
  $: oddsLabels = { heading: t('oddsTitle'), first: t('slotFirst'), others: t('slotOthers'), all: t('oddsAll'), coach: t('oddsCoach'), note: t('oddsNote'), close: t('close') };
  const teamNameOf = (player: Player) => teamById.get(player.teamId ?? '')?.name ?? '';
  $: synergyTotal = synergy.reduce((sum, line) => sum + line.power, 0);
  $: packsLeft = state ? Math.max(0, state.packsToday.granted - state.packsToday.opened) : 0;

  function hydrateLineup(saved: CollectionState['lineup']) {
    if (!saved) return;
    slots = saved.playerIds.map((id) => playerById.get(id) ?? null);
    roles = [...saved.roles];
    starPlayerId = saved.starPlayerId;
    coachId = saved.coachId ?? null;
    style = saved.style;
    mapPicks = saved.mapPreferences ? [...saved.mapPreferences] : [];
  }

  async function refresh() {
    try {
      state = await fetchCollection(serverUrl);
      if (!slots.some(Boolean)) hydrateLineup(state.lineup);
    } catch (caught) { fail(caught); }
  }

  async function runReveal(open: () => Promise<PackOpened>, tier: PackTier, free = false) {
    if (busy) return;
    if (tier !== 'basic' && !free && !await confirmDialog({ title: u('confirmBuy'), body: t(PACK_LABEL[tier]) + ' · ' + PACK_PRICES[tier].toLocaleString($language) + ' coins', confirmLabel: t('buy'), cancelLabel: t('cancel') })) return;
    error = ''; busy = true;
    try {
      const result = await open();
      const cards: RevealCard[] = result.players.flatMap((id): RevealCard[] => { const coach = collectionCoachById.get(id); if (coach) return [{ kind: 'coach', coach }]; const player = playerById.get(id); return player ? [{ kind: 'player', player }] : []; });
      reveal = { cards, duplicates: new Set(result.duplicates), coins: result.coinsFromDupes, tier, key: Date.now(), done: false };
      await tick(); scrollTo(shopSection);
      await refresh();
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  const teaserPool = players.filter((_, index) => index % 7 === 0).map((player) => ({ id: player.id, avatar: (player.nickname ?? '?').slice(0, 2).toUpperCase(), title: player.nickname ?? player.id, subtitle: `${player.year ?? ''} · ${rarityOf(player)}` }));
  const coachTeamName = (coach: Coach) => teamById.get(coach.teamId)?.name ?? '';

  const PAYMENT_TEXT = {
    'pt-BR': { checking: 'Confirmando pagamento…', credited: 'Pagamento aprovado', waiting: 'Pagamento em análise · as coins caem sozinhas quando aprovar', failed: 'Pagamento não concluído' },
    en: { checking: 'Confirming payment…', credited: 'Payment approved', waiting: 'Payment under review · coins land by themselves once approved', failed: 'Payment not completed' },
    es: { checking: 'Confirmando pago…', credited: 'Pago aprobado', waiting: 'Pago en revisión · las coins llegan solas al aprobarse', failed: 'Pago no completado' }
  } as const;
  const paymentLanguage = () => ($language in PAYMENT_TEXT ? $language : 'pt-BR') as keyof typeof PAYMENT_TEXT;
  let confirmingPayment = false;

  /** Back from the checkout: asks the server to re-check this account's open purchases, a few times while the payment settles. */
  async function confirmPayment() {
    if (confirmingPayment) return;
    confirmingPayment = true;
    const text = PAYMENT_TEXT[paymentLanguage()];
    const before = state?.wallet ?? 0;
    showToast(text.checking);
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const result = await authFetch<{ credited: number; coins: number; pending: number }>(serverUrl, '/shop/reconcile', { method: 'POST', body: {} }).catch(() => null);
        await refresh();
        const gained = (state?.wallet ?? 0) - before;
        if ((result && result.credited > 0) || gained > 0) { showToast(`✓ ${text.credited} · +${Math.max(gained, result?.coins ?? 0).toLocaleString($language)} ${t('coins')}`); return; }
        if (result && result.pending === 0 && attempt > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 6000));
      }
      showToast(text.waiting);
    } finally { confirmingPayment = false; }
  }

  async function sell(player: Player) {
    const confirmed = await confirmDialog({ title: `${t('sell')} ${player.nickname ?? player.id}?`, body: `+${sellValue(player).toLocaleString($language)} ${t('coins')} · ${player.year ?? ''} · ${rarityOf(player)}`, confirmLabel: t('sell'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!confirmed) return;
    error = ''; busy = true;
    try { await sellCard(serverUrl, player.id); showToast(`+${sellValue(player)} ${t('coins')}`); await refresh(); } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function sellCoach(coach: Coach) {
    const confirmed = await confirmDialog({ title: `${t('sell')} ${coach.name}?`, body: `+${coachSellValue(coach).toLocaleString($language)} ${t('coins')} · COACH ${coach.year}`, confirmLabel: t('sell'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!confirmed) return;
    error = ''; busy = true;
    try { await sellCard(serverUrl, coach.id); showToast(`+${coachSellValue(coach)} ${t('coins')}`); await refresh(); } catch (caught) { fail(caught); } finally { busy = false; }
  }

  function addToLineup(player: Player) {
    if (lineupIds.has(player.id)) return;
    const index = slots.findIndex((slot) => !slot);
    if (index < 0) return;
    slots[index] = player;
    const eligible = eligibleRolesOf(player);
    roles[index] = eligible.includes(primaryRoleOf(player)) ? primaryRoleOf(player) : eligible[0] ?? 'rifler';
    slots = [...slots]; roles = [...roles];
    showToast(t('addToLineup'));
  }

  // Team maps: three picks among the maps the five cards played in their years. Bans stay automatic (the team bans what
  // it knows least); in a manual room the player vetoes live, as before.
  let mapPicks: MapId[] = [];
  $: mapContributors = getLineupMapContributors(lineupPlayers, collectionTeams);
  $: defaultMaps = complete ? [...getDefaultMapSelection(lineupPlayers, collectionTeams)] : [];
  $: coachMaps = new Set<MapId>(activeCoach ? getActiveDutyMapsForYear(activeCoach.year) : []);
  $: mapsValid = mapPicks.length === 3 && isValidLineupMapSelection(mapPicks, lineupPlayers, collectionTeams);
  // Picks that stop making sense for a new five fall back to the default instead of blocking the save.
  $: if (complete && mapPicks.length && !mapPicks.every((mapId) => mapContributors[mapId]?.length)) mapPicks = [];
  $: effectiveMaps = mapsValid ? mapPicks : defaultMaps;
  function toggleMap(mapId: MapId) {
    const current = mapPicks.length ? mapPicks : [];
    mapPicks = current.includes(mapId) ? current.filter((item) => item !== mapId) : current.length >= 3 ? current : [...current, mapId];
  }

  /** Fast swap: a card waiting for the slot it takes. */
  let swapIn: Player | null = null;
  const roleFor = (player: Player): CollectionSlotRole => { const eligible = eligibleRolesOf(player); return eligible.includes(primaryRoleOf(player)) ? primaryRoleOf(player) : eligible[0] ?? 'rifler'; };

  function startSwap(player: Player) {
    swapIn = player;
  }

  /** Puts the waiting card in this slot; it keeps the slot's role when it can play it, so the team shape survives the swap. */
  function swapInto(index: number) {
    if (!swapIn) return;
    const leaving = slots[index];
    if (leaving?.id === starPlayerId) starPlayerId = null;
    const keptRole = roles[index];
    slots[index] = swapIn;
    roles[index] = keptRole && eligibleRolesOf(swapIn).includes(keptRole) ? keptRole : roleFor(swapIn);
    slots = [...slots]; roles = [...roles];
    showToast(`${swapIn.nickname ?? swapIn.id} ⇄ ${leaving?.nickname ?? '—'}`);
    swapIn = null;
  }

  function removeFromLineup(index: number) {
    if (slots[index]?.id === starPlayerId) starPlayerId = null;
    slots[index] = null; roles[index] = null;
    slots = [...slots]; roles = [...roles];
  }

  async function persistLineup() {
    if (!complete || busy) { error = t('lineupIncomplete'); return false; }
    error = ''; busy = true;
    try {
      await saveLineup(serverUrl, { playerIds: lineupPlayers.map((player) => player.id), roles: lineupRoles, starPlayerId, coachId, style, mapPreferences: mapsValid ? mapPicks : null });
      showToast(t('lineupSaved'));
      await refresh();
      hydrateLineup(state?.lineup ?? null);
      return true;
    } catch (caught) { fail(caught); return false; } finally { busy = false; }
  }

  onMount(async () => {
    try {
      await loadAccount(serverUrl);
      if ($accountUser) { await refresh(); loadedLineup = true; }
      const payment = new URLSearchParams(window.location.search).get('pagamento');
      if (payment && section === 'team') { allowLeave = true; await goto('/online/store?pagamento=' + encodeURIComponent(payment), { replaceState: true }); return; }
      if (payment) {
        // The query string is only a hint of where the buyer came from: the server re-checks the payment itself.
        history.replaceState(null, '', window.location.pathname);
        if ($accountUser && payment !== 'falhou') void confirmPayment(); else showToast(PAYMENT_TEXT[paymentLanguage()].failed);
      }
    } catch (caught) { fail(caught); } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{section === 'store' ? 'Store' : t('myTeam')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="collection">
    {#if error}<p class="online-error inline-error" role="alert"><span>{error}</span>{#if !state && !loading}<button class="secondary small" type="button" on:click={() => refresh()}>{u('retry')}</button>{:else}<button class="ghost small" type="button" on:click={() => error = ''}>×</button>{/if}</p>{/if}
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · {t('collection').toUpperCase()}</span>
      <h1>{section === 'store' ? 'Store' : t('myTeam')}</h1>
      <p>{section === 'store' ? u('storeHint') : u('teamHint')}</p>
    </header>

    {#if !isOnlineEnabled()}
      <section class="panel box"><p>{t('accountsDisabled')}</p></section>
    {:else if loading}
      <section class="panel box" aria-busy="true"><p role="status">{u('loading')}</p></section>
    {:else if !$accountUser}
      <section class="panel box"><p>{t('loginFirst')}</p><a class="primary link" href={section === 'store' ? '/online/conta?next=/online/store' : '/online/conta?next=/online/colecao'}>{t('goAccount')}</a></section>
    {:else if state}

      {#if section === 'store'}<StoreNav language={$language} />
      <BuyCoins {serverUrl} language={$language} />{:else}
      <div class="team-links"><button class="primary" type="button" disabled={!complete || busy} on:click={saveAndPlay}>{dirty ? u('savePlay') : t('playOnline')}</button><button class="secondary" type="button" on:click={() => scrollTo(cardsSection)}>{t('myCards')}</button></div>{/if}
      <div class="columns">
        {#if section === 'store'}
        <section class="panel shop" bind:this={shopTop}>
          <div class="section-heading"><div><span class="eyebrow">{t('shop').toUpperCase()}</span><h2>{t('shop')}</h2></div></div>
          <PromosPanel {serverUrl} language={$language} wallet={state.wallet} {busy} onBought={() => refresh()} />
          <div class="shop-grid">
            <article class="pack basic">
              <PackOdds tier="basic" title={t('packBasic')} labels={oddsLabels} />
              <PackCase tier="basic" label={t('packBasic')} />
              <strong>{t('packBasic')}</strong>
              <small>{packsLeft}/{state.packsToday.granted} · {t('packsToday').toLowerCase()}</small>
              <button class="primary" type="button" disabled={busy || packsLeft <= 0} on:click={() => runReveal(() => openDailyPack(serverUrl), 'basic')}>{packsLeft > 0 ? t('openPack') : t('noPacksLeft')}</button>
            </article>
            {#each ['prata', 'ouro'] as name}
              {@const tier = name as 'prata' | 'ouro'}
              <article class="pack {tier}">
                <PackOdds {tier} title={t(PACK_LABEL[tier])} labels={oddsLabels} />
                <PackCase {tier} label={t(PACK_LABEL[tier])} />
                <strong>{t(PACK_LABEL[tier])}</strong>
                {#if state.freePacks?.[tier]}
                  <span class="price">{t('free')}</span>
                  <button class="secondary" type="button" disabled={busy} on:click={() => runReveal(() => openFreePack(serverUrl, tier), tier, true)}>{t('openPack')}</button>
                {:else}
                  <span class="price"><i></i>{PACK_PRICES[tier].toLocaleString($language)}</span>
                  <button class="secondary" type="button" disabled={busy || state.wallet < PACK_PRICES[tier]} on:click={() => runReveal(() => buyPack(serverUrl, tier), tier)}>{t('buy')}</button>
                {/if}
              </article>
            {/each}
            <article class="pack era">
              <PackOdds tier="era" title={t('packEra')} labels={oddsLabels} />
              <PackCase tier="era" label={String(eraYear)} />
              <strong>{t('packEra')}</strong>
              <span class="price"><i></i>{PACK_PRICES.era.toLocaleString($language)}</span>
              <label class="era-year"><span>{t('packEraHint')}</span><select bind:value={eraYear}>{#each YEARS as year}<option value={year}>{year}</option>{/each}</select></label>
              <button class="secondary" type="button" disabled={busy || state.wallet < PACK_PRICES.era} on:click={() => runReveal(() => buyPack(serverUrl, 'era', eraYear), 'era')}>{t('buy')}</button>
            </article>
          </div>
          <h3 class="subhead premium-head">{t('premium').toUpperCase()}</h3>
          <div class="premium-grid">
            {#each ['diamante', 'icone'] as name}
              {@const tier = name as 'diamante' | 'icone'}
              <article class="pack premium {tier}">
                <PackOdds {tier} title={t(PACK_LABEL[tier])} labels={oddsLabels} />
                <PackCase {tier} size="lg" label={t(PACK_LABEL[tier])} />
                <div class="premium-info">
                  <strong>{t(PACK_LABEL[tier])}</strong>
                  <small>{t(tier === 'icone' ? 'packIconeHint' : 'packDiamanteHint')}</small>
                  <span class="price"><i></i>{PACK_PRICES[tier].toLocaleString($language)}</span>
                  <button class="primary" type="button" disabled={busy || state.wallet < PACK_PRICES[tier]} on:click={() => runReveal(() => buyPack(serverUrl, tier), tier)}>{t('buy')}</button>
                </div>
              </article>
            {/each}
          </div>


          {#if reveal}
            <div bind:this={shopSection}>
              {#key reveal.key}
                <PackReveal cards={reveal.cards} duplicates={reveal.duplicates} tier={reveal.tier} caseLabel={reveal.tier === 'era' ? String(eraYear) : t(PACK_LABEL[reveal.tier])} language={$language}
                  labels={{ fresh: t('newCard'), duplicate: t('duplicateCard'), skip: t('skipReveal'), rolling: t('revealing') }} teasers={teaserPool} playerTeam={teamNameOf} coachTeam={coachTeamName}
                  onOpen={(selected) => detailsPlayer = selected} onDone={() => { if (reveal) reveal = { ...reveal, done: true }; }} />
              {/key}
              {#if reveal.done && reveal.coins > 0}<p class="note dupes">{reveal.duplicates.size} {t('dupesToCoins')} +{reveal.coins.toLocaleString($language)} {t('coins')}</p>{/if}
            </div>
          {/if}
        </section>

        {:else}
        <section class="panel team" bind:this={teamSection}>
          <div class="section-heading"><div><span class="eyebrow">{t('myTeam').toUpperCase()}</span><h2>{t('myTeam')}</h2></div>{#if preview}<strong class="power">{t('power')} {fmt(preview.power)}</strong>{/if}</div>
          {#if swapIn}<p class="swap-banner" role="status"><span>⇄ {t('swapChoose')} <b>{swapIn.nickname ?? swapIn.id}</b></span><button class="ghost small" type="button" on:click={() => swapIn = null}>{t('cancel')}</button></p>{/if}
          <div class="slots">
            {#each slots as slot, index}
              <div class="slot" class:filled={Boolean(slot)}>
                {#if slot}
                  <div class="slot-desk">
                    <CollectionCard player={slot} teamName={teamNameOf(slot)} language={$language} compact inLineup star={slot.id === starPlayerId && starOk} effect={effects[slot.id] ?? null}>
                      <button class="ghost small" type="button" class:active={slot.id === starPlayerId} on:click={() => starPlayerId = starPlayerId === slot.id ? null : slot.id}>★ {t('star')}</button>
                      <button class="ghost small" type="button" on:click={() => removeFromLineup(index)}>{t('removeFromLineup')}</button>
                    </CollectionCard>
                  </div>
                  <!-- Phone: one compact row per slot (mini card left, actions right). -->
                  <div class="slot-row">
                    <MiniCard id={slot.id} layout="row" star={slot.id === starPlayerId && starOk} onClick={() => detailsPlayer = slot} />
                    <div class="row-actions">
                      <select aria-label={t('role')} value={roles[index]} on:change={(event) => { roles[index] = (event.currentTarget as HTMLSelectElement).value as CollectionSlotRole; roles = [...roles]; }}>{#each eligibleRolesOf(slot) as role}<option value={role}>{collectionRoleLabel(role)}</option>{/each}</select>
                      <div class="row-buttons">
                        <button class="icon" type="button" class:active={slot.id === starPlayerId} aria-pressed={slot.id === starPlayerId} aria-label={`${t('star')}: ${slot.nickname ?? slot.id}`} title={t('star')} on:click={() => starPlayerId = starPlayerId === slot.id ? null : slot.id}>★</button>
                        <button class="icon" type="button" aria-label={`${u('replace')}: ${slot.nickname ?? slot.id}`} title={u('replace')} on:click={() => openSlot(index)}>⇄</button>
                        <button class="icon" type="button" aria-label={`${t('removeFromLineup')}: ${slot.nickname ?? slot.id}`} title={t('removeFromLineup')} on:click={() => removeFromLineup(index)}>✕</button>
                      </div>
                    </div>
                  </div>
                  {#if swapIn}<button class="primary small swap-here" type="button" on:click={() => swapInto(index)}>{t('swapHere')} {slot.nickname ?? slot.id}</button>{/if}
                  <div class="slot-desk">
                    <button class="secondary small" type="button" on:click={() => openSlot(index)}>{u('replace')}</button>
                    <label class="slot-role"><span>{t('role')}</span><select value={roles[index]} on:change={(event) => { roles[index] = (event.currentTarget as HTMLSelectElement).value as CollectionSlotRole; roles = [...roles]; }}>{#each eligibleRolesOf(slot) as role}<option value={role}>{collectionRoleLabel(role)}</option>{/each}</select></label>
                  </div>
                  <p class="slot-notes">
                    {#if slot.id === starPlayerId}<span class={starOk ? 'gold' : 'bad'}>★ {starOk ? t('noteStarOn') : starRoleBlocked ? t('starRoleBlocked') : t('noteStarOff')}</span>{/if}
                  </p>
                {:else}
                  {#if swapIn}<button class="primary small swap-here" type="button" on:click={() => swapInto(index)}>{t('swapHere')}</button>{/if}
                  <button type="button" class="empty" on:click={() => openSlot(index)}>+ {u('chooseCard')}</button>
                {/if}
              </div>
            {/each}
          </div>
          <p class="note">{t('starHint')}</p>
          {#if starPlayerId && complete && !starOk}<p class="warn">{starRoleBlocked ? t('starRoleBlocked') : t('starInactive')}</p>{/if}

          <div class="details">
            <div class="detail-box coach-slot">
              <span class="label">COACH · {t('coachBonus')}</span>
              {#if activeCoach}
                <div class="slot-desk">
                  <CoachCard coach={activeCoach} teamName={coachTeamName(activeCoach)} active affinity={coachBonus > 0}>
                    <button class="ghost small" type="button" on:click={() => coachId = null}>{t('removeFromLineup')}</button>
                  </CoachCard>
                </div>
                <div class="slot-row coach-row">
                  <MiniCard id={activeCoach.id} layout="row" />
                  <button class="icon" type="button" aria-label={`${t('removeFromLineup')}: ${activeCoach.name}`} title={t('removeFromLineup')} on:click={() => coachId = null}>✕</button>
                </div>
                {#if preview && synergized}
                  <ul class="stat-list">
                    <li><span>{t('power')}</span><b class:up={preview.power > synergized.power}>{preview.power >= synergized.power ? '+' : ''}{fmtDelta(preview.power - synergized.power)}</b></li>
                    {#if coachBonus > 0}<li><span>{t('coachAffinity')}</span><b class="up">+{(coachBonus * 100).toFixed(2)}%</b></li>{/if}
                    <li><span>{t('mentalStat')}</span><b>{preview.mental - synergized.mental >= 0 ? '+' : ''}{(preview.mental - synergized.mental).toFixed(1)}</b></li>
                    <li><span>{t('consistencyStat')}</span><b>{(preview.consistency ?? 0) - (synergized.consistency ?? 0) >= 0 ? '+' : ''}{((preview.consistency ?? 0) - (synergized.consistency ?? 0)).toFixed(1)}</b></li>
                  </ul>
                {/if}
              {:else if ownedCoaches.length}
                <select on:change={(event) => { coachId = (event.currentTarget as HTMLSelectElement).value || null; }}><option value="">{t('pickCoach')}</option>{#each ownedCoaches as coach (coach.id)}<option value={coach.id}>{coach.name} · {coach.year} · {coach.overall}</option>{/each}</select>
                <p class="note">{t('noCoachBonus')}</p>
              {:else}
                <p class="note">{t('noCoach')}</p>
              {/if}
              {#if complete}
                <details class="maps-acc">
                  <summary><span>{t('teamMaps')}</span><b>{effectiveMaps.map((mapId) => MAP_NAMES[mapId]).join(' · ')}</b><em>{mapPicks.length ? '' : 'auto'}</em></summary>
                  <div class="map-grid">
                    {#each ACTIVE_DUTY_MAPS.filter((mapId) => (mapContributors[mapId]?.length ?? 0) > 0) as mapId}
                      {@const count = mapContributors[mapId].length}
                      {@const chosen = (mapPicks.length ? mapPicks : effectiveMaps).includes(mapId)}
                      <button type="button" class="map" class:chosen disabled={!chosen && mapPicks.length >= 3} on:click={() => toggleMap(mapId)} title={mapContributors[mapId].map((player) => player.nickname).join(', ')}>{MAP_NAMES[mapId]} <small>{count}/5{#if coachMaps.has(mapId)} · C{/if}</small></button>
                    {/each}
                  </div>
                  <p class="note">{mapPicks.length === 0 ? t('teamMapsAuto') : mapsValid ? t('teamMapsHint') : t('teamMapsPick')}</p>
                  {#if mapPicks.length}<button class="ghost small" type="button" on:click={() => mapPicks = []}>{t('teamMapsReset')}</button>{/if}
                </details>
              {/if}
            </div>

            <div class="detail-box">
              <span class="label">{t('style')}</span>
              <div class="segmented-control">{#each ['aggressive', 'balanced', 'tactical'] as option}<button type="button" class:active={style === option} on:click={() => style = option as OrgStyle}>{gameT(option as 'aggressive' | 'balanced' | 'tactical')}</button>{/each}</div>
              <p class="note" class:warn={complete && !readyStyle}>{t(`styleReq_${style}` as Parameters<typeof t>[0])}</p>
              <span class="label">{t('synergy')}</span>
              {#if synergy.length}
                <ul class="synergy">
                  {#each synergy as line (line.key)}
                    {@const theme = line.key.startsWith('theme_') ? themes.find((item) => item.key === line.key) : undefined}
                    <li class:up={line.power > 0 || line.mental > 0 || line.clutch > 0} class:down={line.power < 0 || line.mental < 0 || line.consistency < 0}>
                      <span>{line.power < 0 || line.mental < 0 || line.consistency < 0 ? '▼' : '▲'} {line.key.startsWith('theme_') ? themeTitle(line.key, theme) + themeLabel(line.key, theme) : t(`syn_${line.key}` as Parameters<typeof t>[0])}</span>
                      <b>{line.power ? `${line.power > 0 ? '+' : ''}${line.power}% ${t('power').toLowerCase()}` : ''}{line.mental ? ` ${line.mental > 0 ? '+' : ''}${line.mental} mental` : ''}{line.clutch ? ` +${line.clutch} clutch` : ''}{line.consistency ? ` ${line.consistency} cons.` : ''}</b>
                    </li>
                  {/each}
                  <li class="total"><span>{t('synergy')}</span><b>{synergyTotal > 0 ? '+' : ''}{synergyTotal.toFixed(2)}% {t('power').toLowerCase()}</b></li>
                </ul>
              {:else}
                <p class="note">{t('lineupIncomplete')}</p>
              {/if}
            </div>

            <div class="detail-box">
              <span class="label">{t('teamStats')}</span>
              {#if baseTeam && synergized && preview}
                <ul class="stat-list">
                  <li><span>Base</span><b>{fmt(baseTeam.power)}</b></li>
                  <li><span>+ {t('synergy')}</span><b class:up={synergized.power > baseTeam.power}>{fmt(synergized.power)}</b></li>
                  <li><span>+ COACH</span><b class:up={preview.power > synergized.power}>{fmt(preview.power)}</b></li>
                  <li class="final"><span>{t('power')}</span><b>{fmt(preview.power)}</b></li>
                  <li><span>{t('mentalStat')}</span><b>{preview.mental.toFixed(1)}</b></li>
                  <li><span>{t('clutchStat')}</span><b>{preview.clutch.toFixed(1)}</b></li>
                  <li><span>{t('consistencyStat')}</span><b>{(preview.consistency ?? 0).toFixed(1)}</b></li>
                </ul>
              {:else}
                <p class="note">{t('lineupIncomplete')}</p>
              {/if}
              {#if comparison.length}
                <span class="label">{t('compareTitle')}</span>
                <ul class="stat-list compare">
                  {#each comparison as row}
                    {@const delta = row.after - row.before}
                    <li><span>{row.label}</span><b>{row.before.toFixed(row.digits)} → {row.after.toFixed(row.digits)} <em class:up={delta > 0} class:down={delta < 0}>{delta > 0 ? '+' : ''}{delta.toFixed(row.digits)}</em></b></li>
                  {/each}
                  {#if leavingPlayers.length}<li><span>{t('compareOut')}</span><b class="down">{leavingPlayers.map((player) => player.nickname ?? player.id).join(', ')}</b></li>{/if}
                  {#if joiningPlayers.length}<li><span>{t('compareIn')}</span><b class="up">{joiningPlayers.map((player) => player.nickname ?? player.id).join(', ')}</b></li>{/if}
                </ul>
              {/if}
              <button class="primary" type="button" disabled={busy || !complete} on:click={() => persistLineup()}>{t('saveLineup')}</button>
            </div>
          </div>
        </section>
        {/if}
      </div>

      {#if section !== 'store'}
      <section class="panel cards" bind:this={cardsSection}>
        <div class="section-heading"><div><span class="eyebrow">{t('myCards').toUpperCase()}</span><h2>{t('myCards')} <small>{visible.length}/{owned.length}</small></h2></div></div>
        <div class="filters">
          <label><span>{t('search')}</span><input bind:value={query} /></label>
          <label><span>{t('filterYear')}</span><select bind:value={filterYear}><option value="">{t('all')}</option>{#each YEARS as year}<option value={String(year)}>{year}</option>{/each}</select></label>
          <label><span>{t('filterRole')}</span><select bind:value={filterRole}><option value="">{t('all')}</option>{#each ROLES as role}<option value={role}>{getRoleLabel(role)}</option>{/each}</select></label>
          <label><span>{t('filterRarity')}</span><select bind:value={filterRarity}><option value="">{t('all')}</option>{#each RARITIES as rarity}<option value={rarity}>{rarity}</option>{/each}</select></label>
          {#if filtersOn}<button class="ghost small clear-filters" type="button" on:click={clearFilters}>{u('clear')}</button>{/if}
        </div>
        {#if ownedCoaches.length}
          <h3 class="subhead">COACHES <small>{ownedCoaches.length}</small></h3>
          <div class="player-grid">
            {#each ownedCoaches as coach (coach.id)}
              <CoachCard {coach} teamName={coachTeamName(coach)} active={coach.id === coachId}>
                {#if coach.id === coachId}
                  <button class="ghost small" type="button" on:click={() => coachId = null}>{t('removeFromLineup')}</button>
                {:else}
                  <button class="ghost small" type="button" on:click={() => { coachId = coach.id; scrollTo(teamSection); }}>{t('addToLineup')}</button>
                  <button class="ghost small" type="button" disabled={busy} on:click={() => sellCoach(coach)}>{t('sell')} · {coachSellValue(coach)}</button>
                {/if}
              </CoachCard>
            {/each}
          </div>
          <h3 class="subhead">{t('myCards').toUpperCase()}</h3>
        {/if}
        {#if !visible.length}
          <p class="note">{u('noCards')}</p>{#if filtersOn}<button class="secondary" type="button" on:click={clearFilters}>{u('clear')}</button>{:else}<a class="secondary link" href="/online/store">Store →</a>{/if}
        {:else}
          <div class="player-grid">
            {#each visible as player (player.id)}
              <CollectionCard {player} teamName={teamNameOf(player)} language={$language} inLineup={lineupIds.has(player.id)} star={player.id === starPlayerId && starOk} effect={effects[player.id] ?? null} onOpen={(selected) => detailsPlayer = selected}>
                {#if lineupIds.has(player.id)}
                  <button class="ghost small" type="button" on:click={() => removeFromLineup(slots.findIndex((slot) => slot?.id === player.id))}>{t('removeFromLineup')}</button>
                {:else}
                  {#if slots.every(Boolean)}
                    <button class="ghost small" type="button" disabled={busy} on:click={() => startSwap(player)}>⇄ {t('swap')}</button>
                  {:else}
                    <button class="ghost small" type="button" disabled={busy} on:click={() => addToLineup(player)}>{t('addToLineup')}</button>
                  {/if}
                  <button class="ghost small" type="button" disabled={busy} on:click={() => sell(player)}>{t('sell')} · {sellValue(player)}</button>
                {/if}
              </CollectionCard>
            {/each}
          </div>
        {/if}
      </section>
      {/if}
    {/if}
    {#if section === 'team' && state && dirty}
      <div class="save-bar"><span>{complete ? u('unsaved') : u('remaining')}</span><button type="button" class="primary" disabled={busy || !complete} on:click={() => persistLineup()}>{busy ? u('saving') : t('saveLineup')}</button></div>
    {/if}

  </section>
</PageLayout>
{#if choosingSlot !== null}
  <SelectionSheet title={u('chooseCard')} closeLabel={t('close')} onClose={() => { choosingSlot = null; pickerCandidate = null; }}>
    <label class="picker-search">{t('search')}<input type="search" bind:value={pickerQuery} /></label>
    {#if pickerCandidate}<div class="pick-review"><span>{slots[choosingSlot]?.nickname ?? t('slotEmpty')} → <b>{pickerCandidate.nickname}</b></span><button class="primary" type="button" on:click={applyPick}>{u('replace')}</button></div>{/if}
    <div class="picker-grid">{#each pickerPlayers as player (player.id)}<CollectionCard {player} teamName={teamNameOf(player)} language={$language} compact><button class="secondary small" type="button" on:click={() => pickerCandidate = player}>{u('chooseCard')}</button></CollectionCard>{/each}</div>
    {#if !pickerPlayers.length}<p>{u('noCards')}</p>{/if}
  </SelectionSheet>
{/if}
{#if swapIn && choosingSlot === null}
  <SelectionSheet title={t('swapChoose') + ' · ' + (swapIn.nickname ?? '')} closeLabel={t('cancel')} onClose={() => swapIn = null}>
    <div class="picker-grid">{#each slots as player, index}{#if player}<CollectionCard {player} teamName={teamNameOf(player)} language={$language} compact><button class="secondary small" type="button" on:click={() => swapInto(index)}>{u('replace')} {player.nickname}</button></CollectionCard>{/if}{/each}</div>
  </SelectionSheet>
{/if}

{#if detailsPlayer}
  <CollectionCardSheet player={detailsPlayer} teamName={teamNameOf(detailsPlayer)} language={$language} labels={{ close: t('close'), attributes: t('sheetAttributes'), roles: t('sheetRoles'), awards: t('sheetAwards'), value: t('sheetValue'), sell: t('sell'), coins: t('coins') }} onClose={() => detailsPlayer = null} />
{/if}
{#if toast}<div class="toast">{toast}</div>{/if}

<style>
  .collection { display: grid; gap: 18px; padding: 28px 0 70px; }
  .box { display: grid; gap: 12px; padding: 22px; }
  .link { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 16px; text-decoration: none; }
  .columns { display: grid; gap: 18px; }
  .shop, .team, .cards { display: grid; gap: 16px; padding: 22px; align-content: start; }
  .shop-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .premium-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .premium-head { margin-top: 8px; color: #d9a441; }
  .pack { position: relative; display: grid; gap: 10px; align-content: start; justify-items: center; padding: 18px 16px 16px; border: 1px solid var(--line); background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--tint, var(--accent)) 12%, var(--surface-2)), var(--surface) 70%); text-align: center; transition: border-color .2s ease, transform .2s ease; }
  .pack:hover { border-color: var(--tint, var(--accent)); }
  .pack.basic { --tint: var(--accent); }
  .pack.prata { --tint: #c9d1d9; } .pack.ouro { --tint: #ffc94d; } .pack.era { --tint: #a66bff; } .pack.diamante { --tint: #5ad1ff; } .pack.icone { --tint: #ff5ad8; }
  .pack strong { font: 900 1.45rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
  .pack small { color: var(--muted); font-size: .7rem; line-height: 1.4; }
  .pack button { width: 100%; margin-top: auto; min-height: 46px; padding: 0 12px; font-size: .72rem; }
  .price { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: .8rem; font-weight: 800; } .price i { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a8, #d9a441 60%, #8a5d10); }
  .pack.premium { grid-template-columns: auto minmax(0, 1fr); align-items: center; justify-items: stretch; gap: 22px; padding: 22px 26px; border-color: color-mix(in srgb, var(--tint) 55%, var(--line)); text-align: left; box-shadow: 0 0 30px color-mix(in srgb, var(--tint) 12%, transparent); }
  .premium-info { display: grid; gap: 10px; justify-items: start; } .premium-info strong { font-size: 2rem; } .premium-info small { color: var(--text); font-size: .85rem; }
  .dupes { text-align: center; padding-top: 8px; }
  .era-year { display: grid; gap: 4px; width: 100%; text-align: left; } .era-year span { color: var(--muted); font-size: .58rem; text-transform: uppercase; font-weight: 800; }
  .era-year select, .filters input, .filters select, .slot select { min-height: 42px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; }
  .slots { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
  .details { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
  .detail-box { display: grid; gap: 12px; align-content: start; padding: 16px; border: 1px solid var(--line); background: var(--surface-2); }
  .detail-box .label { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .stat-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .stat-list li { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; background: var(--surface); font-size: .76rem; }
  .stat-list b.up { color: var(--accent); } .stat-list li.final { border-left: 3px solid #d9a441; font-weight: 900; }
  .slot { display: grid; gap: 6px; align-content: start; min-width: 0; }
  .slot-role { display: grid; gap: 4px; } .slot-role span { color: var(--muted); font-size: .56rem; font-weight: 800; text-transform: uppercase; } .slot-role select { width: 100%; }
  .empty { display: grid; place-items: center; min-height: 230px; color: var(--muted); font-size: .8rem; border: 1px dashed var(--line); }
  .small { min-height: 36px; padding: 0 8px; font-size: .6rem; }
  .ghost.active { color: #d9a441; border-color: #d9a441; }
  .maps-acc { border: 1px solid var(--line); background: var(--surface); }
  .maps-acc summary { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; padding: 9px 10px; cursor: pointer; font-size: .74rem; list-style-position: inside; }
  .maps-acc summary span { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; } .maps-acc summary b { font-weight: 800; } .maps-acc summary em { color: var(--accent); font-size: .58rem; font-style: normal; font-weight: 800; text-transform: uppercase; }
  .maps-acc[open] summary { border-bottom: 1px solid var(--line); }
  .maps-acc .note, .maps-acc > button { margin: 0 10px 10px; } .maps-acc .note { font-size: .68rem; }
  .map-grid { display: flex; flex-wrap: wrap; gap: 5px; padding: 10px; }
  .map { min-height: 30px; padding: 0 9px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); color: var(--text); font: inherit; font-size: .7rem; font-weight: 700; cursor: pointer; }
  .map small { color: var(--muted); font-size: .58rem; }
  .map.chosen { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); } .map.chosen small { color: var(--accent); }
  .map:disabled { opacity: .4; cursor: default; }
  .swap-banner { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin: 0; padding: 10px 12px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); font-size: .82rem; } .swap-banner b { color: var(--accent); }
  .swap-here { width: 100%; animation: swap-pulse 1.1s ease-in-out infinite; }
  @keyframes swap-pulse { 50% { box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent); } }
  .slot-notes { display: grid; gap: 2px; margin: 0; font-size: .64rem; font-weight: 800; } .slot-notes .bad { color: #ff9b90; } .slot-notes .gold { color: #ffd36b; }
  .compare em { font-style: normal; margin-left: 6px; color: var(--muted); } .compare em.up, .compare b.up { color: var(--accent); } .compare em.down, .compare b.down { color: #ff9b90; }
  /* Lineup: desktop keeps the big cards; the phone swaps them for a compact row per slot. */
  .slot-desk { display: contents; }
  .slot-row { display: none; }
  .slot :global(footer) { flex-direction: column; }
  .slot :global(footer button) { width: 100%; min-width: 0; }
  @media (max-width: 720px) {
    .collection { padding-bottom: calc(170px + env(safe-area-inset-bottom)); }
    .slot-desk { display: none; }
    .slot-row { display: grid; grid-template-columns: minmax(0, 1fr) 128px; align-items: stretch; gap: 6px; min-width: 0; }
    .slot-row.coach-row { grid-template-columns: minmax(0, 1fr) 40px; }
    .row-actions { display: grid; grid-template-rows: auto auto; gap: 4px; min-width: 0; }
    .row-actions select { width: 100%; min-height: 36px; padding: 0 6px; font-size: .72rem; }
    .row-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
    .icon { display: grid; place-items: center; min-width: 0; min-height: 40px; padding: 0; border: 1px solid var(--line); border-radius: 0; background: var(--surface-2); color: var(--text); font-size: 1rem; font-weight: 900; cursor: pointer; }
    .icon:hover { border-color: var(--accent); }
    .icon.active { border-color: #d9a441; color: #ffd36b; background: color-mix(in srgb, #d9a441 14%, var(--surface)); }
    .slot .empty { min-height: 56px; }
    .slot-notes:empty { display: none; }
    .toast { bottom: 70px; }
  }
  @media (prefers-reduced-motion: reduce) { .swap-here { animation: none; } }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .warn { margin: 0; color: var(--accent-2); font-size: .78rem; font-weight: 700; }
  .coach-slot { display: grid; gap: 8px; } .coach-slot .label { color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; } .coach-slot select { min-height: 42px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; }
  .subhead { margin: 6px 0 0; color: var(--muted); font-size: .7rem; letter-spacing: .14em; } .subhead small { color: var(--accent); }
  .synergy { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .synergy li { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; border-left: 3px solid var(--line); background: var(--surface-2); font-size: .74rem; }
  .synergy li.up { border-left-color: var(--accent); } .synergy li.down { border-left-color: var(--danger); } .synergy li.total { border-left-color: #d9a441; font-weight: 800; }
  .power { color: var(--accent); font: 900 1.5rem/1 'Arial Narrow', Impact, sans-serif; }
  .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; } .filters label { display: grid; gap: 4px; } .filters span { color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; }
  .cards :global(.player-grid) { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px 12px; padding-top: 8px; }
  .online-error { padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
  .toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); padding: 10px 16px; background: var(--accent); color: #0a0d08; font-weight: 800; z-index: 20; }
  @media (max-width: 1100px) { .slots { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); } }
  @media (max-width: 1000px) { .shop-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .premium-grid { grid-template-columns: 1fr; } .pack.premium { grid-template-columns: 1fr; justify-items: center; text-align: center; } .premium-info { justify-items: center; } }
  @media (max-width: 460px) { .shop-grid { grid-template-columns: 1fr; } }

  .team-links { display: flex; flex-wrap: wrap; gap: 8px; }
  .save-bar { position: sticky; bottom: 12px; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--accent); background: var(--surface); }
  .save-bar span { font-size: .875rem; }
  .picker-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(160px,1fr)); gap: 12px; }
  .picker-search { display: grid; gap: 8px; margin-bottom: 16px; }
  .picker-search input { min-height: 48px; font-size: 16px; background: var(--surface-2); color: var(--text); border: 1px solid var(--line); padding: 10px; }
  .pick-review { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; margin-bottom: 12px; background: var(--surface); border: 1px solid var(--accent); }
  .inline-error { position: sticky; top: 140px; z-index: 21; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; background: var(--surface); }
  .clear-filters { align-self: end; }
  .small { min-height: 44px; font-size: .8rem; }
  @media(max-width:720px) {
    .collection { padding-top: 8px; }
    .save-bar { position: fixed; left: 0; right: 0; bottom: calc(65px + env(safe-area-inset-bottom)); }
    .team, .cards, .shop { padding: 14px; }
    .details { grid-template-columns: minmax(0, 1fr); }
    .slots { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .toast { bottom: calc(145px + env(safe-area-inset-bottom)); }
    .team-links > * { flex: 1 1 auto; }
    .picker-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  }
</style>
