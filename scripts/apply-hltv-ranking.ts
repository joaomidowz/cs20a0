// scripts/apply-hltv-ranking.ts
// Casa o ranking mundial da HLTV de novembro de 2026 (D12) com a cena da Carreira e grava o resultado em
// src/lib/data/cs/career-hltv-ranking.game.json, que data.ts aplica por cima da coleta, das planilhas e dos elencos
// informados. Determinístico: a mesma entrada gera o mesmo arquivo.
//   npx tsx scripts/apply-hltv-ranking.ts [caminho/do/ranking.json]
// Entrada padrão: docs/superpowers/specs/hltv-2026-11/ranking.json (rank, pontos, variação e os nicks da planilha
// do dono, jogadores-times.csv, que é a fonte da grafia).
// Regras (decisões D3, D4, D11 e D12 da spec 2026-11-09-carreira-mundo-vivo-design.md):
// - Time do ranking que o jogo já tem fica com o id dele (os saves continuam achando o time) e recebe o elenco da HLTV.
// - Rebrand (3DMAX virou Envy) troca o nome e mantém o id. Variante de nome (FaZe = FaZe Clan) mantém o nome do jogo.
// - Time que o jogo não tem entra com id novo, nível pelo ranking (1 a 16 como hoje, 17 a 30 nível 2, 31 a 60 nível
//   3, o resto 4), país do núcleo (3+ do mesmo país) e região pelos países conhecidos dos jogadores.
// - Jogador que o jogo conhece (sem diferença de maiúsculas, ou pela grafia antiga) leva a identidade dele (país,
//   nascimento, funções, catálogo). Jogador novo: país só se o arquivo de identidades ou a promessa curada souber,
//   função vazia (o jogo põe pela vaga), catálogo só quando o nick bate com uma carta recente (2021+).
// - Nick repetido em dois times do ranking (xarás): fica no time de melhor ranking; o outro é listado no relatório.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import rawScene from '../src/lib/data/cs/career-scene.game.json';
import rawSheet from '../src/lib/data/cs/career-extra-rosters.game.json';
import rawPlayers from '../src/lib/data/cs/players.game.json';
import rawIdentities from '../src/lib/data/cs/identities.game.json';
import rawProspects from '../src/lib/data/cs/career-prospects.game.json';
import { orgNation, sceneBeforeRealRanking, type RealRankingFile, type RealRankingTeam, type SceneRosterMember } from '../src/lib/game/playerCareer/data';
import { regionOf, type Region } from '../src/lib/game/playerCareer/calendar';
import { countryOfFlag } from '../src/lib/game/playerCareer/language';

const ROOT = path.resolve(import.meta.dirname, '..');
const INPUT = path.resolve(ROOT, process.argv[2] ?? 'docs/superpowers/specs/hltv-2026-11/ranking.json');
const OUTPUT = path.join(ROOT, 'src/lib/data/cs/career-hltv-ranking.game.json');

/** Time da HLTV que no jogo tem outro nome (variante: o jogo mantém o nome dele). */
const VARIANTS: Record<string, string> = {
  FaZe: 'FaZe Clan',
  Betclic: 'Betclic Apogee Esports',
  'MIBR fe': 'MIBR Female',
  LAG: "Life's A Game",
  Fluxo: 'Fluxo W7M',
  '100 Thieves': '100t',
  'LOS NINOS': 'Los Niños'
};

/** Rebrand: a org do jogo passou a se chamar como na HLTV (o id fica). Monte do jogo tem o elenco da Luminosity. */
const REBRANDS: Record<string, string> = {
  Luminosity: 'Monte',
  Envy: '3DMAX',
  DENDELE: 'Sharks',
  'Iberian Soul': 'Gentle Mates',
  BBL: 'Tricked Esport',
  'Black Phoenix': 'Ursa',
  BARCA: 'LargadosyPelados',
  'BET-M': '33',
  STATE: 'WOPA Esport',
  Illyrians: 'MANA eSports',
  'Just Players': '2007',
  Villainous: 'team mouse',
  'LFO 10': 'Entropy Gaming',
  KZG: 'Arcade Esports',
  Zetta: 'ELITES'
};

/** Time da HLTV que é novo mesmo com nome igual a uma org do jogo (o Monte do jogo virou a Luminosity). */
const FORCE_NEW = new Set(['Monte']);

