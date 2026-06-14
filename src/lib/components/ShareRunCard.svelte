<script lang="ts">
  import { getRoleLabel } from '$lib/game/roleRules';
  import { getRunMvpScore, getRunSummary } from '$lib/game/runStats';
  import type { MajorRun, Player, PlayerRunStats, SelectedPlayer } from '$lib/game/types';

  export let seed: string;
  export let run: MajorRun;
  export let players: Player[] = [];
  export let lineup: SelectedPlayer[] = [];
  export let stats: PlayerRunStats[] = [];
  export let labels: {
    champion: string;
    eliminated: string;
    placement: string;
    record: string;
    maps: string;
    mvp: string;
  };

  $: summary = getRunSummary(run);
  $: mvpStat = [...stats].sort((a, b) => getRunMvpScore(b) - getRunMvpScore(a))[0];
  $: mvpPlayer = players.find((player) => player.id === mvpStat?.playerId);
  $: playerRows = lineup.map((selected) => ({
    selected,
    player: players.find((player) => player.id === selected.playerId)
  }));
</script>

<section id="share-card" class:champion={run.champion} class="share-card" aria-label="cs13a0 run card">
  <header>
    <div class="share-brand"><span>CS</span><strong>cs13a0</strong></div>
    <div class="share-seed"><small>SEED</small><b>{seed}</b></div>
  </header>

  <div class="share-result">
    {#if run.champion}<span class="champion-badge">MAJOR CHAMPION</span>{/if}
    <small>FINAL REPORT</small>
    <h2>{run.champion ? labels.champion : labels.eliminated}</h2>
    <p>{run.placement}</p>
    <div>
      <span><small>{labels.record}</small><b>{summary.seriesWon}-{summary.seriesLost}</b></span>
      <span><small>{labels.maps}</small><b>{summary.mapsWon}-{summary.mapsLost}</b></span>
      <span><small>{labels.placement}</small><b>{run.placement}</b></span>
    </div>
  </div>

  <div class="share-lineup">
    {#each playerRows as item, index}
      {#if item.player}
        <article>
          <span class="share-index">0{index + 1}</span>
          <div class="share-avatar">{(item.player.nickname ?? '?').slice(0, 2).toUpperCase()}</div>
          <div><strong>{item.player.nickname ?? 'Unknown'}</strong><small>{getRoleLabel(item.selected.selectedSlotRole)} · {item.player.year ?? ''}</small></div>
          <b>{item.player.overall ?? 70}</b>
        </article>
      {/if}
    {/each}
  </div>

  <footer>
    <div><small>{labels.mvp}</small><strong>{mvpPlayer?.nickname ?? '—'}</strong></div>
    <div><small>RUN RATING</small><strong>{mvpStat?.runRating.toFixed(2) ?? '—'}</strong></div>
    <span>NO BACKEND · DETERMINISTIC SEED</span>
  </footer>
</section>

<style>
  .share-card{position:relative;width:min(540px,100%);min-height:675px;margin:24px auto;padding:24px;overflow:hidden;border:1px solid #2d383d;color:#edf2f3;background:radial-gradient(circle at 100% 0,rgba(200,255,50,.13),transparent 34%),linear-gradient(145deg,#0e1316,#050708 72%);box-shadow:0 28px 90px rgba(0,0,0,.45);font-family:Arial,sans-serif}.share-card.champion{border-color:#88a92d;box-shadow:0 28px 90px rgba(0,0,0,.45),0 0 40px rgba(200,255,50,.08)}
  .share-card::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(to bottom,#000,transparent 88%)}
  header,.share-result,.share-lineup,footer{position:relative;z-index:1}
  header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid #283139}
  .share-brand{display:flex;align-items:center;gap:9px}.share-brand>span{display:grid;place-items:center;width:42px;height:34px;color:#091006;background:#c8ff32;font-size:.75rem;font-weight:900;clip-path:polygon(0 0,100% 0,84% 100%,0 100%)}.share-brand strong{font-size:1.45rem;text-transform:uppercase}
  .share-seed{text-align:right}.share-seed small,.share-seed b{display:block}.share-seed small{color:#89939a;font-size:.48rem;letter-spacing:.18em}.share-seed b{margin-top:3px;color:#c8ff32;font-size:.8rem;letter-spacing:.12em}
  .share-result{padding:17px 0 15px}.share-result>small{color:#c8ff32;font-size:.5rem;font-weight:800;letter-spacing:.18em}.share-result h2{max-width:430px;margin:7px 0 3px;font-size:2.5rem;line-height:.88;text-transform:uppercase}.share-result>p{margin:0;color:#ff7134;font-size:.83rem;font-weight:800;text-transform:uppercase}.share-result>div{display:grid;grid-template-columns:92px 92px 1fr;gap:7px;margin-top:13px}.share-result>div span{min-width:0;padding:8px;border:1px solid #283139;background:#11171a}.share-result>div small,.share-result>div b{display:block}.share-result>div small{color:#89939a;font-size:.45rem;text-transform:uppercase}.share-result>div b{overflow:hidden;margin-top:4px;font-size:.82rem;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}.champion-badge{position:absolute;right:0;top:14px;padding:5px 7px;color:#091006;background:#c8ff32;font-size:.48rem;font-weight:900}
  .share-lineup{display:grid;gap:5px}.share-lineup article{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;min-height:55px;padding:7px 10px 7px 46px;border:1px solid #283139;background:linear-gradient(90deg,#151c20,#0c1114)}.share-avatar{display:grid;place-items:center;width:36px;height:36px;border:1px solid #39464c;color:#c8ff32;background:#0b0f11;font-size:.74rem;font-weight:900}.share-lineup article strong,.share-lineup article small{display:block}.share-lineup article strong{font-size:1rem}.share-lineup article small{margin-top:2px;color:#89939a;font-size:.5rem;font-weight:700;text-transform:uppercase}.share-lineup article>b{font-size:1.4rem}.share-index{position:absolute;left:9px;color:#334046;font-size:1.25rem;font-weight:900}
  footer{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px;padding-top:12px;border-top:1px solid #283139}footer>div{padding-left:9px;border-left:2px solid #c8ff32}footer small,footer strong{display:block}footer small{color:#89939a;font-size:.46rem;letter-spacing:.1em}footer strong{margin-top:3px;font-size:1rem}footer>span{grid-column:1/-1;color:#536168;font-size:.43rem;letter-spacing:.15em;text-align:center}
</style>
