<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CoachCard from './CoachCard.svelte';
  import CollectionCard from './CollectionCard.svelte';
  import PackCase from './PackCase.svelte';
  import { RARITIES, rarityOf, type PackTier, type Rarity } from '$lib/game/online/collection-rules';
  import type { Coach, Language, Player } from '$lib/game/types';

  /**
   * Pack opening: the case shakes and opens, then the cards flip one by one, best card last. The better the card,
   * the bigger the moment: a ring for a Superstar, suspense + flash + rays + sparks for a Legend, and the whole panel
   * darkens and shakes for a GOAT.
   */
  type RevealCard = { kind: 'player'; player: Player } | { kind: 'coach'; coach: Coach };
  export let cards: RevealCard[];
  export let duplicates: Set<string>;
  export let tier: PackTier;
  export let caseLabel = '';
  export let language: Language;
  export let sound = true;
  export let labels: { fresh: string; duplicate: string; skip: string };
  export let playerTeam: (player: Player) => string;
  export let coachTeam: (coach: Coach) => string;
  export let onOpen: (player: Player) => void = () => {};
  export let onDone: () => void = () => {};

  const idOf = (card: RevealCard) => (card.kind === 'player' ? card.player.id : card.coach.id);
  const rarityOfCard = (card: RevealCard): Rarity => rarityOf(card.kind === 'player' ? card.player : card.coach);
  const rank = (card: RevealCard) => RARITIES.indexOf(rarityOfCard(card));
  // Best card last; the server's order only matters for what was drawn, not for how it is shown.
  const ordered = [...cards].sort((a, b) => rank(a) - rank(b));
  const SPARKS = Array.from({ length: 16 }, (_, index) => index);

  let stage: 'case' | 'cards' = 'case';
  let flipped = 0;
  let charging = -1;
  let flash: Rarity | null = null;
  let shaking = false;
  let finished = false;
  let timers: number[] = [];
  let audio: AudioContext | null = null;
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, reduced ? Math.min(ms, 120) : ms)); };

  function tone(rarity: Rarity) {
    if (!sound || !audio) return;
    try {
      const level = RARITIES.indexOf(rarity);
      const notes = level >= 5 ? [523, 659, 784, 1047] : level === 4 ? [523, 659, 784] : level === 3 ? [440, 587] : [330 + level * 40];
      const start = audio.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = audio!.createOscillator();
        const gain = audio!.createGain();
        oscillator.type = level >= 4 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + index * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.14, start + index * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.09 + (level >= 4 ? 0.5 : 0.22));
        oscillator.connect(gain).connect(audio!.destination);
        oscillator.start(start + index * 0.09);
        oscillator.stop(start + index * 0.09 + 0.6);
      });
    } catch { /* sound is a nicety */ }
  }

  function flipNext() {
    if (flipped >= ordered.length) { finish(); return; }
    const index = flipped;
    const rarity = rarityOfCard(ordered[index]);
    const big = rarity === 'legend' || rarity === 'goat';
    const doFlip = () => {
      charging = -1;
      flipped = index + 1;
      tone(rarity);
      if (big && !reduced) {
        flash = rarity;
        later(() => { flash = null; }, rarity === 'goat' ? 1500 : 1000);
        if (rarity === 'goat') { shaking = true; later(() => { shaking = false; }, 650); }
      }
      later(flipNext, big ? 1900 : rarity === 'superstar' ? 1200 : 750);
    };
    if (big) { charging = index; later(doFlip, rarity === 'goat' ? 1600 : 1100); } else doFlip();
  }

  function finish() {
    if (finished) return;
    finished = true;
    onDone();
  }

  function skip() {
    for (const timer of timers) window.clearTimeout(timer);
    timers = [];
    stage = 'cards'; charging = -1; flash = null; shaking = false;
    flipped = ordered.length;
    finish();
  }

  onMount(() => {
    try { audio = sound ? new AudioContext() : null; } catch { audio = null; }
    later(() => { stage = 'cards'; later(flipNext, 450); }, 1500);
  });
  onDestroy(() => { for (const timer of timers) window.clearTimeout(timer); void audio?.close().catch(() => {}); });
</script>