/** Grafia da HLTV para um jogador que a cena escreve diferente (mesma pessoa). */
const NICK_VARIANTS: Record<string, string> = {
  device: 'dev1ce',
  techno: 'Techno4K',
  'hunter-': 'hunter',
  pavv: 'pavv+',
  eightz999: 'eightz'
};

/** Carta do catálogo só vale para jogador novo quando é recente (nick antigo pode ser outra pessoa). */
const CATALOG_FROM_YEAR = 2021;

const teamKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^team\s+/, '').replace(/\s+(team|gaming|esports?|club)$/, '').replace(/[^a-z0-9]/g, '');
const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface InputTeam { rank: number; name: string; points: number; change: string; players: string[] }
const input = JSON.parse(readFileSync(INPUT, 'utf8')) as { teams: InputTeam[] };
const teams = [...input.teams].sort((a, b) => a.rank - b.rank);

const orgs = [...sceneBeforeRealRanking];
const orgByKey = new Map(orgs.map((org) => [teamKey(org.name), org]));
const orgByName = new Map(orgs.map((org) => [org.name, org]));

// Onde cada jogador real está hoje na cena (sem os gerados).
const current = new Map<string, { member: SceneRosterMember; orgId: string }>();
for (const org of orgs) for (const member of org.roster) if (!member.generated) current.set(member.nick.toLowerCase(), { member, orgId: org.id });

// Identidade conhecida fora dos elencos atuais: coleta crua (quem tem catálogo primeiro) e planilha do usuário.
const archive = new Map<string, SceneRosterMember>();
for (const org of (rawScene as unknown as { orgs: Array<{ roster: SceneRosterMember[] }> }).orgs) for (const member of org.roster) {
  const key = member.nick.toLowerCase();
  if (!archive.has(key) || (!archive.get(key)!.catalogBaseId && member.catalogBaseId)) archive.set(key, member);
}
interface SheetMember { nick: string; role: string; country: string | null; birthYear: number | null }
for (const team of (rawSheet as unknown as { teams: Array<{ roster: SheetMember[] }> }).teams) for (const entry of team.roster) {
  if (!entry.nick || archive.has(entry.nick.toLowerCase())) continue;
  const country = !entry.country || entry.country === 'Internacional' ? null : entry.country;
  archive.set(entry.nick.toLowerCase(), { nick: entry.nick, country, birthDate: entry.birthYear ? `${entry.birthYear}-07-01` : null, roles: entry.role ? [entry.role] : [], catalogBaseId: null, prospect: null });
}

// Catálogo: carta recente pelo nick (baseId) e o país do arquivo de identidades.
const catalogByNick = new Map<string, { baseId: string; year: number; teamId: string }>();
for (const player of rawPlayers as Array<{ nickname?: string; baseId?: string; year?: number; teamId?: string }>) {
  if (!player.nickname || !player.baseId || !player.year) continue;
  const key = player.nickname.toLowerCase();
  const seen = catalogByNick.get(key);
  if (!seen || player.year > seen.year) catalogByNick.set(key, { baseId: player.baseId, year: player.year, teamId: player.teamId ?? '' });
}
const IDENTITY = (rawIdentities as unknown as { players: Record<string, { country?: string | null }> }).players;
const identityCountry = (key: string | null | undefined) => (key ? countryOfFlag(IDENTITY[key.toLowerCase()]?.country) : null);
const PROSPECT_COUNTRY = new Map((rawProspects as unknown as { prospects: Array<{ nick: string; country: string | null }> }).prospects.map((kid) => [kid.nick.toLowerCase(), kid.country]));

const report = {
  matched: [] as string[],
  renamed: [] as string[],
  added: [] as string[],
  moved: [] as string[],
  newPlayers: 0,
  knownPlayers: 0,
  catalogLinked: [] as string[],
  variants: [] as string[],
  homonyms: [] as string[],
  sceneHomonyms: [] as string[],
  released: [] as string[],
  regionGuessed: [] as string[]
};

