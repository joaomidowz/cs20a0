<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { cardCoinValue, cardLabel } from '$lib/game/online/card-value';
  import { collectionCoachById, collectionCoaches, collectionPlayerById, collectionPlayers } from '$lib/game/online/collection-pool';
  import { RARITIES, UPGRADER_MAX_STAKE, rarityOf, upgradeChance, type Rarity } from '$lib/game/online/collection-rules';
  import { fetchUpgraderFair, upgradeCards, type UpgradeOutcome, type UpgraderFair } from '$lib/game/online/collection';
  import { FAIR_CLIENT_SEED_MAX, isValidClientSeed, rollDegrees, verifyFair } from '$lib/game/online/fair';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import type { Coach, Language, Player } from '$lib/game/types';
  import CollectionCard from './CollectionCard.svelte';
  import CoachCard from './CoachCard.svelte';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  /** Cards in the collection. */
  export let ownedIds: string[] = [];
  /** Cards on the saved team: they cannot be staked. */
  export let lockedIds: string[] = [];
  export let onDone: () => void = () => {};
  /** Team names, the same the collection grid shows. */
  export let playerTeam: (player: Player) => string = () => '';
  export let coachTeam: (coach: Coach) => string = () => '';
  /** Opens the big card (the page's CollectionCardSheet). */
  export let onOpen: (player: Player) => void = () => {};

  type Card = { id: string; value: number; rarity: Rarity; player: Player | null; coach: Coach | null };
  const cardOf = (id: string): Card | null => {
    const coach = collectionCoachById.get(id) ?? null;
    const player = coach ? null : collectionPlayerById.get(id) ?? null;
    if (!coach && !player) return null;
    return { id, value: cardCoinValue(id), rarity: rarityOf((coach ?? player)!), player, coach };
  };
  const ALL: Card[] = [...collectionPlayers.map((player) => player.id), ...collectionCoaches.map((coach) => coach.id)].map(cardOf).filter((card): card is Card => Boolean(card)).sort((a, b) => a.value - b.value);
  const TARGETS_SHOWN = 30;
  // Wheel geometry: the chance arc starts at the top and runs clockwise; the needle angle is measured the same way.
  const SIZE = 320;
  const RADIUS = 128;
  const CENTER = SIZE / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  // Spin: a roulette throw, 5 to 7 whole turns on one continuous ease-out curve, landing exactly on the roll.
  const SPIN_MS = 5000;
  /** Particles of the win burst: fixed spread, the same language as the pack reveal sparks. */
  const SPARKS = Array.from({ length: 18 }, (_, index) => ({ x: `${6 + ((index * 37) % 88)}%`, s: `${4 + (index % 4) * 2}px`, d: `${(index % 6) * 0.12}s` }));

  let stake: string[] = [];
  let target = '';
  let query = '';
  let targetRarity: Rarity | '' = '';
  let busy = false;
  let error = '';
  /** The server's answer: decided before the spin starts, the wheel only acts it out. */
  let outcome: UpgradeOutcome | null = null;
  /** The cards of the round being shown (the stake and target are cleared as soon as the server answers). */
  let round: { stake: string[]; target: string } | null = null;
  let phase: 'idle' | 'spinning' | 'done' = 'idle';
  let needle: HTMLDivElement | null = null;
  let wheel: HTMLDivElement | null = null;
  /** Needle angle, set straight on the element each frame (not through the template). */
  let angle = 0;
  let frame = 0;
  let reducedMotion = false;
  /** Provably fair: the commitment for the next spin, the client seed and the last round's check. */
  let fair: UpgraderFair | null = null;
  let clientSeed = '';
  /** The hash that was on screen before the last spin (what the revealed seed must hash to). */
  let committedHash = '';
  let verifyState: 'idle' | 'busy' | 'ok' | 'bad' = 'idle';
  /** The last round's revealed seeds: stays in the fair panel until the next spin (picking new cards does not clear it). */
  let revealed: UpgradeOutcome | null = null;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: locked = new Set(lockedIds);
  $: ownedSet = new Set(ownedIds);
  $: stakeable = ownedIds.filter((id) => !locked.has(id)).map(cardOf).filter((card): card is Card => Boolean(card)).sort((a, b) => b.value - a.value);
  $: stakeCards = stake.map(cardOf).filter((card): card is Card => Boolean(card));
  $: stakeValue = stakeCards.reduce((sum, card) => sum + card.value, 0);
  $: targetCard = target ? cardOf(target) : null;
  $: targetValue = targetCard?.value ?? 0;
  $: chance = target && stakeValue && targetValue > stakeValue ? upgradeChance(stakeValue, targetValue) : 0;
  $: needleText = query.trim().toLowerCase();
  $: targets = stakeValue
    ? ALL.filter((card) => card.value > stakeValue && !ownedSet.has(card.id) && (!targetRarity || card.rarity === targetRarity) && (!needleText || cardLabel(card.id).toLowerCase().includes(needleText))).slice(0, TARGETS_SHOWN)
    : [];
  $: if (!round && target && (ownedSet.has(target) || cardCoinValue(target) <= stakeValue)) target = '';
  // While a round is on screen the stage shows its cards; picking anything new clears it.
  $: shownStake = round ? round.stake.map(cardOf).filter((card): card is Card => Boolean(card)) : stakeCards;
  $: shownTarget = round ? cardOf(round.target) : targetCard;
  $: shownStakeValue = shownStake.reduce((sum, card) => sum + card.value, 0);
  $: shownChance = outcome ? outcome.chance : chance;
  $: settled = phase === 'done' && outcome;
  $: resultCard = settled && outcome ? cardOf(outcome.won ? outcome.target : outcome.consolation ?? '') : null;
  $: spinning = phase === 'spinning';
  $: resultRarity = resultCard?.rarity ?? 'common';
  $: seedOk = isValidClientSeed(clientSeed);
  $: u = (key: Parameters<typeof uiCopy>[1]) => uiCopy(language, key);
  /** Phones (≤720px) walk the three columns one at a time: cards to stake, target, then review and spin. Desktop shows all three. */
  let step: 1 | 2 | 3 = 1;
  $: if (!round && step > 1 && !stake.length) step = 1;
  $: if (!round && step > 2 && !target) step = 2;
  $: canStep = (value: 1 | 2 | 3) => value === 1 || Boolean(round) || (value === 2 ? stake.length > 0 : stake.length > 0 && Boolean(target));
  const goStep = (value: 1 | 2 | 3) => { if (spinning || !canStep(value)) return; if (round && value < 3) clearRound(); step = value; if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const fmt = (value: number) => value.toLocaleString(language);
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const clearRound = () => { if (phase === 'spinning') return; round = null; outcome = null; phase = 'idle'; wheel?.classList.remove('inside'); };
  const toggleStake = (id: string) => {
    if (spinning) return;
    clearRound();
    stake = stake.includes(id) ? stake.filter((item) => item !== id) : stake.length < UPGRADER_MAX_STAKE ? [...stake, id] : stake;
  };
  const aim = (id: string) => { if (spinning) return; clearRound(); target = target === id ? '' : id; };

  const setNeedle = (degrees: number) => {
    angle = degrees;
    if (needle) needle.style.transform = `rotate(${degrees}deg)`;
  };
  const easeOutQuart = (x: number) => 1 - (1 - x) ** 4;
  const randomClientSeed = () => [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  /**
   * Roulette spin: from where the needle rests, straight to turns × 360 + roll × 360 on one ease-out curve. No stop, no
   * reversal, no correction at the end: the last frame is the exact angle of the draw.
   */
  function spin(result: UpgradeOutcome): Promise<void> {
    const rollDeg = rollDegrees(result.roll);
    const edgeDeg = result.chance * 360;
    const start = ((angle % 360) + 360) % 360;
    const final = 360 * (5 + Math.floor(Math.random() * 3)) + rollDeg;
    if (reducedMotion) { setNeedle(rollDeg); wheel?.classList.toggle('inside', rollDeg < edgeDeg); return Promise.resolve(); }
    setNeedle(start);
    return new Promise((resolve) => {
      const began = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - began) / SPIN_MS);
        const current = progress < 1 ? start + (final - start) * easeOutQuart(progress) : final;
        setNeedle(current);
        wheel?.classList.toggle('inside', ((current % 360) + 360) % 360 < edgeDeg);
        if (progress < 1) frame = requestAnimationFrame(step);
        else resolve();
      };
      frame = requestAnimationFrame(step);
    });
  }

  async function loadFair() {
    try { fair = await fetchUpgraderFair(serverUrl); } catch { fair = null; }
  }

  async function verify() {
    if (!revealed || verifyState === 'busy') return;
    verifyState = 'busy';
    try { verifyState = await verifyFair(revealed, committedHash) ? 'ok' : 'bad'; } catch { verifyState = 'bad'; }
  }

  async function go() {
    if (busy || spinning || !target || !stake.length) return;
    if (!seedOk) { error = t('fairBadSeed'); return; }
    const confirmed = await confirmDialog({ title: t('upgraderGo'), body: t('upgraderConfirm'), confirmLabel: t('upgraderGo'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!confirmed) return;
    busy = true; error = '';
    const staked = [...stake];
    const aimed = target;
    try {
      const result = await upgradeCards(serverUrl, staked, aimed, clientSeed);
      committedHash = fair?.serverSeedHash ?? result.serverSeedHash;
      verifyState = 'idle';
      revealed = null;
      round = { stake: staked, target: aimed };
      outcome = result;
      fair = result.next;
      stake = []; target = '';
      phase = 'spinning';
      await spin(result);
      phase = 'done';
      revealed = result;
      onDone();
    } catch (caught) {
      phase = 'idle';
      void loadFair();
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { busy = false; }
  }

  onMount(() => {
    clientSeed = randomClientSeed();
    void loadFair();
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = query.matches;
    const update = () => reducedMotion = query.matches;
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });
  onDestroy(() => { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame); });
</script>

<section class="upgrader" aria-label={t('upgrader')}>
  {#if error}<p class="upgrader-error" role="alert">{error}</p>{/if}

  <nav class="steps" aria-label={t('upgrader')}>
    {#each [[1, 'chooseStake'], [2, 'chooseTarget'], [3, 'reviewUpgrade']] as [value, key]}
      <button type="button" aria-current={step === value ? 'step' : undefined} disabled={spinning || !canStep(value as 1 | 2 | 3)} on:click={() => goStep(value as 1 | 2 | 3)}><b>{value}</b>{u(key as 'chooseStake')}</button>
    {/each}
  </nav>

  <div class="board step-{step}">
    <div class="column stake-col">
      <div class="col-head">
        <span class="label">{t('upgraderStake')}</span>
        <strong class="count">{shownStake.length}/{UPGRADER_MAX_STAKE} · {fmt(shownStakeValue)} <small>coins</small></strong>
      </div>
      {#if shownStake.length}
        <div class="mini-grid staked">
          {#each shownStake as card (card.id)}
            <div class="pick picked" class:vanish={settled}>
              <span class="value-tag"><i></i>{fmt(card.value)}</span>
              {#if card.coach}
                <CoachCard coach={card.coach} teamName={coachTeam(card.coach)}>{#if !round}<button class="ghost small" type="button" on:click={() => toggleStake(card.id)}>{t('upgraderUnpick')}</button>{/if}</CoachCard>
              {:else if card.player}
                <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}>{#if !round}<button class="ghost small" type="button" on:click={() => toggleStake(card.id)}>{t('upgraderUnpick')}</button>{/if}</CollectionCard>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <span class="empty">{t('upgraderEmpty')}</span>
      {/if}
      {#if settled && outcome && !outcome.won && resultCard}
        <!-- Loss: every staked card is gone; the downgraded consolation card comes in their place. -->
        <div class="consolation" role="status">
          <div class="mini-grid">
            <div class="pick returned">
              <span class="value-tag"><i></i>{fmt(resultCard.value)}</span>
              {#if resultCard.coach}
                <CoachCard coach={resultCard.coach} teamName={coachTeam(resultCard.coach)} />
              {:else if resultCard.player}
                <CollectionCard player={resultCard.player} teamName={playerTeam(resultCard.player)} {language} compact {onOpen} />
              {/if}
              <b class="back-tag">{t('upgraderDowngraded')}</b>
            </div>
          </div>
          <p class="note">{t('upgraderAllLost')}{#if outcome.duplicate} <b class="dupe">{t('upgraderDuplicate')} {fmt(outcome.duplicateCoins)} coins.</b>{/if}</p>
        </div>
      {/if}

      <h3 class="subhead">{t('upgraderYourCards').toUpperCase()} <small>{stakeable.length}</small></h3>
      <div class="mini-grid scroll">
        {#each stakeable as card (card.id)}
          {@const picked = stake.includes(card.id)}
          <div class="pick" class:picked>
            <span class="value-tag"><i></i>{fmt(card.value)}</span>
            {#if card.coach}
              <CoachCard coach={card.coach} teamName={coachTeam(card.coach)} active={picked}>
                <button class={picked ? 'secondary small' : 'ghost small'} type="button" disabled={spinning || (!picked && stake.length >= UPGRADER_MAX_STAKE)} on:click={() => toggleStake(card.id)}>{picked ? t('upgraderUnpick') : t('upgraderPick')}</button>
              </CoachCard>
            {:else if card.player}
              <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}>
                <button class={picked ? 'secondary small' : 'ghost small'} type="button" disabled={spinning || (!picked && stake.length >= UPGRADER_MAX_STAKE)} on:click={() => toggleStake(card.id)}>{picked ? t('upgraderUnpick') : t('upgraderPick')}</button>
              </CollectionCard>
            {/if}
          </div>
        {/each}
      </div>
      <button type="button" class="primary step-next" disabled={!stake.length || spinning} on:click={() => goStep(2)}>{u('next')} · {u('chooseTarget')}</button>
    </div>

    <div class="column wheel-col">
      {#if !round && stakeCards.length && targetCard}
        <p class="review-line"><span>{stakeCards.length} · {fmt(stakeValue)} coins</span> → <b>{cardLabel(targetCard.id)}</b></p>
      {/if}
      <div class="dial fx-{resultRarity}" bind:this={wheel} class:spinning class:won={settled && outcome?.won} class:lost={settled && outcome && !outcome.won}>
        {#if settled && outcome?.won}
          <div class="rays" aria-hidden="true"></div>
          <div class="ring" aria-hidden="true"></div>
          <div class="sparks" aria-hidden="true">{#each SPARKS as spark}<i style="--x: {spark.x}; --s: {spark.s}; --d: {spark.d}"></i>{/each}</div>
        {/if}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${pct(shownChance)} ${t('chance')}`}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} class="track" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS} class="arc" stroke-dasharray={`${shownChance * CIRCUMFERENCE} ${CIRCUMFERENCE}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 26} class="inner" />
          <text x={CENTER} y={CENTER + 4} class="pct">{pct(shownChance)}</text>
          <text x={CENTER} y={CENTER + 30} class="lbl">{t('chance')}</text>
        </svg>
        <div class="needle" bind:this={needle} aria-hidden="true"><i></i></div>
        {#if settled && outcome}<div class="flash" class:win={outcome.won} aria-hidden="true"></div>{/if}
      </div>
      <p class="result" class:won={settled && outcome?.won} role="status" aria-live="polite">
        {#if settled && outcome}
          {outcome.won ? t('upgraderWon') : t('upgraderLost')} {#if resultCard}<b>{cardLabel(resultCard.id)}</b>{/if}
        {:else if spinning}
          {t('upgraderSpinning')}
        {:else}
          {t('upgraderHint')}
        {/if}
      </p>
      <button type="button" class="primary go" disabled={busy || spinning || !target || !stake.length} on:click={go}>{spinning ? t('upgraderSpinning') : t('upgraderGo')}</button>
      {#if settled}<button type="button" class="secondary step-next" on:click={() => goStep(1)}>{u('chooseStake')}</button>
      {:else}<button type="button" class="secondary step-next" disabled={spinning} on:click={() => goStep(2)}>← {u('back')}</button>{/if}
    </div>

    <div class="column target-col">
      <div class="col-head">
        <span class="label">{t('upgraderTarget')}</span>
        {#if shownTarget}<strong class="count">{fmt(shownTarget.value)} <small>coins</small></strong>{/if}
      </div>
      {#if shownTarget}
        <div class="pick aimed target-card fx-{resultRarity}" class:glow={settled && outcome?.won} class:missed={settled && outcome && !outcome.won}>
          <span class="value-tag"><i></i>{fmt(shownTarget.value)}</span>
          {#if shownTarget.coach}
            <CoachCard coach={shownTarget.coach} teamName={coachTeam(shownTarget.coach)} active>{#if !round}<button class="ghost small" type="button" on:click={() => shownTarget && aim(shownTarget.id)}>{t('upgraderUnpick')}</button>{/if}</CoachCard>
          {:else if shownTarget.player}
            <CollectionCard player={shownTarget.player} teamName={playerTeam(shownTarget.player)} {language} compact {onOpen}>{#if !round}<button class="ghost small" type="button" on:click={() => shownTarget && aim(shownTarget.id)}>{t('upgraderUnpick')}</button>{/if}</CollectionCard>
          {/if}
        </div>
      {:else}
        <span class="empty">{t('upgraderNoTargets')}</span>
      {/if}

      <h3 class="subhead">{t('upgraderTargets').toUpperCase()} <small>{targets.length}</small></h3>
      <div class="filters">
        <div class="rarity-filter">
          <button type="button" class:active={!targetRarity} on:click={() => targetRarity = ''}>{t('all')}</button>
          {#each RARITIES as rarity}<button type="button" class:active={targetRarity === rarity} on:click={() => targetRarity = rarity}>{rarity}</button>{/each}
        </div>
        <input type="search" placeholder={t('upgraderSearch')} bind:value={query} disabled={!stakeValue} />
      </div>
      {#if !stakeValue}<p class="note">{t('upgraderNoTargets')}</p>{/if}
      <div class="mini-grid scroll">
        {#each targets as card (card.id)}
          {@const aimed = target === card.id}
          <div class="pick" class:aimed>
            <span class="value-tag"><i></i>{fmt(card.value)}</span>
            {#if card.coach}
              <CoachCard coach={card.coach} teamName={coachTeam(card.coach)} active={aimed}>
                <button class={aimed ? 'secondary small' : 'ghost small'} type="button" disabled={spinning} on:click={() => aim(card.id)}>{aimed ? t('upgraderAimed') : t('upgraderAim')} · {pct(upgradeChance(stakeValue, card.value))}</button>
              </CoachCard>
            {:else if card.player}
              <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}>
                <button class={aimed ? 'secondary small' : 'ghost small'} type="button" disabled={spinning} on:click={() => aim(card.id)}>{aimed ? t('upgraderAimed') : t('upgraderAim')} · {pct(upgradeChance(stakeValue, card.value))}</button>
              </CollectionCard>
            {/if}
          </div>
        {/each}
      </div>
      <div class="step-actions">
        <button type="button" class="secondary step-next" on:click={() => goStep(1)}>← {u('back')}</button>
        <button type="button" class="primary step-next" disabled={!target || !stake.length || spinning} on:click={() => goStep(3)}>{u('next')} · {u('reviewUpgrade')}</button>
      </div>
    </div>
  </div>

  <section class="fair" aria-labelledby="fair-title">
    <div class="fair-head">
      <div class="fair-title-row">
        <h3 id="fair-title">{t('fairTitle')}</h3>
        <a class="faq-link" href="#faq-title">{t('faqLink')}</a>
      </div>
      <p>{t('fairIntro')}</p>
    </div>
    <dl class="fair-grid">
      <div class="wide"><dt>{t('fairServerHash')}</dt><dd><code>{fair?.serverSeedHash ?? '…'}</code></dd></div>
      <div class="wide">
        <dt><label for="client-seed">{t('fairClientSeed')}</label></dt>
        <dd class="seed-row">
          <input id="client-seed" type="text" bind:value={clientSeed} maxlength={FAIR_CLIENT_SEED_MAX} spellcheck="false" autocomplete="off" disabled={spinning} aria-invalid={!seedOk} aria-describedby="client-seed-hint" />
          <button type="button" class="ghost small" disabled={spinning} on:click={() => clientSeed = randomClientSeed()}>{t('fairNewClientSeed')}</button>
        </dd>
        <small id="client-seed-hint" class:bad={!seedOk}>{seedOk ? t('fairClientSeedHint') : t('fairBadSeed')}</small>
      </div>
      <div><dt>{t('fairNonce')}</dt><dd><code>{fair?.nonce ?? '…'}</code></dd></div>
    </dl>
    <div class="fair-reveal">
      {#if revealed}
        <dl class="fair-grid">
          <div class="wide"><dt>{t('fairServerSeed')}</dt><dd><code>{revealed.serverSeed}</code></dd></div>
          <div class="wide"><dt>{t('fairServerHash')}</dt><dd><code>{committedHash}</code></dd></div>
          <div><dt>{t('fairClientSeed')}</dt><dd><code>{revealed.clientSeed}</code></dd></div>
          <div><dt>{t('fairNonce')}</dt><dd><code>{revealed.nonce}</code></dd></div>
          <div><dt>{t('fairRoll')}</dt><dd><code>{revealed.roll}</code></dd></div>
          <div><dt>{t('fairResult')}</dt><dd class:win={revealed.won} class:loss={!revealed.won}>{revealed.won ? t('fairWin') : t('fairLoss')} · {pct(revealed.roll)} {revealed.won ? '<' : '≥'} {pct(revealed.chance)}</dd></div>
          {#if !revealed.won && revealed.consolation}<div class="wide"><dt>{t('fairConsolation')}</dt><dd>{cardLabel(revealed.consolation)} · {revealed.consolationKind === 'value' ? t('fairConsolationValue') : t('fairConsolationCommon')}</dd></div>{/if}
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
  .upgrader { display: grid; gap: 16px; }
  .upgrader-error { margin: 0; padding: 10px 12px; border: 1px solid var(--danger); color: #ff9b90; font-size: .78rem; }
  .board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px) minmax(0, 1fr); gap: 18px; align-items: start; }
  .column { display: grid; gap: 12px; align-content: start; min-width: 0; padding: 16px; border: 1px solid var(--line); background: var(--surface-2); }
  .col-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; justify-content: space-between; }
  .label { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .count { color: var(--accent); font: 900 1.2rem/1 'Arial Narrow', Impact, sans-serif; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .count small { color: var(--muted); font: 700 .6rem Inter, Arial, sans-serif; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .subhead { margin: 8px 0 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: .7rem; letter-spacing: .14em; } .subhead small { color: var(--accent); }
  .empty { display: grid; place-items: center; min-height: 160px; padding: 12px; border: 1px dashed var(--line); color: var(--muted); font-size: .76rem; text-align: center; }
  .mini-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .mini-grid.scroll { max-height: 620px; overflow-y: auto; padding: 4px 4px 4px 0; }
  .pick { position: relative; min-width: 0; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color .18s ease, opacity .5s ease, transform .5s ease, filter .5s ease; }
  .pick.picked, .pick.aimed { outline-color: var(--accent); }
  .pick :global(.small) { width: 100%; min-height: 36px; padding: 0 8px; border-radius: 0; font-size: .6rem; }
  .value-tag { position: absolute; top: 6px; right: 6px; z-index: 2; display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 88%, transparent); font-size: .62rem; font-weight: 800; font-variant-numeric: tabular-nums; pointer-events: none; }
  .value-tag i { width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a8, #d9a441 60%, #8a5d10); }
  .pick.vanish { opacity: 0; transform: scale(.85); filter: grayscale(1); }
  .consolation { display: grid; gap: 8px; }
  .consolation .mini-grid { grid-template-columns: minmax(150px, 190px); }
  .consolation .dupe { color: #ffd36b; }
  .consolation .back-tag { bottom: 10px; }
  .pick.returned { outline-color: #ffd36b; box-shadow: 0 0 24px color-mix(in srgb, #ffd36b 45%, transparent); animation: returned-pulse 1.4s .2s ease-out both; }
  @keyframes returned-pulse {
    0% { transform: scale(.92); box-shadow: 0 0 0 transparent; }
    40% { transform: scale(1.04); box-shadow: 0 0 40px color-mix(in srgb, #ffd36b 75%, transparent), 0 0 0 6px color-mix(in srgb, #ffd36b 35%, transparent); }
    100% { transform: none; box-shadow: 0 0 24px color-mix(in srgb, #ffd36b 45%, transparent); }
  }
  .back-tag { position: absolute; left: 50%; bottom: 44px; z-index: 2; transform: translateX(-50%); padding: 4px 8px; background: #ffd36b; color: #0a0d08; font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .target-card { max-width: 240px; justify-self: center; width: 100%; }
  .target-card.glow { outline-color: var(--fx); animation: target-glow 1.6s ease-out both; }
  .target-card.missed { opacity: .45; filter: grayscale(.7); transition-delay: .35s; }
  @keyframes target-glow {
    0% { transform: scale(.9); box-shadow: 0 0 0 transparent; }
    35% { transform: scale(1.07); box-shadow: 0 0 70px var(--fx), 0 0 120px color-mix(in srgb, var(--fx) 45%, transparent); }
    100% { transform: scale(1); box-shadow: 0 0 34px color-mix(in srgb, var(--fx) 65%, transparent); }
  }

  .wheel-col { position: sticky; top: 150px; justify-items: center; gap: 14px; background: var(--surface); overflow: hidden; }
  /* Rarity colors, the same as the pack reveal: the win burst and the target glow take the won card's. */
  .dial, .target-card { --fx: #8d979e; }
  .fx-rare { --fx: #4da3ff; } .fx-elite { --fx: #a66bff; } .fx-superstar { --fx: #ff8a3d; } .fx-legend { --fx: #ffc94d; } .fx-goat { --fx: #ff5ad8; }
  .dial { position: relative; width: min(100%, 340px); aspect-ratio: 1; }
  .dial svg { position: relative; z-index: 1; display: block; width: 100%; height: 100%; }
  .track { fill: none; stroke: var(--line); stroke-width: 22; }
  .arc { fill: none; stroke: var(--accent); stroke-width: 22; stroke-linecap: butt; transition: stroke-dasharray .3s ease-out, stroke-width .3s ease, filter .3s ease; }
  .inner { fill: var(--surface-2); }
  .pct { fill: var(--text); font: 900 40px 'Arial Narrow', Impact, sans-serif; text-anchor: middle; font-variant-numeric: tabular-nums; }
  .lbl { fill: var(--muted); font-size: 12px; font-weight: 800; text-anchor: middle; text-transform: uppercase; letter-spacing: .1em; }
  /* The pointer is the red triangle on the rim; no center pivot, so the percentage stays readable. */
  .needle { position: absolute; inset: 0; z-index: 2; pointer-events: none; will-change: transform; }
  .needle i { position: absolute; top: 0; left: 50%; width: 0; height: 0; margin-left: -11px; border-left: 11px solid transparent; border-right: 11px solid transparent; border-top: 30px solid #ff3b3b; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .5)); transition: border-top-color .15s ease; }
  .dial.spinning .arc { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 50%, transparent)); }
  .dial:global(.inside) .needle i { border-top-color: var(--accent); }

  /* Win: burst of light on the arc (rays, ring, sparks, flash), in the won card's rarity color. */
  .rays { position: absolute; left: 50%; top: 50%; z-index: 0; width: 170%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--fx) 42%, transparent) 0 7deg, transparent 7deg 20deg); mask-image: radial-gradient(closest-side, #000 25%, transparent 72%); animation: rays-spin 14s linear infinite, fadein .8s ease-out; pointer-events: none; }
  .ring { position: absolute; inset: 8%; z-index: 3; border: 3px solid var(--fx); border-radius: 50%; animation: ring 1s ease-out forwards; pointer-events: none; }
  .sparks { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .sparks i { position: absolute; bottom: 12%; left: var(--x); width: var(--s); height: var(--s); border-radius: 50%; background: var(--fx); box-shadow: 0 0 8px var(--fx); opacity: 0; animation: spark 1.9s var(--d) ease-out infinite; }
  .flash { position: absolute; inset: -8%; z-index: 4; border-radius: 50%; pointer-events: none; }
  .flash.win { background: radial-gradient(circle, color-mix(in srgb, #fff 70%, var(--fx)) 0%, color-mix(in srgb, var(--fx) 60%, transparent) 35%, transparent 70%); animation: flash 1s ease-out forwards; }
  .dial.won .arc { stroke: var(--fx); stroke-width: 30; animation: arc-burst 1.4s ease-out both; }
  .dial.won .needle i { border-top-color: var(--fx); }

  /* Loss: dark red pulse over the wheel while the arc's light goes out. */
  .flash:not(.win) { background: radial-gradient(circle, color-mix(in srgb, #8b0000 70%, transparent) 0%, color-mix(in srgb, #3a0000 55%, transparent) 45%, transparent 72%); animation: loss-pulse 1.6s ease-out forwards; }
  .dial.lost .arc { animation: arc-out 1.4s ease-out forwards; }
  .dial.lost .needle i { border-top-color: #b3121b; }
  .dial.lost .pct { fill: #ff6b6b; transition: fill .4s ease; }

  @keyframes arc-burst {
    0% { filter: drop-shadow(0 0 0 var(--fx)); }
    30% { filter: drop-shadow(0 0 28px var(--fx)) brightness(1.7); }
    100% { filter: drop-shadow(0 0 12px var(--fx)); }
  }
  @keyframes arc-out {
    0% { filter: drop-shadow(0 0 14px var(--accent)) brightness(1.2); }
    100% { filter: grayscale(.9) brightness(.45); }
  }
  @keyframes loss-pulse { 0% { opacity: 0; } 15% { opacity: 1; } 35% { opacity: .45; } 55% { opacity: .85; } 100% { opacity: .25; } }
  @keyframes rays-spin { to { rotate: 360deg; } }
  @keyframes fadein { from { opacity: 0; } }
  @keyframes ring { from { transform: scale(.6); opacity: .95; } to { transform: scale(1.5); opacity: 0; } }
  @keyframes spark { 0% { transform: translateY(0) scale(1); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-260px) scale(.2); opacity: 0; } }
  @keyframes flash { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
  .result { margin: 0; width: 100%; box-sizing: border-box; min-height: 3.2em; padding: 8px 10px; border-left: 3px solid var(--line); background: var(--surface-2); color: var(--muted); font-size: .76rem; line-height: 1.45; }
  .dial.lost + .result { border-left-color: var(--danger); color: #ff9b90; }
  .result.won { border-left-color: var(--accent); color: var(--accent); }
  .go { width: 100%; min-height: 54px; border-radius: 0; }

  .filters { display: grid; gap: 8px; }
  .rarity-filter { display: flex; flex-wrap: wrap; gap: 4px; }
  .rarity-filter button { min-height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--muted); font: inherit; font-size: .58rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .rarity-filter button.active { border-color: var(--accent); color: var(--accent); }
  .filters input { min-height: 42px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: inherit; }

  .steps, .step-next, .review-line { display: none; }
  .step-actions { display: contents; }
  @media (max-width: 720px) {
    .steps { position: sticky; top: 118px; z-index: 5; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border: 1px solid var(--line); background: var(--surface); }
    .steps button { display: grid; justify-items: center; gap: 2px; min-height: 52px; padding: 4px; border: 1px solid transparent; border-radius: 0; background: transparent; color: var(--muted); font-size: .66rem; font-weight: 800; line-height: 1.2; }
    .steps button b { font: 900 1rem/1 'Arial Narrow', Impact, sans-serif; }
    .steps button[aria-current] { border-color: var(--accent); color: var(--accent); background: var(--surface-2); }
    .steps button:disabled { opacity: .45; }
    .board.step-1 .column:not(.stake-col), .board.step-2 .column:not(.target-col), .board.step-3 .column:not(.wheel-col) { display: none; }
    .step-next { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; border-radius: 0; }
    .step-actions { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; }
    .review-line { display: flex; flex-wrap: wrap; gap: 4px 8px; justify-content: center; margin: 0; font-size: .8rem; text-align: center; }
    .review-line span { color: var(--muted); } .review-line b { color: var(--accent); }
    .board .mini-grid.scroll { max-height: none; overflow: visible; }
  }
  @media (max-width: 980px) {
    .board { grid-template-columns: 1fr; }
    .wheel-col { position: static; }
    .mini-grid.scroll { max-height: 440px; }
  }
  .fair { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--line); background: var(--surface-2); }
  .fair-title-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .faq-link { display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font-size: .62rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; }
  .faq-link:hover, .faq-link:focus-visible { border-color: var(--accent); color: var(--accent); }
  .fair-head h3 { margin: 0; font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  .fair-head p { margin: 0; color: var(--muted); font-size: .76rem; line-height: 1.5; }
  .fair-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px 16px; margin: 0; }
  .fair-grid > div { display: grid; gap: 4px; min-width: 0; }
  .fair-grid .wide { grid-column: 1 / -1; }
  .fair-grid dt { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .fair-grid dd { margin: 0; font-size: .78rem; overflow-wrap: anywhere; }
  .fair-grid dd.win { color: var(--accent); font-weight: 800; } .fair-grid dd.loss { color: #ff9b90; font-weight: 800; }
  .fair code { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: .74rem; overflow-wrap: anywhere; }
  .fair small { color: var(--muted); font-size: .66rem; } .fair small.bad { color: #ff9b90; }
  .seed-row { display: flex; gap: 8px; }
  .seed-row input { flex: 1; min-width: 0; min-height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: .78rem ui-monospace, Menlo, monospace; }
  .seed-row input[aria-invalid='true'] { border-color: var(--danger); }
  .seed-row :global(.small), .verify-row :global(.small) { min-height: 40px; padding: 0 12px; border-radius: 0; font-size: .62rem; }
  .fair-reveal { display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .verify-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .check { font-size: .76rem; font-weight: 800; } .check.ok { color: var(--accent); } .check.bad { color: #ff9b90; }

  @media (prefers-reduced-motion: reduce) {
    .arc, .pick, .needle i { transition: none; }
    .dial.won .arc, .dial.lost .arc, .flash, .target-card.glow, .pick.returned { animation: none; }
    .rays, .ring, .sparks, .flash.win { display: none; }
    .flash:not(.win) { opacity: .35; }
    .dial.won .arc { filter: drop-shadow(0 0 12px var(--fx)); }
    .dial.lost .arc { filter: grayscale(.9) brightness(.45); }
    .target-card.glow { box-shadow: 0 0 30px color-mix(in srgb, var(--fx) 55%, transparent); }
  }
</style>
