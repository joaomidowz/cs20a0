<script lang="ts">
  // Os destaques de um campeonato da Carreira: o MVP grande, com foto (quando registrada) e escudo do time, e os 4 EVPs
  // em cartas menores embaixo. Serve ao resumo do seu campeonato e ao pódio dos campeonatos do mundo.
  import TeamBadge from './TeamBadge.svelte';
  import { licensedImageFor, licensedImageSrc, ownPhotoFor } from '$lib/game/visuals/licensed';
  import type { EventStarRef } from '$lib/game/playerCareer/worldView';

  export let mvp: EventStarRef | null = null;
  export let evps: EventStarRef[] = [];
  export let compact = false;

  // A sua foto só existe quando o nick tem uma registrada com consentimento (player:me:<nick>), como na sua carta.
  const photoOf = (star: EventStarRef) => {
    const found = star.you ? ownPhotoFor(star.nick) : licensedImageFor('player', star.nick.toLowerCase());
    return found ? licensedImageSrc(found) : null;
  };
  let broken: Record<string, boolean> = {};
  const tone = (rating: number) => (rating >= 1.25 ? 'hot' : rating >= 1.1 ? 'good' : '');
</script>

{#if mvp || evps.length}
  <section class="stars" class:compact aria-label="Destaques do campeonato">
    {#if mvp}
      {@const photo = photoOf(mvp)}
      <div class="star-mvp" class:you={mvp.you}>
        <span class="face big">
          {#if photo && !broken[mvp.nick]}<img src={photo} alt="" loading="lazy" decoding="async" on:error={() => (broken = { ...broken, [mvp?.nick ?? '']: true })} />{:else}<span class="mono" aria-hidden="true">{mvp.nick.slice(0, 2).toUpperCase()}</span>{/if}
        </span>
        <span class="who">
          <span class="award-tag">MVP</span>
          <b class="nick">{mvp.nick}{mvp.you ? ' · você' : ''}</b>
          <span class="team">{#if mvp.orgId}<TeamBadge id={mvp.orgId} name={mvp.team} size="sm" highlight={mvp.you} />{/if}{mvp.team}</span>
        </span>
        <b class="mvp-rating {tone(mvp.rating)}">{mvp.rating.toFixed(2)}<small>rating</small></b>
      </div>
    {/if}
    {#if evps.length}
      <ol class="star-evps" aria-label="EVPs">
        {#each evps as star (star.nick)}
          {@const photo = photoOf(star)}
          <li class:you={star.you}>
            <span class="face">
              {#if photo && !broken[star.nick]}<img src={photo} alt="" loading="lazy" decoding="async" on:error={() => (broken = { ...broken, [star.nick]: true })} />{:else}<span class="mono" aria-hidden="true">{star.nick.slice(0, 2).toUpperCase()}</span>{/if}
            </span>
            <span class="who">
              <span class="award-tag evp">EVP</span>
              <b class="nick">{star.nick}{star.you ? ' · você' : ''}</b>
              <span class="team">{#if star.orgId}<TeamBadge id={star.orgId} name={star.team} size="sm" highlight={star.you} />{/if}<b class="evp-rating {tone(star.rating)}">{star.rating.toFixed(2)}</b></span>
            </span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  .stars { display: grid; gap: 8px; }
  .star-mvp { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 14px 10px 10px; border: 1px solid var(--gold, #d9a441); background: linear-gradient(110deg, color-mix(in srgb, var(--gold, #d9a441) 16%, var(--surface-2)), var(--surface-2) 60%); }
  .star-mvp.you { box-shadow: 0 0 22px color-mix(in srgb, var(--gold, #d9a441) 30%, transparent); }
  .face { position: relative; display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
  .face.big { width: 64px; height: 64px; border-color: var(--gold, #d9a441); }
  .face img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .mono { color: var(--muted); font: 900 15px/1 var(--display); letter-spacing: .02em; }
  .face.big .mono { color: var(--gold, #d9a441); font-size: 24px; }
  .who { display: grid; gap: 3px; min-width: 0; }
  .award-tag { justify-self: start; padding: 3px 6px; background: var(--gold, #d9a441); color: #17130a; font: 800 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .award-tag.evp { background: transparent; border: 1px solid color-mix(in srgb, var(--gold, #d9a441) 60%, var(--line)); color: var(--gold, #d9a441); padding: 2px 5px; }
  .nick { overflow: hidden; font: 900 22px/1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .you .nick { color: var(--accent); }
  .team { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .mvp-rating { display: grid; justify-items: end; gap: 2px; font: 900 28px/1 var(--display); font-variant-numeric: tabular-nums; }
  .mvp-rating small { color: var(--muted); font: 700 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .evp-rating { margin-left: auto; color: var(--text); font: 800 15px/1 var(--display); font-variant-numeric: tabular-nums; }
  .mvp-rating.hot, .evp-rating.hot { color: var(--gold, #d9a441); }
  .mvp-rating.good, .evp-rating.good { color: var(--accent); }
  .star-evps { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .star-evps li { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; padding: 6px 8px 6px 6px; border: 1px solid var(--line); background: var(--surface-2); }
  .star-evps li.you { border-color: var(--accent); }
  .star-evps .nick { font-size: 15px; }
  .compact .face.big { width: 48px; height: 48px; }
  .compact .star-mvp .nick { font-size: 18px; }
  .compact .mvp-rating { font-size: 22px; }
  @media (max-width: 520px) {
    .star-evps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .nick { font-size: 18px; }
  }
</style>