<div class="reveal-stage" class:shaking class:dark={flash === 'goat'}>
  {#if flash}<span class="flash {flash}" aria-hidden="true"></span>{/if}
  {#if stage === 'case'}
    <div class="case-stage"><PackCase {tier} size="lg" label={caseLabel} opening /></div>
  {:else}
    <div class="cards">
      {#each ordered as card, index (idOf(card) + index)}
        {@const rarity = rarityOfCard(card)}
        {@const up = index < flipped}
        <div class="slot fx-{rarity}" class:up class:charging={charging === index} style={`--delay:${index * 90}ms`}>
          {#if up && (rarity === 'legend' || rarity === 'goat')}
            <span class="rays" aria-hidden="true"></span>
            <span class="sparks" aria-hidden="true">{#each SPARKS as spark}<i style={`--x:${(spark * 53) % 100}%;--d:${(spark * 137) % 900}ms;--s:${4 + (spark % 4) * 2}px`}></i>{/each}</span>
            {#if rarity === 'goat'}<span class="goat-word" aria-hidden="true">GOAT</span>{/if}
          {/if}
          {#if up && rarity === 'superstar'}<span class="ring" aria-hidden="true"></span>{/if}
          <div class="flipper">
            <div class="face back"><span>CS</span><small>13A0</small></div>
            <div class="face front">
              {#if up}
                {#if card.kind === 'player'}
                  <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} tag={duplicates.has(card.player.id) ? labels.duplicate : labels.fresh} onOpen={onOpen} />
                {:else}
                  <CoachCard coach={card.coach} teamName={coachTeam(card.coach)} tag={duplicates.has(card.coach.id) ? labels.duplicate : labels.fresh} />
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if !finished}<button class="skip" type="button" on:click={skip}>{labels.skip}</button>{/if}
</div>

<style>
  .reveal-stage { position: relative; display: grid; gap: 16px; justify-items: center; padding: 22px 0 8px; border-top: 1px solid var(--line); overflow: hidden; transition: background .4s ease; --common: #8d979e; --rare: #4da3ff; --elite: #a66bff; --superstar: #ff8a3d; --legend: #ffc94d; --goat: #ff5ad8; }
  .reveal-stage.dark { background: radial-gradient(ellipse at center, #1a0716 0%, #050306 75%); }
  .shaking { animation: quake .6s linear; }
  .case-stage { display: grid; place-items: center; min-height: 300px; }
  .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 250px)); gap: 18px; justify-content: center; width: 100%; perspective: 1400px; }
  .slot { position: relative; min-width: 0; animation: rise .5s var(--delay) cubic-bezier(.16, 1, .3, 1) backwards; --fx: var(--common); }
  .fx-rare { --fx: var(--rare); } .fx-elite { --fx: var(--elite); } .fx-superstar { --fx: var(--superstar); } .fx-legend { --fx: var(--legend); } .fx-goat { --fx: var(--goat); }
  .flipper { position: relative; display: grid; transform-style: preserve-3d; transform: rotateY(180deg); transition: transform .7s cubic-bezier(.2, .8, .2, 1); }
  .fx-superstar .flipper { transition-duration: .95s; } .fx-legend .flipper, .fx-goat .flipper { transition-duration: 1.15s; }
  .up .flipper { transform: rotateY(0); }
  .face { grid-area: 1 / 1; backface-visibility: hidden; min-width: 0; }
  .front { display: grid; gap: 6px; }
  .back { display: grid; place-content: center; justify-items: center; min-height: 340px; transform: rotateY(180deg); border: 1px solid var(--line); background: repeating-linear-gradient(135deg, var(--surface-2) 0 12px, var(--surface) 12px 24px); }
  .back span { padding: 4px 8px; background: var(--accent); color: #0a0d08; font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; } .back small { margin-top: 6px; color: var(--muted); font: 900 1rem 'Arial Narrow', Impact, sans-serif; letter-spacing: .2em; }
  .up .back { visibility: hidden; transition: visibility 0s .4s; }
  /* edge glow once revealed, stronger with rarity */
  .up.fx-elite .front { filter: drop-shadow(0 0 10px color-mix(in srgb, var(--fx) 55%, transparent)); }
  .up.fx-superstar .front { filter: drop-shadow(0 0 16px color-mix(in srgb, var(--fx) 70%, transparent)); }
  .up.fx-legend .front { filter: drop-shadow(0 0 22px color-mix(in srgb, var(--fx) 80%, transparent)); animation: breathe 2.4s ease-in-out infinite; }
  .up.fx-goat .front { filter: drop-shadow(0 0 30px var(--fx)) drop-shadow(0 0 60px color-mix(in srgb, #ffd36b 50%, transparent)); animation: breathe 1.8s ease-in-out infinite; }
  /* suspense before a legend or GOAT */
  .charging { animation: tremble .12s linear infinite; }
  .charging .back { border-color: var(--fx); box-shadow: 0 0 34px var(--fx), inset 0 0 40px color-mix(in srgb, var(--fx) 40%, transparent); transition: box-shadow 1s ease-in; }
  .ring { position: absolute; inset: 20% 10%; border: 3px solid var(--fx); border-radius: 50%; animation: ring 1s ease-out forwards; pointer-events: none; z-index: 2; }
  .rays { position: absolute; left: 50%; top: 45%; width: 190%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--fx) 42%, transparent) 0 7deg, transparent 7deg 20deg); mask-image: radial-gradient(closest-side, #000 25%, transparent 72%); animation: spin 14s linear infinite, fadein .8s ease-out; pointer-events: none; z-index: -1; }
  .sparks { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
  .sparks i { position: absolute; bottom: 8%; left: var(--x); width: var(--s); height: var(--s); border-radius: 50%; background: var(--fx); box-shadow: 0 0 8px var(--fx); opacity: 0; animation: spark 1.9s var(--d) ease-out infinite; }
  .goat-word { position: absolute; left: 50%; top: -6%; translate: -50% 0; color: transparent; -webkit-text-stroke: 2px color-mix(in srgb, var(--goat) 70%, #ffd36b); font: 900 6.5rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .08em; opacity: .0; animation: goatword 1.2s .15s ease-out forwards; pointer-events: none; z-index: -1; }
  .flash { position: absolute; inset: 0; z-index: 5; pointer-events: none; animation: flash 1s ease-out forwards; }
  .flash.legend { background: radial-gradient(circle at center, #fff6d0 0%, color-mix(in srgb, var(--legend) 70%, transparent) 35%, transparent 75%); }
  .flash.goat { background: linear-gradient(90deg, transparent 38%, #ffd6f4 48%, #fff 50%, #ffe7a8 52%, transparent 62%), radial-gradient(circle at center, color-mix(in srgb, var(--goat) 75%, transparent) 0%, transparent 70%); animation-duration: 1.5s; }
  .skip { min-height: 36px; padding: 0 14px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: inherit; font-size: .62rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .skip:hover { color: var(--text); border-color: var(--accent); }
  @keyframes rise { from { transform: translateY(40px) scale(.9); opacity: 0; } }
  @keyframes breathe { 50% { filter: drop-shadow(0 0 12px color-mix(in srgb, var(--fx) 55%, transparent)); } }
  @keyframes tremble { 0% { transform: translate(-1.5px, 1px) rotate(-.6deg); } 50% { transform: translate(1.5px, -1px) rotate(.6deg); } 100% { transform: translate(-1px, -1px) rotate(-.3deg); } }
  @keyframes ring { from { transform: scale(.4); opacity: .95; } to { transform: scale(2.1); opacity: 0; } }
  @keyframes spin { to { rotate: 360deg; } }
  @keyframes fadein { from { opacity: 0; } }
  @keyframes spark { 0% { transform: translateY(0) scale(1); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-340px) scale(.2); opacity: 0; } }
  @keyframes goatword { from { opacity: 0; transform: scale(.6); } to { opacity: .55; transform: scale(1); } }
  @keyframes flash { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes quake { 0%, 100% { transform: translate(0); } 10% { transform: translate(-6px, 3px); } 25% { transform: translate(6px, -4px); } 40% { transform: translate(-5px, -2px); } 55% { transform: translate(4px, 3px); } 70% { transform: translate(-3px, 1px); } 85% { transform: translate(2px, -1px); } }
  @media (max-width: 720px) { .cards { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; } .back { min-height: 260px; } .goat-word { font-size: 4rem; } }
  @media (prefers-reduced-motion: reduce) {
    .slot, .shaking, .charging, .up .front { animation: none !important; }
    .flipper { transition: none; }
    .rays, .sparks, .ring, .goat-word, .flash { display: none; }
    .up .front { outline: 2px solid var(--fx); }
  }
</style>
