<script lang="ts">
  // Os números do campeonato na Carreira: você em destaque, com tudo do kill feed separado por assunto (duelo, time,
  // momentos), e os parceiros em cartas menores com foto e só o essencial (rating, K-D, ADR, KAST).
  import type { Player, PlayerRunStats } from '$lib/game/types';
  import { licensedImageFor, licensedImageSrc } from '$lib/game/visuals/licensed';

  export let stats: PlayerRunStats[] = [];
  export let players: Player[] = [];
  export let meId: string;
  export let roleLabel: (role: string) => string = (role) => role;

  $: byId = new Map(players.map((player) => [player.id, player]));
  $: ranked = [...stats].sort((a, b) => b.runRating - a.runRating);
  $: mine = stats.find((stat) => stat.playerId === meId) ?? null;
  $: mates = ranked.filter((stat) => stat.playerId !== meId);
  $: bestId = ranked[0]?.playerId ?? null;
  $: worstId = ranked.length > 1 ? ranked[ranked.length - 1].playerId : null;
  $: myRank = mine ? ranked.findIndex((stat) => stat.playerId === meId) + 1 : 0;
  const nickOf = (id: string) => byId.get(id)?.nickname ?? '?';
  const photoOf = (id: string) => {
    const player = byId.get(id);
    if (!player || id === meId) return null;
    const found = licensedImageFor('player', player.baseId ?? null) ?? licensedImageFor('player', (player.nickname ?? '').toLowerCase());
    return found ? licensedImageSrc(found) : null;
  };
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  const kd = (stat: PlayerRunStats) => `${stat.kills}-${stat.deaths}`;
  const tone = (rating: number) => (rating >= 1.15 ? 'hot' : rating < 0.95 ? 'cold' : '');
  let broken: Record<string, boolean> = {};
</script>

