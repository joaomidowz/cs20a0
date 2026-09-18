// Revisão de overall/raridade aprovada em 2026-09-18. Roda sobre um diretório de dados (Studio workspace ou jogo):
//   node scripts/apply-overall-review.mjs <dir-com-players.game.json> <dir-com-players.expansion.game.json> [--write]
// Regra: top 20 HLTV do ano = escada 99..90; MVP de Major piso 95; EVP piso 90; fora disso teto 89; IGL lendário (IGL 92+)
// mantém até 93; IGL campeão de Major no ano = GOAT, IGL 99, overall piso 95. Raridade derivada do overall.
// Anos sem top 20 no dado (2013, 2014, 2015, 2020): só o top 3 conhecido é fixado e ninguém mais passa de 96; 2026 não muda.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [coreDir, expansionDir, flag] = process.argv.slice(2);
const write = flag === '--write';
const LADDER = [99, 98, 97, 96, 96, 95, 95, 95, 94, 94, 93, 93, 92, 92, 91, 91, 90, 90, 90, 90];
const KNOWN_TOP3 = { 2013: ['get_right', 'f0rest', 'shox'], 2014: ['get_right', 'flusha', 'jw'], 2015: ['olofmeister', 'guardian', 'device'], 2020: ['zywoo', 's1mple', 'device'] };
// Rosters without an IGL role in the data: who actually called for the Major-winning five.
const CALLER_OVERRIDE = { 'fnatic-2013': 'pronax', 'ninjas-in-pyjamas-2014': 'xizt', 'team-ldlc-com-2014': 'happy', 'fnatic-2015': 'pronax', 'team-envyus-2015': 'happy' };
// Cards that carry another player's HLTV rank by nickname clash (OG's niko is not G2's NiKo).
const NOT_RANKED = new Set(['niko-og-2023']);
const UNTOUCHED_YEARS = new Set([2026]);
const ATTRIBUTES = ['firepower', 'clutch', 'entry', 'awp', 'support', 'igl', 'experience', 'consistency', 'mental'];
const load = (file) => JSON.parse(readFileSync(file, 'utf8'));
const files = { players: path.join(coreDir, 'players.game.json'), teams: path.join(coreDir, 'teams.game.json'), xPlayers: path.join(expansionDir, 'players.expansion.game.json'), xTeams: path.join(expansionDir, 'teams.expansion.game.json') };
const data = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, load(file)]));
const players = [...data.players, ...data.xPlayers].filter((p) => !p.retired);
const teams = [...data.teams, ...data.xTeams];

const slug = (p) => String(p.baseId ?? p.nickname ?? p.id).toLowerCase().replace(/[^a-z0-9_]/g, '');
const rankOf = (p) => { if (NOT_RANKED.has(p.id)) return null; const b = (p.badges ?? []).find((x) => /^hltv-top20-rank-\d+-/.test(x)); return b ? Number(b.split('-')[3]) : null; };
const isMvp = (p) => (p.badges ?? []).includes('major-mvp');
const isEvp = (p) => (p.badges ?? []).some((b) => b.startsWith('major-evp'));
const isIgl = (p) => String(p.role ?? '').toLowerCase().includes('igl');
const rarityFor = (o) => (o >= 97 ? 'goat' : o >= 90 ? 'legend' : o >= 85 ? 'superstar' : o >= 81 ? 'elite' : o >= 78 ? 'rare' : 'common');

// The caller of each Major-winning roster: the card with the IGL role, else the best IGL attribute of the five.
const championCallers = new Set();
for (const team of teams.filter((t) => (t.badges ?? []).includes('major-champion'))) {
  const roster = players.filter((p) => p.teamId === team.id);
  const named = CALLER_OVERRIDE[team.id];
  const caller = (named && roster.find((p) => slug(p) === named)) ?? roster.find(isIgl) ?? [...roster].sort((a, b) => (b.igl ?? 0) - (a.igl ?? 0))[0];
  if (caller) championCallers.add(caller.id);
}

for (const p of players) {
  if (!NOT_RANKED.has(p.id)) continue;
  p.badges = (p.badges ?? []).filter((b) => !b.startsWith('hltv-top20'));
  p.awardBadges = (p.awardBadges ?? []).filter((b) => !b.startsWith('HLTV Top 20'));
  delete p.hltvTop20;
  if (p.source && typeof p.source === 'object') delete p.source.hltvTop20;
}
const report = [];
for (const year of [...new Set(players.map((p) => p.year))].sort()) {
  if (UNTOUCHED_YEARS.has(year)) continue;
  const cards = players.filter((p) => p.year === year);
  const hasList = cards.filter(rankOf).length >= 15;
  for (const p of cards) {
    const before = p.overall ?? 70;
    const beforeRarity = String(p.rarity ?? 'common').toLowerCase();
    let after;
    if (hasList) {
      const rank = rankOf(p);
      after = rank && rank <= 20 ? LADDER[rank - 1] : Math.min(before, 89);
    } else {
      const top = (KNOWN_TOP3[year] ?? []).indexOf(slug(p));
      after = top >= 0 ? LADDER[top] : Math.min(before, 96);
    }
    if (isMvp(p) && after < 95) after = 95;
    else if (isEvp(p) && after < 90) after = 90;
    if (hasList && isIgl(p) && (p.igl ?? 0) >= 92 && before >= 90 && after < 90) after = Math.min(before, 93);
    let rarity = rarityFor(after);
    const champion = championCallers.has(p.id);
    if (champion) { after = Math.max(after, 95); rarity = 'goat'; }
    const delta = after - before;
    if (delta !== 0) {
      // Attributes move with the card so the numbers on it (and the simulation that reads them) agree with the overall.
      // A raise lifts only the player's strengths (85+), so off-role numbers stay where the role-aware pass left them.
      for (const key of ATTRIBUTES) if (typeof p[key] === 'number' && p[key] >= (delta > 0 ? 85 : 60)) p[key] = Math.max(40, Math.min(99, p[key] + delta));
    }
    if (champion) p.igl = 99;
    // Never an all-99 card: at most two attributes sit at 99 (the caller's IGL first), the rest stop at 98.
    const maxed = ATTRIBUTES.filter((key) => (p[key] ?? 0) >= 99).sort((a, b) => (champion && a === 'igl' ? -1 : champion && b === 'igl' ? 1 : 0));
    for (const key of maxed.slice(2)) p[key] = 98;
    if (delta !== 0 || rarity !== beforeRarity || champion) report.push({ year, id: p.id, nick: p.nickname, before, after, beforeRarity, rarity, champion });
    p.overall = after;
    p.rarity = rarity;
  }
}

const count = (key) => report.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] ?? 0) + 1), acc), {});
console.log(`cartas alteradas: ${report.length} · overall muda: ${report.filter((r) => r.before !== r.after).length}`);
console.log('IGLs campeões:', report.filter((r) => r.champion).map((r) => `${r.nick} ${r.year} ${r.before}>${r.after} ${r.rarity}`).join(', '));
console.log('raridade final:', JSON.stringify(players.reduce((acc, p) => ((acc[p.rarity] = (acc[p.rarity] ?? 0) + 1), acc), {})));
if (write) {
  for (const key of ['players', 'xPlayers']) writeFileSync(files[key], JSON.stringify(data[key], null, 2) + '\n');
  writeFileSync(path.join(coreDir, '..', 'overall-review-2026-09-18.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('gravado.');
} else console.log('(simulação: nada gravado; use --write)');
void count;
