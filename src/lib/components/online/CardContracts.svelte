<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { playGameSound } from '$lib/game/offlineAudio';
  import { cardCoinValue, cardLabel, cardRarity, cardUpgradeChance } from '$lib/game/online/card-value';
  import { collectionCoachById, collectionPlayerById, collectionPlayers } from '$lib/game/online/collection-pool';
  import { TRADE_INPUTS, checkTradeInputs, orgOf, tradeLadder, tradeSources, tradeTierOf, unitsOf, type TradeSource } from '$lib/game/online/card-contracts';
  import { RARITIES, type Rarity } from '$lib/game/online/collection-rules';
  import { riskUpgrade, runTradeUp, type ContractsState, type TradeUpOutcome, type UpgradeOutcome } from '$lib/game/online/collection';
  import { FAIR_CLIENT_SEED_MAX, fairRoll, isValidClientSeed, sha256Hex } from '$lib/game/online/fair';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import { getRoleLabel } from '$lib/game/roleRules';
  import { primaryRoleOf } from '$lib/game/online/collection-lineup';
  import { playerCountryOf } from '$lib/game/online/collection-countries';
  import type { Language, LineupSlotRole, Player } from '$lib/game/types';
  import CountryFlag from '../CountryFlag.svelte';
  import CollectionCard from './CollectionCard.svelte';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  /** Cards in the collection: trade-ups prefer handing out the ones the account does not own yet. */
  export let ownedIds: string[] = [];
  /** Cards on ANY saved team: they cannot be sacrificed in the risk upgrade. */
  export let lockedIds: string[] = [];
  /** Live state from GET /contracts (fragments, fair commitment). */
  export let contracts: ContractsState | null = null;
  export let onRefresh: () => void = () => {};
  /** Team names, the same the collection grid shows. */
  export let playerTeam: (player: Player) => string = () => '';

  const STEP_KEY: Record<string, OnlineTranslationKey> = { down: 'tradeupStepDown', same: 'tradeupStepSame', up: 'tradeupStepUp', double: 'tradeupStepDouble' };
  const SCOPE_KEY: Record<string, OnlineTranslationKey> = { org: 'tradeupScopeOrg', country: 'tradeupScopeCountry', any: 'tradeupScopeAny' };
  const TARGETS_SHOWN = 24;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: ownedSet = new Set(ownedIds);
  $: locked = new Set(lockedIds);

  let tab: 'tradeup' | 'risk' = 'tradeup';
  let busy = false;
  let error = '';
  let reducedMotion = false;
  let clientSeed = '';
  let committedHash = '';
  let verifyState: 'idle' | 'busy' | 'ok' | 'bad' = 'idle';

  // ——— Trade-Up ———
  let inputs: string[] = [];
  /** pick = montando; shuffle = cartas embaralhando; flip/done = carta virando/revelada. */
  let phase: 'pick' | 'shuffle' | 'flip' | 'done' = 'pick';
  let outcome: TradeUpOutcome | null = null;

  // ——— Upgrade de Risco ———
  let sacrifice = '';
  let target = '';
  let riskQuery = '';
  let riskResult: UpgradeOutcome | null = null;
  /** Cena do risco: a carta-alvo entra de costas, vira (ganhou ou não) e fica; escolher outro sacrifício esconde a cena. */
  let riskPhase: 'idle' | 'ready' | 'flip' | 'done' = 'idle';
  let timers: number[] = [];
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  /** Duração do flip cresce com a raridade, igual ao PackReveal: comum .55 s, superstar .8 s, lenda/GOAT 1 s. */
  const flipMs = (rarity: Rarity) => rarity === 'legend' || rarity === 'goat' ? 1000 : rarity === 'superstar' ? 800 : 550;
  const rarityCue = (rarity: Rarity) => playGameSound(rarity === 'goat' ? 'cardGoat' : rarity === 'legend' ? 'cardLegend' : rarity === 'superstar' ? 'cardSuperstar' : rarity === 'elite' ? 'cardRare' : 'cardCommon');

  $: fragmentCounts = new Map((contracts?.fragments ?? []).map((fragment) => [fragment.playerId, fragment.count]));
  $: fragmentPlayers = [...fragmentCounts.entries()]
    .map(([id, count]) => ({ player: collectionPlayerById.get(id) ?? null, id, count }))
    .filter((entry): entry is { player: Player; id: string; count: number } => Boolean(entry.player))
    .sort((a, b) => b.count - a.count || (b.player.overall ?? 0) - (a.player.overall ?? 0));
  $: rarityAvailability = RARITIES.map((rarity) => ({ rarity, donors: fragmentPlayers.filter((entry) => cardRarity(entry.id) === rarity) })).filter((row) => row.donors.length > 0);
  /** A raridade tranca a entrega a partir da primeira unidade: sem mistura de níveis no trade-up. */
  let lockedRarity: Rarity | '' = '';
  $: lockedRarity = inputs.length ? cardRarity(inputs[0]) : '';
  $: inputCards = inputs.map((id) => collectionPlayerById.get(id)).filter((player): player is Player => Boolean(player));
  $: inputCheck = checkTradeInputs(inputs);
  let ladder: ReturnType<typeof tradeLadder> | null = null;
  let sources: TradeSource[] = [];
  $: {
    ladder = inputCheck.ok ? tradeLadder(inputCheck.rarity!) : null;
    sources = inputCheck.ok ? tradeSources(inputs) : [];
  }
  /** Pesos por coleção: a composição da entrega vira a % visível (3 Vitality em 5 = 60%). */
  $: orgWeights = inputCards.length === TRADE_INPUTS ? orgWeightsOf(inputCards) : [];
  $: upTier = ladder ? (ladder.steps.find((step) => step.step === 'up') ?? ladder.steps[0]).tier : null;
  /** Candidatas do degrau mais provável: união dos pools das coleções sorteadas (o ZywOo aparece aqui). */
  $: candidateIds = upTier && sources.length
    ? [...new Set(sources.flatMap((source) => [source.orgPool, source.countryPool]).flat().filter((player) => cardRarity(player.id) === upTier).map((player) => player.id))].slice(0, 8)
    : [];
  $: canTrade = inputCheck.ok && !busy && phase === 'pick';
  $: sacrificeCard = sacrifice ? collectionPlayerById.get(sacrifice) ?? null : null;
  $: sacrificeable = ownedIds
    .filter((id) => !locked.has(id) && id !== sacrifice && collectionPlayerById.has(id))
    .map((id) => ({ id, player: collectionPlayerById.get(id)! }));
  /** Pesos por coleção: a composição da entrega vira a % visível (3 Vitality em 5 = 60%). */
  $: needle = riskQuery.trim().toLowerCase();
  $: riskTargets = sacrificeCard
    ? collectionPlayers
        .filter((player) => cardCoinValue(player.id) > cardCoinValue(sacrificeCard.id) && !ownedSet.has(player.id) && (!needle || cardLabel(player.id).toLowerCase().includes(needle)))
        .sort((a, b) => cardCoinValue(a.id) - cardCoinValue(b.id))
        .slice(0, TARGETS_SHOWN)
    : [];
  $: riskChance = sacrifice && target ? cardUpgradeChance([sacrifice], target) : 0;
  $: canRisk = Boolean(sacrifice && target && riskChance > 0) && !busy;
  $: seedOk = isValidClientSeed(clientSeed);
  $: resultPlayer = outcome ? collectionPlayerById.get(outcome.result) ?? null : riskResult?.won ? collectionPlayerById.get(riskResult.target) ?? null : null;
  $: resultRarity = outcome ? (outcome.resultTier as Rarity) : riskResult?.won ? cardRarity(riskResult.target) : 'common';
  $: revealed = outcome ?? riskResult;
  /** O alvo do risco aparece na cena ganhe ou perca: perdeu, ele vira apagado. */
  $: riskTargetPlayer = riskResult ? collectionPlayerById.get(riskResult.target) ?? null : null;
  $: riskTargetRarity = riskResult ? cardRarity(riskResult.target) : 'common';

  const fmt = (value: number) => value.toLocaleString(language);
  const pct = (value: number) => `${(value * 100).toLocaleString(language, { maximumFractionDigits: 1 })}%`;
  const randomClientSeed = () => [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  // agrupamento por coleção para os pesos visíveis
  function orgWeightsOf(cards: Player[]): Array<{ org: string; label: string; cards: Player[] }> {
    const groups = new Map<string, { org: string; label: string; cards: Player[] }>();
    for (const card of cards) {
      const org = orgOf(card);
      const label = card.teamId ? card.teamId.replace(/-\d{4}$/, '') : org;
      const group = groups.get(org);
      if (group) group.cards.push(card);
      else groups.set(org, { org, label, cards: [card] });
    }
    return [...groups.values()].sort((a, b) => b.cards.length - a.cards.length);
  }

  /** Unidades da carta já na entrega. */
  const units = (id: string) => unitsOf(inputs, id);
  function addUnit(id: string) {
    if (busy || phase !== 'pick' || inputs.length >= TRADE_INPUTS) return;
    const entry = fragmentPlayers.find((item) => item.id === id);
    if (!entry || units(id) >= entry.count) return;
    if (lockedRarity && cardRarity(id) !== lockedRarity) return;
    inputs = [...inputs, id];
  }
  function removeUnit(id: string) {
    if (busy || phase !== 'pick') return;
    const index = inputs.lastIndexOf(id);
    if (index >= 0) inputs = [...inputs.slice(0, index), ...inputs.slice(index + 1)];
  }
  /** Pode somar mais uma unidade: estoque da carta, teto de 5 e raridade da entrega. */
  function canAddUnit(id: string, count: number): boolean {
    if (busy || phase !== 'pick' || inputs.length >= TRADE_INPUTS) return false;
    if (units(id) >= count) return false;
    return !lockedRarity || cardRarity(id) === lockedRarity;
  }

  function switchTab(value: 'tradeup' | 'risk') {
    if (busy || phase !== 'pick') return;
    tab = value;
    inputs = [];
    outcome = null;
    riskResult = null;
    sacrifice = '';
    target = '';
    riskQuery = '';
    error = '';
  }

  const applyState = (fragments: ContractsState['fragments'], progress: ContractsState['progress'], fair: ContractsState['fair']) => {
    contracts = { fragments, progress, fair };
  };

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  async function goTrade() {
    if (!canTrade) return;
    if (!seedOk) { error = t('fairBadSeed'); return; }
    const confirmed = await confirmDialog({ title: t('tradeupConfirmTitle'), body: t('tradeupConfirm'), confirmLabel: t('tradeupGo'), cancelLabel: t('cancel') });
    if (!confirmed) return;
    busy = true;
    error = '';
    try {
      // O servidor decide durante o embaralhamento; a carta só vira no final.
      phase = 'shuffle';
      if (!reducedMotion) playGameSound('tick');
      const result = await runTradeUp(serverUrl, [...inputs], clientSeed);
      committedHash = contracts?.fair.serverSeedHash ?? result.serverSeedHash;
      verifyState = 'idle';
      outcome = result;
      applyState(result.fragments ?? [], result.progress ?? {}, result.next);
      const rarity = result.resultTier as Rarity;
      if (reducedMotion) {
        inputs = [];
        phase = 'done';
        rarityCue(rarity);
      } else {
        // Três cliques espaçados fecham o embaralhamento e desembocam no flip.
        for (const delay of [250, 500, 750]) later(() => playGameSound('tick'), delay);
        await wait(1000);
        phase = 'flip';
        rarityCue(rarity);
        inputs = [];
        await wait(flipMs(rarity) + 200);
        phase = 'done';
      }
      onRefresh();
    } catch (caught) {
      phase = 'pick';
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { busy = false; }
  }

  async function goRisk() {
    if (!canRisk) return;
    if (!seedOk) { error = t('fairBadSeed'); return; }
    const confirmed = await confirmDialog({ title: t('riskGo'), body: `${t('riskPick')}: ${cardLabel(sacrifice)} → ${cardLabel(target)} · ${pct(riskChance)}`, confirmLabel: t('riskGo'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!confirmed) return;
    busy = true;
    error = '';
    try {
      const result = await riskUpgrade(serverUrl, sacrifice, target, clientSeed);
      committedHash = contracts?.fair.serverSeedHash ?? result.serverSeedHash;
      verifyState = 'idle';
      riskResult = result;
      outcome = null;
      // A carta-alvo entra de costas num quadro e vira no seguinte; o som cai no instante do flip.
      riskPhase = 'ready';
      await tick();
      const rarity = cardRarity(result.target);
      if (reducedMotion) {
        riskPhase = 'done';
        playGameSound(result.won ? 'betWin' : 'betLoss');
      } else {
        await wait(60);
        riskPhase = 'flip';
        playGameSound(result.won ? 'betWin' : 'betLoss');
        await wait(flipMs(rarity) + 200);
        riskPhase = 'done';
      }
      onRefresh();
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { busy = false; }
  }

  /** Um novo sacrifício limpa a cena do risco; o painel de verificação continua com o último resultado. */
  function pickSacrifice(id: string) {
    sacrifice = id;
    target = '';
    riskPhase = 'idle';
  }

  async function verify() {
    if (!revealed || verifyState === 'busy') return;
    verifyState = 'busy';
    try {
      const hash = await sha256Hex(revealed.serverSeed);
      const roll = await fairRoll(revealed.serverSeed, revealed.clientSeed, revealed.nonce);
      let ok = hash === committedHash && roll === revealed.roll;
      if (ok && outcome) {
        const ladderCheck = tradeLadder(outcome.inputTier as Rarity);
        ok = tradeTierOf(ladderCheck, roll).tier === outcome.resultTier
          && (await fairRoll(outcome.serverSeed, outcome.clientSeed, outcome.nonce, 'aff')) === outcome.sourceRoll
          && (await fairRoll(outcome.serverSeed, outcome.clientSeed, outcome.nonce, 'pick')) === outcome.pickRoll;
      } else if (ok && riskResult) {
        ok = (roll < riskResult.chance) === riskResult.won;
      }
      verifyState = ok ? 'ok' : 'bad';
    } catch { verifyState = 'bad'; }
  }

  onMount(() => {
    clientSeed = randomClientSeed();
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = query.matches;
    const update = () => reducedMotion = query.matches;
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });
  onDestroy(() => { if (typeof window !== 'undefined') for (const timer of timers) window.clearTimeout(timer); });

  function roleName(role: LineupSlotRole) { return getRoleLabel(role); }
</script>

<section class="contracts" aria-label={t('contracts')}>
  {#if error}<p class="contracts-error" role="alert">{error}</p>{/if}

  <div class="fragments panel">
    <div class="col-head">
      <span class="label">{t('contractsFragmentTitle')}</span>
      <strong class="count">{fmt(fragmentPlayers.reduce((sum, entry) => sum + entry.count, 0))} <small>· {fragmentPlayers.length}</small></strong>
    </div>
    {#if fragmentPlayers.length}
      <div class="fragment-strip" role="list">
        {#each fragmentPlayers as entry (entry.id)}
          <span class="fragment-chip fx-{cardRarity(entry.id)}" role="listitem" title={cardLabel(entry.id)}>
            <i class="dot" aria-hidden="true"></i>
            <b>{entry.player.nickname ?? entry.id}</b>
            <small>×{entry.count}</small>
          </span>
        {/each}
      </div>
    {:else}
      <p class="note">{t('contractsFragmentEmpty')}</p>
    {/if}
  </div>

  <nav class="tabs" aria-label={t('contracts')}>
    <button type="button" class:active={tab === 'tradeup'} on:click={() => switchTab('tradeup')}>{t('tradeupTitle')}</button>
    <button type="button" class:active={tab === 'risk'} on:click={() => switchTab('risk')}>{t('riskTitle')}</button>
  </nav>

  {#if tab === 'tradeup'}
    <div class="board">
      <div class="column stake-col">
        <div class="col-head">
          <span class="label">{t('tradeupInputs')}</span>
          <strong class="count">{inputs.length}/{TRADE_INPUTS}</strong>
        </div>
        {#if inputCards.length}
          <div class="mini-grid staked">
            {#each inputCards as player, index (player.id + ':' + index)}
              <div class="pick picked fx-{cardRarity(player.id)}" class:shuffling={phase === 'shuffle'} style="--i: {index}">
                <CollectionCard player={player} teamName={playerTeam(player)} {language} compact>
                  {#if phase === 'pick'}<button class="ghost small" type="button" on:click={() => removeUnit(player.id)}>✕</button>{/if}
                </CollectionCard>
              </div>
            {/each}
          </div>
        {:else}
          <span class="empty">{t('tradeupPick')} — {TRADE_INPUTS} {t('tradeupInputs').toLowerCase()}</span>
        {/if}

        <h3 class="subhead">{t('contractsFragmentTitle').toUpperCase()} <small>{fragmentPlayers.length}</small></h3>
        {#each rarityAvailability as row (row.rarity)}
          <section class="frag-group" class:dim={lockedRarity && lockedRarity !== row.rarity}>
            <h4 class="frag-head fx-{row.rarity}">
              <i class="dot" aria-hidden="true"></i>
              <span>{row.rarity}</span>
              <small>{row.donors.length} · {row.donors.reduce((sum, entry) => sum + entry.count, 0)}×</small>
              {#if lockedRarity === row.rarity}<em>{inputs.length}/{TRADE_INPUTS}</em>{/if}
            </h4>
            <div class="mini-grid">
              {#each row.donors as entry (entry.id)}
                {@const used = units(entry.id)}
                <div class="pick fx-{cardRarity(entry.id)}" class:picked={used > 0}>
                  <span class="frag-tag">{used > 0 ? `${used}/${entry.count}` : `×${entry.count}`}</span>
                  <CollectionCard player={entry.player} teamName={playerTeam(entry.player)} {language} compact>
                    <div class="stepper">
                      {#if used > 0}<button class="ghost small" type="button" disabled={phase !== 'pick'} on:click={() => removeUnit(entry.id)}>−</button>{/if}
                      <b class="step-count" class:used={used > 0}>{used > 0 ? used : '+'}</b>
                      {#if canAddUnit(entry.id, entry.count)}<button class="ghost small" type="button" on:click={() => addUnit(entry.id)}>+</button>{/if}
                    </div>
                  </CollectionCard>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      <div class="column stage-col">
        {#if phase !== 'pick' && outcome && resultPlayer}
          <div class="reveal fx-{resultRarity}">
            {#if !reducedMotion && phase !== 'shuffle'}
              <div class="rays" aria-hidden="true"></div>
            {/if}
            <div class="flip-scene" class:shuffling={phase === 'shuffle'}>
              <div class="flip-card" class:flipped={phase === 'flip' || phase === 'done'}>
                <div class="face front" aria-hidden="true"><span class="chip">CS</span></div>
                <div class="face back"><CollectionCard player={resultPlayer} teamName={playerTeam(resultPlayer)} {language} /></div>
              </div>
            </div>
            <p class="reveal-line">
              {#if phase !== 'shuffle'}
                <b class="win">{t(STEP_KEY[outcome.step])}</b>
                · {t(SCOPE_KEY[outcome.scope])}
                {#if outcome.duplicate} · <span class="dupe">{t('contractsDuplicate')}</span>{/if}
              {/if}
            </p>
          </div>
        {/if}

        {#if ladder}
          <p class="mini-title">{t('tradeupLadder')}</p>
          <div class="ladder" role="table" aria-label={t('tradeupLadder')}>
            {#each [...ladder.steps].sort((a, b) => b.mass - a.mass) as row (row.step)}
              <div class="rung" class:up={row.step === 'up'}>
                <span class="tier">{row.tier.toUpperCase()} · {t(STEP_KEY[row.step])}</span>
                <span class="bar" aria-hidden="true"><i style="width: {Math.max(3, row.mass * 100)}%"></i></span>
                <b class="mass">{pct(row.mass)}</b>
              </div>
            {/each}
          </div>
          <p class="mini-title">{t('tradeupSources')}</p>
          <div class="sources" role="list">
            {#each orgWeights as group (group.org)}
              <div class="source-row" role="listitem">
                <b>{group.label}</b>
                <span class="bar" aria-hidden="true"><i style="width: {(group.cards.length / TRADE_INPUTS) * 100}%"></i></span>
                <b class="mass">{pct(group.cards.length / TRADE_INPUTS)}</b>
              </div>
            {/each}
          </div>
          <p class="note">{t('tradeupSourceHint')}</p>
          {#if candidateIds.length}
            <div class="pool-line" role="note">
              <span class="label">{t('tradeupPool')} · {upTier?.toUpperCase()}</span>
              <span class="pool-counts">{#each candidateIds as id, index (id)}{#if index}·{/if}<b class="fx-{cardRarity(id)}">{collectionPlayerById.get(id)?.nickname ?? id} {collectionPlayerById.get(id)?.year ?? ''}</b>{/each}</span>
            </div>
          {/if}
          <button type="button" class="primary go" disabled={busy || !canTrade} on:click={goTrade}>{busy || phase !== 'pick' ? t('contractsRolling') : t('tradeupGo')}</button>
        {:else}
          <p class="note">{t('tradeupPick')} — {inputs.length}/{TRADE_INPUTS}{#if inputs.length} · {t('tradeupSameRarity')}{/if}</p>
          <button type="button" class="primary go" disabled>{t('tradeupGo')}</button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="board">
      <div class="column stake-col">
        <div class="col-head"><span class="label">{t('riskPick')}</span>{#if sacrificeCard}<strong class="count">{fmt(cardCoinValue(sacrificeCard.id))} <small>coins</small></strong>{/if}</div>
        <div class="mini-grid scroll">
          {#each sacrificeable.slice(0, 40) as entry (entry.id)}
            {@const picked = sacrifice === entry.id}
            <div class="pick fx-{cardRarity(entry.id)}" class:picked>
              <span class="frag-tag">{fmt(cardCoinValue(entry.id))}</span>
              <CollectionCard player={entry.player} teamName={playerTeam(entry.player)} {language} compact>
                <button class={picked ? 'secondary small' : 'ghost small'} type="button" on:click={() => pickSacrifice(entry.id)}>{picked ? '✓' : '+'}</button>
              </CollectionCard>
            </div>
          {/each}
        </div>
      </div>
      <div class="column stage-col">
        {#if riskPhase !== 'idle' && riskResult && riskTargetPlayer}
          <!-- Resultado do risco: o sacrifício sai (derrota) ou apaga (vitória) e o alvo vira na mesma cena do trade-up. -->
          <div class="reveal risk-reveal fx-{riskTargetRarity}" class:lost={!riskResult.won}>
            {#if !reducedMotion && riskResult.won && riskPhase !== 'ready'}
              <div class="rays" aria-hidden="true"></div>
            {/if}
            <div class="risk-pair">
              {#if sacrificeCard}
                <div class="pick offering fx-{cardRarity(sacrificeCard.id)}" class:gone={!riskResult.won && riskPhase !== 'ready'} class:spent={riskResult.won && riskPhase !== 'ready'}>
                  <span class="frag-tag">{fmt(cardCoinValue(sacrificeCard.id))}</span>
                  <CollectionCard player={sacrificeCard} teamName={playerTeam(sacrificeCard)} {language} compact />
                </div>
              {/if}
              <div class="flip-scene">
                <div class="flip-card" class:flipped={riskPhase === 'flip' || riskPhase === 'done'}>
                  <div class="face front" aria-hidden="true"><span class="chip">CS</span></div>
                  <div class="face back"><CollectionCard player={riskTargetPlayer} teamName={playerTeam(riskTargetPlayer)} {language} compact /></div>
                </div>
              </div>
            </div>
            <p class="reveal-line">
              <b class={riskResult.won ? 'win' : 'miss'}>{riskResult.won ? t('fairWin') : t('riskLoss')}</b>
              · {pct(riskResult.chance)}
            </p>
          </div>
        {/if}
        <div class="col-head"><span class="label">{t('riskTarget')}</span></div>
        <input type="search" placeholder={t('riskSearch')} bind:value={riskQuery} disabled={!sacrificeCard} />
        <div class="mini-grid scroll targets">
          {#each riskTargets as player (player.id)}
            {@const aimed = target === player.id}
            <div class="pick fx-{cardRarity(player.id)}" class:picked={aimed}>
              <span class="frag-tag">{fmt(cardCoinValue(player.id))}</span>
              <CollectionCard player={player} teamName={playerTeam(player)} {language} compact>
                <button class={aimed ? 'secondary small' : 'ghost small'} type="button" on:click={() => (target = player.id)}>{aimed ? '✓' : t('riskTarget')}</button>
              </CollectionCard>
            </div>
          {/each}
        </div>
        <button type="button" class="primary go danger" disabled={busy || !canRisk} on:click={goRisk}>{busy ? t('contractsRolling') : `${t('riskGo')}${riskChance ? ` · ${pct(riskChance)}` : ''}`}</button>
      </div>
    </div>
  {/if}

  <section class="fair" aria-labelledby="fair-title">
    <div class="fair-head">
      <h3 id="fair-title">{t('fairTitle')}</h3>
      <p>{t('fairIntro')}</p>
    </div>
    <dl class="fair-grid">
      <div class="wide"><dt>{t('fairServerHash')}</dt><dd><code>{contracts?.fair.serverSeedHash ?? '…'}</code></dd></div>
      <div class="wide">
        <dt><label for="contract-client-seed">{t('fairClientSeed')}</label></dt>
        <dd class="seed-row">
          <input id="contract-client-seed" type="text" bind:value={clientSeed} maxlength={FAIR_CLIENT_SEED_MAX} spellcheck="false" autocomplete="off" disabled={busy} aria-invalid={!seedOk} />
          <button type="button" class="ghost small" disabled={busy} on:click={() => clientSeed = randomClientSeed()}>{t('fairNewClientSeed')}</button>
        </dd>
        <small class:bad={!seedOk}>{seedOk ? t('fairClientSeedHint') : t('fairBadSeed')}</small>
      </div>
      <div><dt>{t('fairNonce')}</dt><dd><code>{contracts?.fair.nonce ?? '…'}</code></dd></div>
    </dl>
    <div class="fair-reveal">
      {#if revealed}
        <dl class="fair-grid">
          <div class="wide"><dt>{t('fairServerSeed')}</dt><dd><code>{revealed.serverSeed}</code></dd></div>
          <div class="wide"><dt>{t('fairServerHash')}</dt><dd><code>{committedHash}</code></dd></div>
          <div><dt>{t('fairClientSeed')}</dt><dd><code>{revealed.clientSeed}</code></dd></div>
          <div><dt>{t('fairNonce')}</dt><dd><code>{revealed.nonce}</code></dd></div>
          <div><dt>{t('fairRoll')}</dt><dd><code>{revealed.roll.toFixed(6)}</code></dd></div>
          <div><dt>{t('fairResult')}</dt><dd class:win={outcome ? outcome.step !== 'down' : riskResult?.won === true} class:loss={outcome ? outcome.step === 'down' : riskResult?.won === false}>
            {#if outcome}{outcome.resultTier} · {t(STEP_KEY[outcome.step])} · {t(SCOPE_KEY[outcome.scope])}
            {:else if riskResult}{riskResult.won ? t('fairWin') : t('riskLoss')}
            {/if}
          </dd></div>
        </dl>
        <div class="verify-row">
          <button type="button" class="secondary small" disabled={verifyState === 'busy'} on:click={verify}>{verifyState === 'busy' ? t('fairVerifying') : t('fairVerify')}</button>
          {#if verifyState === 'ok'}<span class="check ok" role="status">✓ {t('fairVerified')}</span>{/if}
          {#if verifyState === 'bad'}<span class="check bad" role="status">✗ {t('fairMismatch')}</span>{/if}
        </div>
      {:else}
        <p class="note">{t('fairAfterSpin')}</p>
      {/if}
    </div>
  </section>
</section>

<style>
  .contracts { display: grid; gap: 16px; }
  .contracts-error { margin: 0; padding: 10px 12px; border: 1px solid var(--danger); color: #ff9b90; font-size: .78rem; }
  .panel { border: 1px solid var(--line); background: var(--surface-2); }
  .fragments { display: grid; gap: 10px; padding: 14px 16px; }
  .col-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; justify-content: space-between; }
  .label { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .count { color: var(--accent); font: 900 1.15rem/1 'Arial Narrow', Impact, sans-serif; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .count small { color: var(--muted); font: 700 .6rem Inter, Arial, sans-serif; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .note.warn { color: #ffd36b; }
  .fragment-strip { display: flex; flex-wrap: wrap; gap: 6px; max-height: 132px; overflow-y: auto; }
  .fragment-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); background: var(--surface); font-size: .72rem; }
  .fragment-chip b { font-weight: 800; }
  .fragment-chip small { color: var(--muted); font-variant-numeric: tabular-nums; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fx, var(--muted)); }

  .tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tabs button { min-height: 44px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font: inherit; font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .tabs button.active { border-color: var(--accent); color: var(--accent); background: var(--surface-2); }

  .board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 18px; align-items: start; }
  .column { display: grid; gap: 12px; align-content: start; min-width: 0; padding: 16px; border: 1px solid var(--line); background: var(--surface-2); }
  .stage-col { position: sticky; top: 150px; background: var(--surface); }
  .empty { display: grid; place-items: center; min-height: 120px; padding: 12px; border: 1px dashed var(--line); color: var(--muted); font-size: .76rem; text-align: center; }
  .subhead { margin: 8px 0 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: .7rem; letter-spacing: .14em; } .subhead small { color: var(--accent); }
  .mini-title { margin: 8px 0 0; color: var(--muted); font-size: .66rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .mini-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .mini-grid.scroll { max-height: 620px; overflow-y: auto; padding: 4px 4px 4px 0; }
  .mini-grid.targets { max-height: 380px; }
  .frag-group { display: grid; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); transition: opacity .2s ease; }
  .frag-group.dim { opacity: .35; }
  .frag-group:first-of-type { border-top: 0; padding-top: 0; }
  .frag-head { display: flex; align-items: baseline; gap: 8px; margin: 0; color: var(--fx, var(--muted)); font: 800 .68rem Inter, Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .frag-head small { color: var(--muted); font-weight: 700; letter-spacing: .06em; }
  .frag-head em { margin-left: auto; color: var(--accent); font: 900 .68rem 'Arial Narrow', Impact, sans-serif; font-style: normal; font-variant-numeric: tabular-nums; }
  .frag-head .dot { align-self: center; width: 9px; height: 9px; border-radius: 50%; background: var(--fx); box-shadow: 0 0 8px color-mix(in srgb, var(--fx) 60%, transparent); }
  .stepper { display: flex; align-items: stretch; gap: 4px; width: 100%; }
  .stepper:empty { display: none; }
  .stepper :global(.small) { flex: 0 0 auto; min-width: 38px; }
  .step-count { flex: 1; display: grid; place-items: center; min-height: 36px; border: 1px dashed var(--line); color: var(--muted); font: 800 .72rem 'Arial Narrow', Impact, sans-serif; }
  .step-count.used { border-style: solid; border-color: var(--fx, var(--accent)); color: var(--fx, var(--accent)); }
  .pick { position: relative; min-width: 0; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color .18s ease; }
  .pick.picked { outline-color: var(--fx, var(--accent)); }
  .pick :global(.small) { width: 100%; min-height: 36px; padding: 0 8px; border-radius: 0; font-size: .6rem; }
  .frag-tag { position: absolute; top: 6px; right: 6px; z-index: 2; padding: 3px 6px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 88%, transparent); font-size: .62rem; font-weight: 800; font-variant-numeric: tabular-nums; pointer-events: none; }
  .pick.shuffling { animation: shuffle-card .42s calc(var(--i) * .06s) ease-in-out infinite alternate; }
  @keyframes shuffle-card {
    0% { transform: translate(0, 0) rotate(0); }
    35% { transform: translate(-9px, -5px) rotate(-3.5deg); }
    70% { transform: translate(8px, 4px) rotate(3deg); }
    100% { transform: translate(-4px, 2px) rotate(-1.5deg); }
  }

  /* Revelação: a pilha embaralha e a carta vira devagar, com o brilho da raridade. */
  .reveal { position: relative; display: grid; justify-items: center; gap: 10px; padding: 18px 12px 12px; overflow: hidden; --fx: #8d979e; }
  .flip-scene { position: relative; z-index: 2; perspective: 1400px; width: min(100%, 300px); }
  .flip-card { position: relative; width: 100%; transform-style: preserve-3d; transition: transform .55s var(--ease-out-soft); }
  /* O flip dura conforme a raridade, como no PackReveal. */
  .reveal.fx-superstar .flip-card { transition-duration: .8s; }
  .reveal.fx-legend .flip-card, .reveal.fx-goat .flip-card { transition-duration: 1s; }
  .flip-card.flipped { transform: rotateY(180deg); }
  .flip-scene.shuffling .flip-card { animation: shuffle-card .42s ease-in-out infinite alternate; }
  .face { backface-visibility: hidden; }
  /* A carta define a altura; a face de costas só cobre por cima dela. */
  .face.back { position: relative; transform: rotateY(180deg); }
  .face.back :global(.card) { height: 100%; }
  .face.front { position: absolute; inset: 0; display: grid; place-items: center; border: 1px solid var(--line); background: linear-gradient(160deg, var(--surface-2), color-mix(in srgb, var(--fx) 18%, var(--surface-2))); }
  .face .chip { padding: 6px 10px; background: #c6fa36; color: #060809; font: 900 .9rem 'Arial Narrow', Impact, sans-serif; letter-spacing: .1em; }
  .flip-card:not(.flipped) .face.back :global(.card) { opacity: 0; }
  .flip-card.flipped .face.front { opacity: 0; }
  .flip-card.flipped :global(.card) { border-color: var(--fx); box-shadow: 0 0 34px color-mix(in srgb, var(--fx) 60%, transparent), 0 0 90px color-mix(in srgb, var(--fx) 25%, transparent); }
  .reveal-line { position: relative; z-index: 2; margin: 0; min-height: 1.2em; font-size: .8rem; color: var(--muted); text-align: center; }
  .reveal-line .win { color: var(--fx); text-transform: uppercase; letter-spacing: .06em; }
  .reveal-line .dupe { color: var(--muted); }
  /* Risco: sacrifício à esquerda, alvo virando à direita. Perdeu: o sacrifício sobe e some; ganhou: fica apagado (foi gasto). */
  .risk-pair { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; width: 100%; }
  .risk-reveal .flip-scene { width: 100%; }
  .pick.offering { transition: outline-color .18s ease, opacity 300ms var(--ease-out-strong), transform 300ms var(--ease-out-strong), filter 300ms var(--ease-out-strong); }
  .pick.gone { opacity: 0; transform: translateY(-100%); }
  .pick.spent { opacity: .45; filter: grayscale(.7); }
  .reveal.lost .flip-card.flipped :global(.card) { border-color: var(--line); box-shadow: none; filter: grayscale(.8) brightness(.7); }
  .reveal-line .miss { color: #ff9b90; text-transform: uppercase; letter-spacing: .06em; }
  .rays { position: absolute; left: 50%; top: 42%; z-index: 0; width: 170%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--fx) 30%, transparent) 0 7deg, transparent 7deg 20deg); mask-image: radial-gradient(closest-side, #000 25%, transparent 72%); animation: rays-spin 14s linear infinite; pointer-events: none; }
  @keyframes rays-spin { to { rotate: 360deg; } }

  .ladder, .sources { display: grid; gap: 6px; }
  .rung, .source-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(60px, 110px) 62px; gap: 8px; align-items: center; }
  .rung .tier, .source-row b:first-child { color: var(--muted); font-size: .64rem; font-weight: 800; letter-spacing: .06em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rung.up .tier { color: var(--accent); }
  .rung .bar, .source-row .bar { display: block; height: 10px; border: 1px solid var(--line); background: var(--surface-2); }
  .rung .bar i, .source-row .bar i { display: block; height: 100%; background: var(--muted); }
  .rung.up .bar i { background: var(--accent); }
  .source-row .bar i { background: #ffd36b; }
  .rung .mass, .source-row .mass { text-align: right; font-size: .72rem; font-variant-numeric: tabular-nums; }
  .pool-line { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; padding-top: 8px; border-top: 1px solid var(--line); }
  .pool-counts { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: .72rem; }
  .pool-counts b { font-weight: 800; }
  .go { width: 100%; min-height: 52px; border-radius: 0; margin-top: 4px; }
  .go:disabled { opacity: .45; cursor: not-allowed; }
  .go.danger { border-color: var(--danger); }
  .stage-col input[type='search'] { min-height: 42px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: inherit; }

  .fair { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--line); background: var(--surface-2); }
  .fair-head h3 { margin: 0; font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  .fair-head p { margin: 0; color: var(--muted); font-size: .76rem; line-height: 1.5; }
  .fair-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px 16px; margin: 0; }
  .fair-grid > div { display: grid; gap: 4px; min-width: 0; }
  .fair-grid .wide { grid-column: 1 / -1; }
  .fair-grid dt { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .fair-grid dd { margin: 0; font-size: .78rem; overflow-wrap: anywhere; }
  .fair-grid dd.win { color: var(--accent); font-weight: 800; } .fair-grid dd.loss { color: #ffd36b; font-weight: 800; }
  .fair code { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: .74rem; overflow-wrap: anywhere; }
  .fair small { color: var(--muted); font-size: .66rem; } .fair small.bad { color: #ff9b90; }
  .seed-row { display: flex; gap: 8px; }
  .seed-row input { flex: 1; min-width: 0; min-height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: .78rem ui-monospace, Menlo, monospace; }
  .seed-row input[aria-invalid='true'] { border-color: var(--danger); }
  .seed-row :global(.small), .verify-row :global(.small) { min-height: 40px; padding: 0 12px; border-radius: 0; font-size: .62rem; }
  .fair-reveal { display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .verify-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .check { font-size: .76rem; font-weight: 800; } .check.ok { color: var(--accent); } .check.bad { color: #ff9b90; }

  .fx-rare { --fx: #4da3ff; } .fx-elite { --fx: #a66bff; } .fx-superstar { --fx: #ff8a3d; } .fx-legend { --fx: #ffc94d; } .fx-goat { --fx: #ff5ad8; }

  @media (max-width: 980px) {
    .board { grid-template-columns: 1fr; }
    .stage-col { position: static; }
    .mini-grid.scroll { max-height: 440px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .flip-card, .pick.offering { transition: none; }
    .pick.gone { transform: none; }
    .pick.shuffling, .flip-scene.shuffling .flip-card { animation: none; }
    .rays { display: none; }
  }
</style>