{#if mine}
  {@const me = byId.get(mine.playerId)}
  <article class="er-me" class:best={bestId === mine.playerId}>
    <div class="er-me-id">
      <span class="er-mono" aria-hidden="true">{(me?.nickname ?? '?').slice(0, 2).toUpperCase()}</span>
      <div class="er-me-name">
        <span class="er-eyebrow">Você · {roleLabel(mine.assignedRole)}</span>
        <b>{me?.nickname ?? 'Você'}</b>
        <span class="er-rank">{myRank}º do time em rating</span>
      </div>
      {#if bestId === mine.playerId}<span class="er-badge gold">MVP do time</span>{:else if worstId === mine.playerId}<span class="er-badge bad">Pior rating</span>{/if}
    </div>
    <div class="er-rating {tone(mine.runRating)}">
      <small>Rating 3.0</small>
      <b>{mine.runRating.toFixed(2)}</b>
      {#if mine.swing !== undefined}<i class:up={mine.swing > 0} class:down={mine.swing < 0}>Swing {signed(mine.swing)}</i>{/if}
    </div>
    <div class="er-groups">
      <section>
        <p>Duelo</p>
        <dl>
          <div><dt>K / D / A</dt><dd>{mine.kills} / {mine.deaths}{mine.assists !== undefined ? ` / ${mine.assists}` : ''}</dd></div>
          <div><dt>K/D</dt><dd>{mine.kdRatio.toFixed(2)}</dd></div>
          <div><dt>ADR</dt><dd>{mine.adr}</dd></div>
          <div><dt>Impacto</dt><dd>{mine.impact.toFixed(2)}</dd></div>
        </dl>
      </section>
      <section>
        <p>Time</p>
        <dl>
          {#if mine.kast !== undefined}<div><dt>KAST</dt><dd>{mine.kast.toFixed(1)}%</dd></div>{/if}
          <div><dt>Aberturas V-D</dt><dd>{mine.openingKills}{mine.openingDeaths !== undefined ? `-${mine.openingDeaths}` : ''}</dd></div>
          {#if mine.tradeKills !== undefined}<div><dt>Trocas</dt><dd>{mine.tradeKills}</dd></div>{/if}
          {#if mine.utilityDamage !== undefined}<div><dt>Dano de utilitária</dt><dd>{mine.utilityDamage.toFixed(1)}</dd></div>{/if}
        </dl>
      </section>
      <section>
        <p>Momentos</p>
        <dl>
          {#if mine.multiKills}<div><dt>3K / 4K / Ace</dt><dd>{mine.multiKills.triple} / {mine.multiKills.quad} / {mine.multiKills.ace}</dd></div>{/if}
          <div><dt>Clutches</dt><dd>{mine.clutches}</dd></div>
          <div><dt>Mapas V-D</dt><dd>{mine.mapsWon}-{mine.mapsLost}</dd></div>
          <div><dt>Rounds V-D</dt><dd>{mine.roundsWon}-{mine.roundsLost}</dd></div>
        </dl>
      </section>
    </div>
  </article>
{/if}

{#if mates.length}
  <p class="er-label">Parceiros</p>
  <ol class="er-mates">
    {#each mates as stat (stat.playerId)}
      {@const photo = photoOf(stat.playerId)}
      <li class:best={bestId === stat.playerId} class:worst={worstId === stat.playerId && bestId !== stat.playerId}>
        <div class="er-face">
          {#if photo && !broken[stat.playerId]}
            <img src={photo} alt="" loading="lazy" decoding="async" on:error={() => (broken = { ...broken, [stat.playerId]: true })} />
          {:else}
            <span class="er-mono small" aria-hidden="true">{nickOf(stat.playerId).slice(0, 2).toUpperCase()}</span>
          {/if}
          {#if bestId === stat.playerId}<span class="er-badge gold">MVP</span>{:else if worstId === stat.playerId}<span class="er-badge bad">Pior</span>{/if}
        </div>
        <div class="er-mate-body">
          <span class="er-eyebrow">{roleLabel(stat.assignedRole)}</span>
          <b class="er-nick">{nickOf(stat.playerId)}</b>
          <span class="er-mate-rating {tone(stat.runRating)}">{stat.runRating.toFixed(2)}</span>
          <dl class="er-mini">
            <div><dt>K-D</dt><dd>{kd(stat)}</dd></div>
            <div><dt>ADR</dt><dd>{stat.adr}</dd></div>
            {#if stat.kast !== undefined}<div><dt>KAST</dt><dd>{Math.round(stat.kast)}%</dd></div>{/if}
          </dl>
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .er-me { display: grid; grid-template-columns: minmax(0, 1.1fr) auto; grid-template-areas: 'id rating' 'groups groups'; gap: 14px 18px; padding: 16px; border: 1px solid var(--line); background: radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%), var(--surface-2); }
  .er-me.best { border-color: var(--gold); }
  .er-me-id { grid-area: id; display: flex; align-items: center; gap: 14px; min-width: 0; }
  .er-mono { display: grid; flex: none; place-items: center; width: 64px; height: 64px; border: 1px solid var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); font: 900 28px/1 var(--display); }
  .er-mono.small { width: 100%; height: 100%; border: 0; font-size: 26px; }
  .er-me-name { display: grid; gap: 3px; min-width: 0; }
  .er-me-name b { overflow-wrap: anywhere; font: 900 34px/0.95 var(--display); text-transform: uppercase; }
  .er-eyebrow { color: var(--accent); font: 700 10px/1.1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .er-rank { color: var(--muted); font-size: 12px; }
  .er-badge { align-self: flex-start; padding: 4px 7px; font: 800 10px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .er-badge.gold { background: var(--gold); color: #111; }
  .er-badge.bad { background: var(--accent-2); color: #111; }
  .er-rating { grid-area: rating; display: grid; justify-items: end; align-content: center; gap: 2px; }
  .er-rating small { color: var(--muted); font: 700 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .er-rating b { font: 900 56px/.9 var(--display); font-variant-numeric: tabular-nums; }
  .er-rating.hot b { color: var(--accent); }
  .er-rating.cold b { color: var(--accent-2); }
  .er-rating i { color: var(--muted); font: 700 11px/1 var(--body); font-style: normal; letter-spacing: .06em; text-transform: uppercase; }
  .er-rating i.up { color: var(--accent); }
  .er-rating i.down { color: var(--accent-2); }
  .er-groups { grid-area: groups; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .er-groups section { display: grid; gap: 6px; align-content: start; }
  .er-groups p { margin: 0; padding-left: 8px; border-left: 2px solid var(--accent); color: var(--muted); font: 700 10px/1.2 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .er-groups dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin: 0; }
  .er-groups dl div { display: grid; gap: 3px; min-width: 0; padding: 7px 9px; border: 1px solid var(--line); background: var(--surface); }
  .er-groups dt { overflow: hidden; color: var(--muted); font: 700 9.5px/1.2 var(--body); letter-spacing: .04em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .er-groups dd { margin: 0; font: 800 18px/1 var(--display); font-variant-numeric: tabular-nums; }
  .er-label { margin: 6px 0 0; color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .er-mates { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
  .er-mates li { display: grid; grid-template-rows: auto 1fr; overflow: hidden; border: 1px solid var(--line); background: var(--surface-2); }
  .er-mates li.best { border-color: var(--gold); }
  .er-mates li.worst { border-color: color-mix(in srgb, var(--accent-2) 60%, var(--line)); }
  .er-face { position: relative; height: 92px; overflow: hidden; background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--surface)), var(--surface)); }
  .er-face img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 18%; }
  .er-face .er-badge { position: absolute; top: 6px; right: 6px; }
  .er-mate-body { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'role rating' 'nick rating' 'mini mini'; gap: 2px 8px; padding: 8px 10px 10px; }
  .er-mate-body .er-eyebrow { grid-area: role; }
  .er-nick { grid-area: nick; overflow: hidden; font: 900 19px/1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .er-mate-rating { grid-area: rating; align-self: center; font: 900 28px/1 var(--display); font-variant-numeric: tabular-nums; }
  .er-mate-rating.hot { color: var(--accent); }
  .er-mate-rating.cold { color: var(--accent-2); }
  .er-mini { grid-area: mini; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 6px 0 0; }
  .er-mini div { display: grid; gap: 2px; min-width: 0; padding: 4px 6px; border: 1px solid var(--line); background: var(--surface); }
  .er-mini dt { color: var(--muted); font: 700 9px/1 var(--body); letter-spacing: .04em; text-transform: uppercase; }
  .er-mini dd { margin: 0; font: 800 14px/1 var(--display); font-variant-numeric: tabular-nums; }
  @media (max-width: 860px) {
    .er-groups { grid-template-columns: minmax(0, 1fr); }
    .er-mates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 520px) {
    .er-me { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'id' 'rating' 'groups'; padding: 12px; }
    .er-rating { justify-items: start; }
    .er-rating b { font-size: 44px; }
    .er-me-name b { font-size: 26px; }
    /* Dois parceiros por linha deixam ~30px por número: no celular, cada número vira uma linha (rótulo e valor). */
    .er-mini { grid-template-columns: minmax(0, 1fr); gap: 2px; }
    .er-mini div { grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 6px; padding: 3px 6px; }
    .er-mini dd { text-align: right; }
  }
</style>