/** O membro do elenco para o nick da HLTV: o da cena (mesma pessoa) com a grafia da HLTV, ou um jogador novo. */
function memberFor(nick: string): { member: SceneRosterMember & { formerNick?: string }; fromOrg: string | null } {
  const key = nick.toLowerCase();
  const variant = NICK_VARIANTS[key];
  const catalog = catalogByNick.get(key) ?? (variant ? catalogByNick.get(variant.toLowerCase()) : undefined);
  const card = catalog && catalog.year >= CATALOG_FROM_YEAR ? catalog : undefined;
  let here = current.get(key) ?? (variant ? current.get(variant.toLowerCase()) : undefined);
  let base = here?.member ?? archive.get(key) ?? (variant ? archive.get(variant.toLowerCase()) : undefined);
  // Xará na cena: a carta recente do catálogo tem outro país (o kaze do Havan Liberty é brasileiro; o da Rare Atom,
  // malaio). Vale a carta; o xará da cena perde a vaga para o nick ficar com um dono só.
  const cardCountry = card ? identityCountry(card.baseId) : null;
  const sceneOrg = here ? orgs.find((org) => org.id === here!.orgId) : undefined;
  const sameTeam = Boolean(card && sceneOrg && teamKey(card.teamId.replace(/-\d{4}$/, '')) === teamKey(sceneOrg.name));
  if (base && !base.catalogBaseId && base.country && cardCountry && base.country !== cardCountry && !sameTeam) {
    report.sceneHomonyms.push(`${nick}: ${base.country} na cena, ${cardCountry} na carta ${card!.baseId}`);
    here = undefined;
    base = undefined;
  }
  const catalogBaseId = base?.catalogBaseId ?? card?.baseId ?? null;
  if (catalogBaseId && !base?.catalogBaseId) report.catalogLinked.push(`${nick} → ${catalogBaseId}`);
  if (base) {
    report.knownPlayers += 1;
    const formerNick = base.nick !== nick ? base.nick : undefined;
    if (formerNick && formerNick.toLowerCase() !== key) report.variants.push(`${formerNick} → ${nick}`);
    const country = base.country ?? identityCountry(catalogBaseId) ?? identityCountry(base.nick) ?? identityCountry(nick);
    const member: SceneRosterMember & { formerNick?: string } = {
      nick,
      country,
      birthDate: base.birthDate,
      roles: [...base.roles],
      catalogBaseId,
      prospect: base.prospect,
      ...(formerNick ? { formerNick } : {})
    };
    return { member, fromOrg: here?.orgId ?? null };
  }
  report.newPlayers += 1;
  const country = identityCountry(catalogBaseId) ?? identityCountry(nick) ?? PROSPECT_COUNTRY.get(key) ?? null;
  return { member: { nick, country, birthDate: null, roles: [], catalogBaseId, prospect: null }, fromOrg: null };
}

/** Nível base de um time novo pelo ranking real (D11/D12). */
const levelForRank = (rank: number) => (rank <= 8 ? 0 : rank <= 16 ? 1 : rank <= 30 ? 2 : rank <= 60 ? 3 : 4);

/** Região de um time novo: a do país do núcleo; sem núcleo, a mais comum entre os países conhecidos do elenco e, sem
 *  nenhum país, a do circuito de onde os jogadores vieram (o país das orgs em que jogavam). */
