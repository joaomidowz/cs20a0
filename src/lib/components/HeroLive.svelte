<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getTeamPlayers, teams } from '$lib/game/data';
  import { MAP_NAMES, getActiveDutyMapsForYear } from '$lib/game/maps';
  import type { HistoricalTeam, Language, MapId } from '$lib/game/types';

  export let language: Language = 'pt-BR';

  interface Side { team: HistoricalTeam; label: string; score: number; power: number; players: string[] }
  interface FeedItem { id: number; text: string; side: 'a' | 'b' }
  interface TickerItem { id: number; text: string }

  const MR = 12;
  const pool = teams.filter((team) => (team.teamPowerPreview ?? team.power ?? 0) >= 80);
  const label = (team: HistoricalTeam) => `${team.name ?? 'Time'} ${team.year ?? ''}`.trim();
  const pick = () => pool[Math.floor(Math.random() * pool.length)] ?? teams[0];

  let a: Side;
  let b: Side;
  let map = 'Mirage';
  let round = 0;
  let phase: 'live' | 'final' = 'live';
  let flash: 'a' | 'b' | null = null;
  let feed: FeedItem[] = [];
  let ticker: TickerItem[] = [];
  let timer: number | null = null;
  let counter = 0;
  let reducedMotion = false;

  const side = (team: HistoricalTeam): Side => ({
    team,
    label: label(team),
    score: 0,
    power: team.teamPowerPreview ?? team.power ?? 82,
    players: getTeamPlayers(team).map((player) => player.nickname ?? '').filter(Boolean)
  });

  function newMatch() {
    const first = pick();
    let second = pick();
    let guard = 0;
    while ((second.id === first.id || second.name === first.name) && guard < 10) { second = pick(); guard += 1; }
    a = side(first);
    b = side(second);
    const maps = [...new Set([...getActiveDutyMapsForYear(first.year), ...getActiveDutyMapsForYear(second.year)])] as MapId[];
    map = MAP_NAMES[maps[Math.floor(Math.random() * maps.length)] ?? 'mirage'];
    round = 0;
    feed = [];
    phase = 'live';
  }

  const eventsByLanguage: Record<Language, string[]> = {
    'pt-BR': ['abre com 2k', 'clutch 1v2', 'ace na B', 'AWP dupla', 'retake limpo', 'eco vencido', 'entry rápido', 'plant no A', 'defuse 0.3s', 'flank surpresa'],
    en: ['opens with a 2k', '1v2 clutch', 'ace on B', 'AWP double', 'clean retake', 'eco win', 'fast entry', 'plant on A', '0.3s defuse', 'surprise flank'],
    es: ['abre con 2k', 'clutch 1v2', 'ace en B', 'AWP doble', 'retake limpio', 'eco ganado', 'entry rápido', 'plant en A', 'defuse 0.3s', 'flank sorpresa']
  };
  $: events = eventsByLanguage[language] ?? eventsByLanguage['pt-BR'];
  $: mapClosed = language === 'en' ? 'MAP OVER' : language === 'es' ? 'MAPA CERRADO' : 'MAPA ENCERRADO';

  function playRound() {
    if (phase !== 'live') return;
    const total = a.power + b.power;
    const winner: 'a' | 'b' = Math.random() < a.power / total ? 'a' : 'b';
    const team = winner === 'a' ? a : b;
    team.score += 1;
    round += 1;
    flash = winner;
    const star = team.players[Math.floor(Math.random() * team.players.length)] ?? team.label;
    counter += 1;
    feed = [{ id: counter, text: `${star} · ${events[Math.floor(Math.random() * events.length)]}`, side: winner }, ...feed].slice(0, 3);
    a = a; b = b;
    const target = a.score >= MR && b.score >= MR ? Math.max(a.score, b.score) + (Math.abs(a.score - b.score) >= 2 ? 0 : 1) : MR + 1;
    if (team.score >= target && Math.abs(a.score - b.score) >= (a.score >= MR && b.score >= MR ? 2 : 1)) finishMatch();
  }

  function finishMatch() {
    phase = 'final';
    counter += 1;
    ticker = [{ id: counter, text: `${a.label} ${a.score}:${b.score} ${b.label} · ${map}` }, ...ticker].slice(0, 6);
    schedule(2600, () => { newMatch(); schedule(700, loop); });
  }

  function schedule(ms: number, fn: () => void) {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = null; fn(); }, ms);
  }

  function loop() {
    playRound();
    if (phase === 'live') schedule(650 + Math.random() * 900, loop);
  }

  newMatch();

  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      a.score = 13; b.score = 11; round = 24; a = a; b = b;
      return;
    }
    schedule(900, loop);
  });
  onDestroy(() => { if (timer !== null) window.clearTimeout(timer); });
</script>

