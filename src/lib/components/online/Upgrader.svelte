<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { cardCoinValue, cardLabel } from '$lib/game/online/card-value';
  import { collectionCoachById, collectionCoaches, collectionPlayerById, collectionPlayers } from '$lib/game/online/collection-pool';
  import { RARITIES, UPGRADER_MAX_STAKE, rarityOf, upgradeChance, type Rarity } from '$lib/game/online/collection-rules';
  import { upgradeCards, type UpgradeOutcome } from '$lib/game/online/collection';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { confirmDialog } from '$lib/game/ui/dialog';
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
  // Spin: whole turns, then a slow creep across the arc border (the near miss), about 4.5 s in all.
  const MAIN_MS = 3400;
  const HOLD_MS = 150;
  const CREEP_MS = 1000;

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
  $: resultCard = settled && outcome ? cardOf(outcome.won ? outcome.target : outcome.returned ?? '') : null;
  $: spinning = phase === 'spinning';

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
  const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

  /**
   * Where the main spin stops before the creep: just across the arc border nearest to the roll, on the wrong side. A win
   * waits just outside the arc and slides in; a loss waits just inside and slides out. Always ends exactly on the roll.
   */
  function teaseOf(rollDeg: number, edgeDeg: number, won: boolean): number {
    const inside = Math.max(0.5, Math.min(8, edgeDeg / 2));
    const outside = Math.max(0.5, Math.min(8, (360 - edgeDeg) / 2));
    if (won) return rollDeg <= edgeDeg - rollDeg ? -outside : edgeDeg + outside;
    return rollDeg - edgeDeg <= 360 - rollDeg ? edgeDeg - inside : 360 + inside;
  }

  function spin(result: UpgradeOutcome): Promise<void> {
    const rollDeg = result.roll * 360;
    const start = ((angle % 360) + 360) % 360;
    if (reducedMotion) { setNeedle(rollDeg); return Promise.resolve(); }
    // 4 or 5 whole turns plus the way from the start to the roll: 4 to 6 turns in all.
    const turns = 4 + Math.floor(Math.random() * 2);
    const base = 360 * turns + (rollDeg < start ? 360 : 0);
    const tease = base + teaseOf(rollDeg, result.chance * 360, result.won);
    const final = base + rollDeg;
    const edgeDeg = result.chance * 360;
    setNeedle(start);
    return new Promise((resolve) => {
      const began = performance.now();
      const step = (now: number) => {
        const elapsed = now - began;
        let current: number;
        if (elapsed < MAIN_MS) current = start + (tease - start) * easeOutQuart(elapsed / MAIN_MS);
        else if (elapsed < MAIN_MS + HOLD_MS) current = tease;
        else current = tease + (final - tease) * easeInOutSine(Math.min(1, (elapsed - MAIN_MS - HOLD_MS) / CREEP_MS));
        setNeedle(current);
        const at = ((current % 360) + 360) % 360;
        wheel?.classList.toggle('inside', at < edgeDeg);
        if (elapsed < MAIN_MS + HOLD_MS + CREEP_MS) frame = requestAnimationFrame(step);
        else { setNeedle(final); resolve(); }
      };
      frame = requestAnimationFrame(step);
    });
  }

  async function go() {
    if (busy || spinning || !target || !stake.length) return;
    const confirmed = await confirmDialog({ title: t('upgraderGo'), body: t('upgraderConfirm'), confirmLabel: t('upgraderGo'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!confirmed) return;
    busy = true; error = '';
    const staked = [...stake];
    const aimed = target;
    try {
      const result = await upgradeCards(serverUrl, staked, aimed);
      round = { stake: staked, target: aimed };
      outcome = result;
      stake = []; target = '';
      phase = 'spinning';
      await spin(result);
      phase = 'done';
      onDone();
    } catch (caught) {
      phase = 'idle';
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { busy = false; }
  }

  onMount(() => {
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

  <div class="board">
    <div class="column stake-col">
      <div class="col-head">
        <span class="label">{t('upgraderStake')}</span>
        <strong class="count">{shownStake.length}/{UPGRADER_MAX_STAKE} · {fmt(shownStakeValue)} <small>coins</small></strong>
      </div>
      {#if shownStake.length}
        <div class="mini-grid staked">
          {#each shownStake as card (card.id)}
            <div class="pick picked" class:vanish={settled} class:returned={settled && outcome && !outcome.won && outcome.returned === card.id}>
              <span class="value-tag"><i></i>{fmt(card.value)}</span>
              {#if card.coach}
                <CoachCard coach={card.coach} teamName={coachTeam(card.coach)}>{#if !round}<button class="ghost small" type="button" on:click={() => toggleStake(card.id)}>{t('upgraderUnpick')}</button>{/if}</CoachCard>
              {:else if card.player}
                <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}>{#if !round}<button class="ghost small" type="button" on:click={() => toggleStake(card.id)}>{t('upgraderUnpick')}</button>{/if}</CollectionCard>
              {/if}
              {#if settled && outcome && !outcome.won && outcome.returned === card.id}<b class="back-tag">{t('upgraderReturned')}</b>{/if}
            </div>
          {/each}
        </div>
      {:else}
        <span class="empty">{t('upgraderEmpty')}</span>
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
    </div>

    <div class="column wheel-col">
      <div class="dial" bind:this={wheel} class:spinning class:won={settled && outcome?.won} class:lost={settled && outcome && !outcome.won}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${pct(shownChance)} ${t('chance')}`}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} class="track" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS} class="arc" stroke-dasharray={`${shownChance * CIRCUMFERENCE} ${CIRCUMFERENCE}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 26} class="inner" />
          <text x={CENTER} y={CENTER + 4} class="pct">{pct(shownChance)}</text>
          <text x={CENTER} y={CENTER + 30} class="lbl">{t('chance')}</text>
        </svg>
        <div class="needle" bind:this={needle} aria-hidden="true"><i></i></div>
        <div class="flash" aria-hidden="true"></div>
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
    </div>

    <div class="column target-col">
      <div class="col-head">
        <span class="label">{t('upgraderTarget')}</span>
        {#if shownTarget}<strong class="count">{fmt(shownTarget.value)} <small>coins</small></strong>{/if}
      </div>
      {#if shownTarget}
        <div class="pick aimed target-card" class:glow={settled && outcome?.won} class:missed={settled && outcome && !outcome.won}>
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
    </div>
  </div>
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
  .pick.vanish.returned { opacity: 1; transform: none; filter: none; outline-color: #ffd36b; box-shadow: 0 0 24px color-mix(in srgb, #ffd36b 45%, transparent); }
  .back-tag { position: absolute; left: 50%; bottom: 44px; z-index: 2; transform: translateX(-50%); padding: 4px 8px; background: #ffd36b; color: #0a0d08; font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .target-card { max-width: 240px; justify-self: center; width: 100%; }
  .target-card.glow { outline-color: var(--accent); animation: target-glow 1.6s ease-out both; }
  .target-card.missed { opacity: .45; filter: grayscale(.7); }
  @keyframes target-glow {
    0% { transform: scale(.9); box-shadow: 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); }
    35% { transform: scale(1.06); box-shadow: 0 0 60px color-mix(in srgb, var(--accent) 80%, transparent); }
    100% { transform: scale(1); box-shadow: 0 0 30px color-mix(in srgb, var(--accent) 45%, transparent); }
  }

  .wheel-col { position: sticky; top: 84px; justify-items: center; gap: 14px; background: var(--surface); }
  .dial { position: relative; width: min(100%, 340px); aspect-ratio: 1; }
  .dial svg { display: block; width: 100%; height: 100%; }
  .track { fill: none; stroke: var(--line); stroke-width: 22; }
  .arc { fill: none; stroke: var(--accent); stroke-width: 22; stroke-linecap: butt; transition: stroke-dasharray .3s ease-out, stroke-width .3s ease, filter .3s ease; }
  .inner { fill: var(--surface-2); }
  .pct { fill: var(--text); font: 900 40px 'Arial Narrow', Impact, sans-serif; text-anchor: middle; font-variant-numeric: tabular-nums; }
  .lbl { fill: var(--muted); font-size: 12px; font-weight: 800; text-anchor: middle; text-transform: uppercase; letter-spacing: .1em; }
  .needle { position: absolute; inset: 0; pointer-events: none; will-change: transform; }
  .needle i { position: absolute; top: 0; left: 50%; width: 0; height: 0; margin-left: -11px; border-left: 11px solid transparent; border-right: 11px solid transparent; border-top: 30px solid var(--text); filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .5)); }
  .needle::after { content: ''; position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--text); }
  .flash { position: absolute; inset: -6%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--danger) 55%, transparent), transparent 70%); opacity: 0; pointer-events: none; }
  .dial.spinning { animation: dial-pulse .6s ease-in-out infinite; }
  .dial.spinning .arc { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 50%, transparent)); }
  .dial:global(.inside) .needle i { border-top-color: var(--accent); }
  .dial.won .arc { stroke-width: 30; animation: arc-burst 1.4s ease-out both; }
  .dial.won .needle i { border-top-color: var(--accent); }
  .dial.lost { animation: dial-shake .42s cubic-bezier(.36, .07, .19, .97) both; }
  .dial.lost .needle i { border-top-color: var(--danger); }
  .dial.lost .flash { animation: red-flash .7s ease-out both; }
  @keyframes dial-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025); } }
  @keyframes arc-burst {
    0% { filter: drop-shadow(0 0 0 var(--accent)); }
    30% { filter: drop-shadow(0 0 28px var(--accent)) brightness(1.6); }
    100% { filter: drop-shadow(0 0 10px var(--accent)); }
  }
  @keyframes dial-shake {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-7px); }
    40%, 60% { transform: translateX(7px); }
  }
  @keyframes red-flash { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
  .result { margin: 0; width: 100%; box-sizing: border-box; min-height: 3.2em; padding: 8px 10px; border-left: 3px solid var(--line); background: var(--surface-2); color: var(--muted); font-size: .76rem; line-height: 1.45; }
  .dial.lost + .result { border-left-color: var(--danger); color: #ff9b90; }
  .result.won { border-left-color: var(--accent); color: var(--accent); }
  .go { width: 100%; min-height: 54px; border-radius: 0; }

  .filters { display: grid; gap: 8px; }
  .rarity-filter { display: flex; flex-wrap: wrap; gap: 4px; }
  .rarity-filter button { min-height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--muted); font: inherit; font-size: .58rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .rarity-filter button.active { border-color: var(--accent); color: var(--accent); }
  .filters input { min-height: 42px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: inherit; }

  @media (max-width: 980px) {
    .board { grid-template-columns: 1fr; }
    .wheel-col { position: static; }
    .mini-grid.scroll { max-height: 440px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .arc, .pick { transition: none; }
    .dial.spinning, .dial.won .arc, .dial.lost, .dial.lost .flash, .target-card.glow { animation: none; }
    .target-card.glow { box-shadow: 0 0 30px color-mix(in srgb, var(--accent) 45%, transparent); }
  }
</style>
