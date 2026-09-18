<script lang="ts">
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import PlayerCard from '$lib/components/PlayerCard.svelte';
  import PlayerDetailSheet from '$lib/components/PlayerDetailSheet.svelte';
  import Roulette, { type RouletteEntry } from '$lib/components/Roulette.svelte';
  import { playerById, players } from '$lib/game/data';
  import { AccountError, accountUser, loadAccount } from '$lib/game/online/account';
  import { buyPack, fetchCollection, openDailyPack, saveLineup, sellCard, type CollectionState, type PackOpened } from '$lib/game/online/collection';
  import { applyCollectionLineup, eligibleRolesOf, isStarEffective, synergyOf, primaryRoleOf } from '$lib/game/online/collection-lineup';
  import { PACK_ODDS, PACK_PRICES, RARITIES, rarityOf, sellValue, type PackTier } from '$lib/game/online/collection-rules';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { getRoleLabel } from '$lib/game/roleRules';
  import { calculateUserTeamPower } from '$lib/game/simulation';
  import type { LineupSlotRole, OrgStyle, Player } from '$lib/game/types';

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  $: gameT = (key: Parameters<typeof translate>[1]) => translate($language, key);
  const serverUrl = getOnlineServerUrl();
  const ROLES: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const YEARS = [...new Set(players.map((player) => player.year).filter((year): year is number => Boolean(year)))].sort((a, b) => a - b);

  let state: CollectionState | null = null;
  let loading = true;
  let error = '';
  let toast = '';
  let busy = false;
  let detailsPlayer: Player | null = null;

  // Pack reveal: three roulette spins, then the cards.
  let reveal: { cards: Player[]; duplicates: Set<string>; coins: number; spinning: number } | null = null;

  // Lineup builder.
  let slots: Array<Player | null> = [null, null, null, null, null];
  let roles: Array<LineupSlotRole | null> = [null, null, null, null, null];
  let starPlayerId: string | null = null;
  let style: OrgStyle = 'balanced';
  let eraYear = YEARS.at(-1) ?? 2026;
  let showOdds = false;

  // Filters.
  let query = '';
  let filterYear = '';
  let filterRole = '';
  let filterRarity = '';

  const showToast = (message: string) => { toast = message; setTimeout(() => { if (toast === message) toast = ''; }, 2400); };
  const fail = (caught: unknown) => {
    if (caught instanceof AccountError) {
      error = caught.code === 'NO_PACKS_LEFT' ? t('noPacksLeft') : caught.code === 'INSUFFICIENT_COINS' ? `${t('wallet')}: ${caught.message}` : caught.code === 'IN_LINEUP' ? t('inLineup') : caught.message;
      return;
    }
    error = t('connectionFailed');
  };

  $: owned = state ? state.players.map((item) => playerById.get(item.playerId)).filter((player): player is Player => Boolean(player)) : [];
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
  $: lineupRoles = roles.filter((role): role is LineupSlotRole => Boolean(role));
  $: synergy = complete ? synergyOf({ players: lineupPlayers, roles: lineupRoles, starPlayerId }) : [];
  $: starOk = complete && isStarEffective(lineupPlayers, starPlayerId);
  $: preview = complete
    ? applyCollectionLineup(calculateUserTeamPower(lineupPlayers, style, lineupPlayers.map((player, index) => ({ playerId: player.id, selectedSlotRole: lineupRoles[index] })), 'preview'), { players: lineupPlayers, roles: lineupRoles, starPlayerId })
    : null;
  $: synergyTotal = synergy.reduce((sum, line) => sum + line.power, 0);
  $: packsLeft = state ? Math.max(0, state.packsToday.granted - state.packsToday.opened) : 0;

  function hydrateLineup(saved: CollectionState['lineup']) {
    if (!saved) return;
    slots = saved.playerIds.map((id) => playerById.get(id) ?? null);
    roles = [...saved.roles];
    starPlayerId = saved.starPlayerId;
    style = saved.style;
  }

  async function refresh() {
    try {
      state = await fetchCollection(serverUrl);
      if (!slots.some(Boolean)) hydrateLineup(state.lineup);
    } catch (caught) { fail(caught); }
  }

  async function runReveal(open: () => Promise<PackOpened>) {
    error = ''; busy = true;
    try {
      const result = await open();
      const cards = result.players.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
      reveal = { cards, duplicates: new Set(result.duplicates), coins: result.coinsFromDupes, spinning: 0 };
      await refresh();
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  const toEntry = (player: Player): RouletteEntry => ({ id: player.id, avatar: (player.nickname ?? '?').slice(0, 2).toUpperCase(), title: player.nickname ?? player.id, subtitle: `${player.year ?? ''} · ${rarityOf(player)}` });
  const teaserPool = players.filter((_, index) => index % 7 === 0).map(toEntry);
  $: rouletteLabels = { spinning: t('revealing'), skip: $language === 'en' ? 'Skip' : $language === 'es' ? 'Saltar' : 'Pular', hidden: '?' };

  async function sell(player: Player) {
    if (!confirm(`${t('sell')} ${player.nickname ?? player.id} · ${sellValue(player)} ${t('coins')}?`)) return;
    error = ''; busy = true;
    try { await sellCard(serverUrl, player.id); showToast(`+${sellValue(player)} ${t('coins')}`); await refresh(); } catch (caught) { fail(caught); } finally { busy = false; }
  }

  function addToLineup(player: Player) {
    if (lineupIds.has(player.id)) return;
    const index = slots.findIndex((slot) => !slot);
    if (index < 0) return;
    slots[index] = player;
    const eligible = eligibleRolesOf(player);
    roles[index] = eligible.includes(primaryRoleOf(player)) ? primaryRoleOf(player) : eligible[0] ?? 'rifler';
    slots = [...slots]; roles = [...roles];
  }

  function removeFromLineup(index: number) {
    if (slots[index]?.id === starPlayerId) starPlayerId = null;
    slots[index] = null; roles[index] = null;
    slots = [...slots]; roles = [...roles];
  }

  async function persistLineup() {
    if (!complete) { error = t('lineupIncomplete'); return; }
    error = ''; busy = true;
    try {
      await saveLineup(serverUrl, { playerIds: lineupPlayers.map((player) => player.id), roles: lineupRoles, starPlayerId, style });
      showToast(t('lineupSaved'));
      await refresh();
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  onMount(async () => {
    try {
      await loadAccount(serverUrl);
      if ($accountUser) await refresh();
    } catch (caught) { fail(caught); } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{t('collection')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="collection">
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · {t('collection').toUpperCase()}</span>
      <h1>{t('collection')}</h1>
      <p>{t('collectionIntro')}</p>
    </header>

    {#if !isOnlineEnabled()}
      <section class="panel box"><p>{t('accountsDisabled')}</p></section>
    {:else if loading}
      <section class="panel box"><p>…</p></section>
    {:else if !$accountUser}
      <section class="panel box"><p>{t('loginFirst')}</p><a class="primary link" href="/online/conta">{t('goAccount')}</a></section>
    {:else if state}
      <div class="topbar panel">
        <div><span>{t('wallet')}</span><strong>{state.wallet.toLocaleString($language)} <small>{t('coins')}</small></strong></div>
        <div><span>{t('packsToday')}</span><strong>{packsLeft}/{state.packsToday.granted}</strong></div>
        <div><span>{t('myCards')}</span><strong>{state.count}</strong></div>
        <div class="topbar-actions"><a class="secondary link" href="/online/conta">{t('account')}</a><a class="secondary link" href="/online">{t('playOnline')}</a></div>
      </div>

      <div class="columns">
        <section class="panel shop">
          <div class="section-heading"><div><span class="eyebrow">{t('shop').toUpperCase()}</span><h2>{t('shop')}</h2></div><button class="ghost small" type="button" on:click={() => showOdds = !showOdds}>{t('odds')}</button></div>
          <div class="shop-grid">
            <article class="pack basic">
              <strong>{t('packBasic')}</strong>
              <small>{packsLeft}/{state.packsToday.granted} · {t('packsToday').toLowerCase()}</small>
              <button class="primary" type="button" disabled={busy || packsLeft <= 0} on:click={() => runReveal(() => openDailyPack(serverUrl))}>{packsLeft > 0 ? t('openPack') : t('noPacksLeft')}</button>
            </article>
            {#each ['prata', 'ouro'] as tier}
              <article class="pack {tier}">
                <strong>{tier === 'prata' ? t('packPrata') : t('packOuro')}</strong>
                <small>{PACK_PRICES[tier as PackTier].toLocaleString($language)} {t('coins')}</small>
                <button class="secondary" type="button" disabled={busy || state.wallet < PACK_PRICES[tier as PackTier]} on:click={() => runReveal(() => buyPack(serverUrl, tier as 'prata' | 'ouro'))}>{t('buy')}</button>
              </article>
            {/each}
            <article class="pack era">
              <strong>{t('packEra')}</strong>
              <small>{PACK_PRICES.era.toLocaleString($language)} {t('coins')} · {t('packEraHint')}</small>
              <label class="era-year"><span>{t('filterYear')}</span><select bind:value={eraYear}>{#each YEARS as year}<option value={year}>{year}</option>{/each}</select></label>
              <button class="secondary" type="button" disabled={busy || state.wallet < PACK_PRICES.era} on:click={() => runReveal(() => buyPack(serverUrl, 'era', eraYear))}>{t('buy')}</button>
            </article>
          </div>
          {#if showOdds}
            <table class="odds">
              <thead><tr><th></th>{#each RARITIES as rarity}<th>{rarity}</th>{/each}</tr></thead>
              <tbody>{#each ['basic', 'prata', 'ouro', 'era'] as tier}<tr><th>{tier}</th>{#each RARITIES as rarity}<td>{PACK_ODDS[tier as PackTier][rarity]}%</td>{/each}</tr>{/each}</tbody>
            </table>
          {/if}

          {#if reveal}
            <div class="reveal">
              {#if reveal.spinning < reveal.cards.length}
                {#key `${reveal.cards[reveal.spinning].id}-${reveal.spinning}`}
                  <Roulette entries={teaserPool} result={toEntry(reveal.cards[reveal.spinning])} labels={rouletteLabels} duration={1400} onComplete={() => { if (reveal) reveal = { ...reveal, spinning: reveal.spinning + 1 }; }} />
                {/key}
              {/if}
              <div class="player-grid reveal-grid">
                {#each reveal.cards.slice(0, reveal.spinning) as card, index (card.id + index)}
                  <div class="reveal-card" class:dupe={reveal.duplicates.has(card.id)}>
                    <PlayerCard player={card} mode="premier" revealed language={$language} onOpen={(selected) => detailsPlayer = selected} />
                    <b>{reveal.duplicates.has(card.id) ? t('duplicateCard') : t('newCard')}</b>
                  </div>
                {/each}
              </div>
              {#if reveal.spinning >= reveal.cards.length && reveal.coins > 0}<p class="note">{reveal.duplicates.size} {t('dupesToCoins')} +{reveal.coins} {t('coins')}</p>{/if}
            </div>
          {/if}
        </section>

        <section class="panel team">
          <div class="section-heading"><div><span class="eyebrow">{t('myTeam').toUpperCase()}</span><h2>{t('myTeam')}</h2></div>{#if preview}<strong class="power">{t('power')} {Math.round(preview.power)}</strong>{/if}</div>
          <div class="slots">
            {#each slots as slot, index}
              <article class="slot" class:filled={Boolean(slot)} class:star={slot && slot.id === starPlayerId}>
                {#if slot}
                  <div class="slot-head"><strong>{slot.nickname ?? slot.id}</strong><span>{slot.year ?? ''} · OVR {slot.overall ?? '—'}</span></div>
                  <label><span>{t('role')}</span><select value={roles[index]} on:change={(event) => { roles[index] = (event.currentTarget as HTMLSelectElement).value as LineupSlotRole; roles = [...roles]; }}>{#each eligibleRolesOf(slot) as role}<option value={role}>{getRoleLabel(role)}</option>{/each}</select></label>
                  <div class="slot-actions">
                    <button class="ghost small" type="button" class:active={slot.id === starPlayerId} on:click={() => starPlayerId = starPlayerId === slot.id ? null : slot.id}>★ {t('star')}</button>
                    <button class="ghost small" type="button" on:click={() => removeFromLineup(index)}>{t('removeFromLineup')}</button>
                  </div>
                {:else}
                  <span class="empty">{t('slotEmpty')}</span>
                {/if}
              </article>
            {/each}
          </div>
          <p class="note">{t('starHint')}</p>
          {#if starPlayerId && complete && !starOk}<p class="warn">{t('starInactive')}</p>{/if}
          <div class="style-row">
            <span>{t('style')}</span>
            <div class="segmented-control">{#each ['aggressive', 'balanced', 'tactical'] as option}<button type="button" class:active={style === option} on:click={() => style = option as OrgStyle}>{gameT(option as 'aggressive' | 'balanced' | 'tactical')}</button>{/each}</div>
          </div>
          {#if synergy.length}
            <ul class="synergy">
              {#each synergy as line (line.key)}
                <li class:up={line.power > 0 || line.mental > 0 || line.clutch > 0} class:down={line.power < 0 || line.mental < 0 || line.consistency < 0}>
                  <span>{t(`syn_${line.key}` as Parameters<typeof t>[0])}</span>
                  <b>{line.power ? `${line.power > 0 ? '+' : ''}${line.power}% ${t('power').toLowerCase()}` : ''}{line.mental ? ` ${line.mental > 0 ? '+' : ''}${line.mental} mental` : ''}{line.clutch ? ` +${line.clutch} clutch` : ''}{line.consistency ? ` ${line.consistency} cons.` : ''}</b>
                </li>
              {/each}
              <li class="total"><span>{t('synergy')}</span><b>{synergyTotal > 0 ? '+' : ''}{synergyTotal.toFixed(2)}% {t('power').toLowerCase()}</b></li>
            </ul>
          {/if}
          <button class="primary" type="button" disabled={busy || !complete} on:click={persistLineup}>{t('saveLineup')}</button>
        </section>
      </div>

      <section class="panel cards">
        <div class="section-heading"><div><span class="eyebrow">{t('myCards').toUpperCase()}</span><h2>{t('myCards')} <small>{visible.length}/{owned.length}</small></h2></div></div>
        <div class="filters">
          <label><span>{t('search')}</span><input bind:value={query} /></label>
          <label><span>{t('filterYear')}</span><select bind:value={filterYear}><option value="">{t('all')}</option>{#each YEARS as year}<option value={String(year)}>{year}</option>{/each}</select></label>
          <label><span>{t('filterRole')}</span><select bind:value={filterRole}><option value="">{t('all')}</option>{#each ROLES as role}<option value={role}>{getRoleLabel(role)}</option>{/each}</select></label>
          <label><span>{t('filterRarity')}</span><select bind:value={filterRarity}><option value="">{t('all')}</option>{#each RARITIES as rarity}<option value={rarity}>{rarity}</option>{/each}</select></label>
        </div>
        {#if !owned.length}
          <p class="note">{t('noCards')}</p>
        {:else}
          <div class="player-grid">
            {#each visible as player (player.id)}
              <div class="card-wrap" class:in-lineup={lineupIds.has(player.id)}>
                <PlayerCard {player} mode="premier" revealed language={$language} onOpen={(selected) => detailsPlayer = selected} />
                <div class="card-actions">
                  {#if lineupIds.has(player.id)}
                    <span class="tag">{t('inLineup')}</span>
                  {:else}
                    <button class="ghost small" type="button" disabled={busy || slots.every(Boolean)} on:click={() => addToLineup(player)}>{t('addToLineup')}</button>
                    <button class="ghost small" type="button" disabled={busy} on:click={() => sell(player)}>{t('sell')} · {sellValue(player)}</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
    {#if error}<p class="online-error" role="alert">{error}</p>{/if}
  </section>
</PageLayout>

{#if detailsPlayer}
  <PlayerDetailSheet player={detailsPlayer} mode="premier" language={$language} draftComplete={true} lineup={[]} playerLookup={(id) => playerById.get(id)} onConfirm={() => {}} onClose={() => detailsPlayer = null} />
{/if}
{#if toast}<div class="toast">{toast}</div>{/if}

<style>
  .collection { display: grid; gap: 16px; padding: 28px 0 70px; }
  .box { display: grid; gap: 12px; padding: 22px; }
  .link { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 16px; text-decoration: none; }
  .topbar { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; padding: 14px 18px; }
  .topbar > div { display: grid; gap: 4px; }
  .topbar span { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .topbar strong { font: 900 1.5rem/1 'Arial Narrow', Impact, sans-serif; color: var(--accent); }
  .topbar strong small { font: 700 .6rem Inter, Arial, sans-serif; color: var(--muted); }
  .topbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .columns { display: grid; gap: 16px; }
  .shop, .team, .cards { display: grid; gap: 14px; padding: 20px; align-content: start; }
  .shop-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .pack { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--line); background: var(--surface-2); }
  .pack.prata { border-color: #c9d1d9; } .pack.ouro { border-color: #d9a441; } .pack.era { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .pack strong { font: 900 1.2rem/1 'Arial Narrow', Impact, sans-serif; text-transform: uppercase; }
  .pack small { color: var(--muted); font-size: .68rem; }
  .pack button { min-height: 42px; padding: 0 10px; font-size: .7rem; }
  .era-year { display: grid; gap: 4px; } .era-year span { color: var(--muted); font-size: .58rem; text-transform: uppercase; font-weight: 800; }
  .era-year select, .filters input, .filters select, .slot select { min-height: 40px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); }
  .odds { width: 100%; border-collapse: collapse; font-size: .68rem; } .odds th, .odds td { padding: 5px 6px; border: 1px solid var(--line); text-align: center; } .odds th:first-child { text-align: left; text-transform: uppercase; }
  .reveal { display: grid; gap: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
  .reveal-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .reveal-card { position: relative; } .reveal-card b { position: absolute; top: 8px; left: 8px; padding: 3px 7px; background: var(--accent); color: #0a0d08; font-size: .55rem; font-weight: 900; letter-spacing: .1em; } .reveal-card.dupe b { background: var(--muted); }
  .slots { display: grid; gap: 8px; }
  .slot { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .slot.star { border-color: #d9a441; box-shadow: inset 0 0 0 1px color-mix(in srgb, #d9a441 45%, transparent); }
  .slot-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; } .slot-head span { color: var(--muted); font-size: .68rem; }
  .slot label { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: center; } .slot label span { color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; }
  .slot-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .empty { color: var(--muted); font-size: .8rem; }
  .small { min-height: 34px; padding: 0 10px; font-size: .62rem; }
  .ghost.active { color: #d9a441; border-color: #d9a441; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .warn { margin: 0; color: var(--accent-2); font-size: .78rem; font-weight: 700; }
  .style-row { display: grid; gap: 6px; } .style-row > span { color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; }
  .synergy { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .synergy li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 9px; border-left: 3px solid var(--line); background: var(--surface-2); font-size: .72rem; }
  .synergy li.up { border-left-color: var(--accent); } .synergy li.down { border-left-color: var(--danger); } .synergy li.total { border-left-color: #d9a441; font-weight: 800; }
  .power { color: var(--accent); font: 900 1.2rem/1 'Arial Narrow', Impact, sans-serif; }
  .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; } .filters label { display: grid; gap: 4px; } .filters span { color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; }
  .card-wrap { display: grid; gap: 4px; } .card-wrap.in-lineup :global(.player-card) { border-color: var(--accent); }
  .card-actions { display: flex; gap: 4px; } .card-actions button { flex: 1; }
  .tag { padding: 8px; border: 1px dashed var(--accent); color: var(--accent); font-size: .6rem; font-weight: 800; text-align: center; text-transform: uppercase; }
  .online-error { padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
  .toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); padding: 10px 16px; background: var(--accent); color: #0a0d08; font-weight: 800; z-index: 20; }
  @media (min-width: 900px) { .columns { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } }
</style>