<div class="hero-visual hero-live" aria-hidden="true">
  <div class="radar">
    <i class="blip b1"></i><i class="blip b2"></i><i class="blip b3"></i><i class="blip b4"></i><i class="blip b5"></i>
    <em class="ping"></em>
    <span></span>
  </div>
  <div class="crosshair"></div>

  <div class="floating-score live-board" class:final={phase === 'final'}>
    <small>{phase === 'final' ? 'FINAL' : 'LIVE PROTOCOL'} · {map.toUpperCase()}</small>
    <div class="live-teams">
      <span class:leading={a.score > b.score} class:winner={phase === 'final' && a.score > b.score}>{a.label}</span>
      <span class:leading={b.score > a.score} class:winner={phase === 'final' && b.score > a.score}>{b.label}</span>
    </div>
    <div class="live-score">
      {#key a.score}<b class:flash={flash === 'a'}>{a.score}</b>{/key}
      <i>:</i>
      {#key b.score}<b class:flash={flash === 'b'}>{b.score}</b>{/key}
    </div>
    <span>{phase === 'final' ? `${mapClosed} · ${round} ROUNDS` : `ROUND ${round + 1} / MR${MR}`}</span>
    <ul class="live-feed">
      {#each feed as item (item.id)}<li class={item.side}>{item.text}</li>{/each}
    </ul>
  </div>

  {#if ticker.length}
    <div class="live-ticker"><div>{#each ticker as item (item.id)}<span>{item.text}</span>{/each}</div></div>
  {/if}
</div>

<style>
  .hero-live{pointer-events:none}
  .blip{animation:drift 9s ease-in-out infinite alternate,blink 5s linear infinite}
  .b1{left:28%;top:37%;animation-duration:11s,5s}.b2{left:58%;top:25%;animation-duration:9s,5s;animation-delay:-2s,-1.2s}.b3{left:68%;top:65%;animation-duration:13s,5s;animation-delay:-5s,-2.4s}.b4{left:36%;top:70%;animation-duration:8s,5s;animation-delay:-3s,-3.6s}.b5{left:50%;top:52%;width:5px;height:5px;animation-duration:10s,5s;animation-delay:-1s,-4.5s}
  .ping{position:absolute;inset:0;border:1px solid var(--accent);border-radius:50%;opacity:0;animation:ping 4s ease-out infinite}
  .crosshair{animation:aim 7s ease-in-out infinite alternate}
  .live-board{display:grid;gap:6px;min-width:250px;transition:border-color .3s ease}.live-board.final{border-left-color:var(--accent-2)}
  .live-board>small{color:var(--muted);font-size:.55rem;letter-spacing:.14em}
  .live-teams{display:grid;grid-template-columns:1fr 1fr;gap:10px}.live-teams span{overflow:hidden;color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.06em;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}.live-teams span:last-child{text-align:right}.live-teams span.leading{color:var(--text)}.live-teams span.winner{color:var(--accent)}
  .live-score{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.live-score b{font:900 3.4rem/1 'Arial Narrow',Impact,sans-serif;animation:pop .35s ease-out}.live-score b.flash{color:var(--accent);text-shadow:0 0 18px color-mix(in srgb,var(--accent) 60%,transparent)}.live-score i{color:var(--line);font:900 2rem/1 'Arial Narrow',Impact,sans-serif;font-style:normal}
  .live-board>span{color:var(--muted);font-size:.58rem;letter-spacing:.14em}
  .live-feed{display:grid;gap:3px;margin:6px 0 0;padding:6px 0 0;border-top:1px solid var(--line);list-style:none}.live-feed li{overflow:hidden;color:var(--muted);font-size:.58rem;letter-spacing:.04em;text-overflow:ellipsis;white-space:nowrap;animation:slideIn .3s ease-out}.live-feed li::before{content:'▸ ';color:var(--accent)}.live-feed li.b::before{color:var(--accent-2)}
  .live-ticker{position:absolute;left:0;right:0;bottom:-10px;overflow:hidden;border-block:1px solid var(--line);background:color-mix(in srgb,var(--surface) 80%,transparent)}
  .live-ticker div{display:flex;gap:34px;width:max-content;padding:7px 0;animation:ticker 28s linear infinite}.live-ticker span{color:var(--muted);font-size:.58rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}.live-ticker span::before{content:'●';margin-right:8px;color:var(--accent)}
  @keyframes drift{to{transform:translate(18px,-12px)}}
  @keyframes blink{0%,84%{opacity:.35}90%{opacity:1;box-shadow:0 0 22px var(--accent)}100%{opacity:.35}}
  @keyframes ping{0%{transform:scale(.15);opacity:.8}100%{transform:scale(1);opacity:0}}
  @keyframes aim{to{transform:translate(26px,-18px)}}
  @keyframes pop{from{transform:translateY(-8px) scale(1.12);opacity:.4}}
  @keyframes slideIn{from{transform:translateX(-8px);opacity:0}}
  @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
</style>