function regionFor(name: string, roster: SceneRosterMember[], country: string | null, fromOrgs: string[]): Region {
  if (country) return regionOf(country);
  const vote = (regions: Region[]) => {
    const counts = new Map<Region, number>();
    for (const region of regions) counts.set(region, (counts.get(region) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  };
  const circuits = fromOrgs.flatMap((id) => {
    const org = orgs.find((other) => other.id === id);
    return org?.country ? [regionOf(org.country)] : [];
  });
  const best = vote(roster.flatMap((member) => (member.country ? [regionOf(member.country)] : []))) ?? vote(circuits);
  if (!best) report.regionGuessed.push(name);
  return best?.[0] ?? 'eu';
}

// Ids que já existem (coleta, planilha e aliases): o time novo nunca reaproveita um id de save antigo.
const usedIds = new Set<string>([
  ...orgs.map((org) => org.id),
  ...(rawScene as unknown as { orgs: Array<{ id: string }> }).orgs.map((org) => org.id),
  ...(rawSheet as unknown as { teams: Array<{ name: string }> }).teams.map((team) => `${slug(team.name)}-2026`)
]);
const newId = (name: string) => {
  const plain = `${slug(name)}-2026`;
  const id = usedIds.has(plain) ? `${slug(name)}-hltv-2026` : plain;
  if (usedIds.has(id)) throw new Error(`id repetido para ${name}: ${id}`);
  usedIds.add(id);
  return id;
};

const claimedNicks = new Map<string, string>();
const out: RealRankingTeam[] = [];
for (const team of teams) {
  const gameName = REBRANDS[team.name] ?? VARIANTS[team.name];
  const org = FORCE_NEW.has(team.name) ? undefined : gameName ? orgByName.get(gameName) : orgByKey.get(teamKey(team.name));
  if (gameName && !org) throw new Error(`org ${gameName} (para ${team.name}) não está na cena`);
  const roster: RealRankingTeam['roster'] = [];
  const fromOrgs: string[] = [];
  for (const nick of team.players) {
    const key = nick.toLowerCase();
    const owner = claimedNicks.get(key);
    if (owner) { report.homonyms.push(`${nick} (#${team.rank} ${team.name}): já está no #${owner}`); continue; }
    claimedNicks.set(key, `${team.rank} ${team.name}`);
    const { member, fromOrg } = memberFor(nick);
    if (member.formerNick) claimedNicks.set(member.formerNick.toLowerCase(), `${team.rank} ${team.name}`);
    if (fromOrg) fromOrgs.push(fromOrg);
    if (fromOrg && fromOrg !== org?.id) report.moved.push(`${nick}: ${orgs.find((other) => other.id === fromOrg)!.name} → ${team.name}`);
    roster.push(member);
  }
  const entry: RealRankingTeam = { rank: team.rank, name: team.name, points: team.points, change: team.change, orgId: '', roster };
  if (org) {
    entry.orgId = org.id;
    if (REBRANDS[team.name]) { entry.rename = team.name; report.renamed.push(`${org.name} → ${team.name} (${org.id})`); }
    else report.matched.push(`${team.name} = ${org.name} (${org.id})`);
    // Quem estava neste time e não está no elenco da HLTV nem em outro time do ranking sai do mundo.
    for (const member of org.roster) if (!member.generated) report.released.push(`${member.nick} (${org.name})`);
  } else {
    const country = orgNation(roster);
    entry.orgId = newId(team.name);
    entry.newOrg = { level: levelForRank(team.rank), country, region: regionFor(team.name, roster, country, fromOrgs) };
    report.added.push(`#${team.rank} ${team.name} (${entry.orgId}, nível ${entry.newOrg.level}, ${entry.newOrg.region})`);
  }
  out.push(entry);
}
// Saídas de verdade: quem estava num time do ranking e não foi para nenhum.
report.released = report.released.filter((label) => !claimedNicks.has(label.slice(0, label.lastIndexOf(' (')).toLowerCase()));

const file: RealRankingFile = {
  source: 'Ranking mundial da HLTV, novembro de 2026 (prints do dono; nicks da planilha jogadores-times.csv). Gerado por scripts/apply-hltv-ranking.ts.',
  teams: out,
  aliases: {}
};
writeFileSync(OUTPUT, `${JSON.stringify(file, null, 1)}\n`);

const verbose = process.env.VERBOSE === '1';
const list = (title: string, items: string[]) => console.log(`${title}: ${items.length}${verbose || items.length <= 40 ? `\n  ${items.join('\n  ')}` : ''}`);
list('Times casados por nome ou variante', report.matched);
list('Rebrands (id mantido)', report.renamed);
list('Times novos', report.added);
list('Jogadores que trocaram de time', report.moved);
list('Grafias antigas trocadas', report.variants);
list('Ligados ao catálogo', report.catalogLinked);
list('Xarás deixados de fora', report.homonyms);
list('Xarás da cena (vale a carta do catálogo)', report.sceneHomonyms);
list('Saíram do mundo (estavam num time do ranking e não aparecem em nenhum)', report.released);
list('Região sem país conhecido (Europa por padrão)', report.regionGuessed);
console.log(`Jogadores conhecidos: ${report.knownPlayers}; novos: ${report.newPlayers}`);
console.log(`Gravado: ${path.relative(ROOT, OUTPUT)}`);
