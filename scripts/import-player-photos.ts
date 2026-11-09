// scripts/import-player-photos.ts
// Fotos dos jogadores dos times do ranking mundial de novembro de 2026 (pacote do dono) para
// static/licensed/players/<chave>.webp, registradas em src/lib/data/licensed-images.json do mesmo jeito das fotos que
// já existiam (tipo `player`, chave = baseId do catálogo ou o nick em minúsculas, que é o que a carta procura).
//   npx tsx scripts/import-player-photos.ts <pasta-fotos-do-pacote>
// Arquivos do pacote: <Time_Com_Underscore>/<nick>_<id do jogador>.png (200x200). Casamento: pelo id do jogador no
// catálogo do jogo (hltvPlayerId) e, sem ele, pelo nick dentro do elenco do time na cena. Só entra quem está no elenco
// daquele time na cena (ou tem carta no catálogo pelo id): xará de outro time nunca leva a foto errada.
// Conversão: scripts/convert-player-photos.py (Pillow), WebP de 200px com até 15 KB. Jogador que já tinha foto
// registrada (de antes deste pacote) mantém a dele. Rodar de novo refaz só as entradas do pacote.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import rawPlayers from '../src/lib/data/cs/players.game.json';
import { realRanking, sceneOrgById } from '../src/lib/game/playerCareer/data';
import type { LicensedImageEntry, LicensedImagesFile } from '../src/lib/game/visuals/licensed';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACK = process.argv[2];
if (!PACK) throw new Error('uso: npx tsx scripts/import-player-photos.ts <pasta-fotos-do-pacote>');
const LICENSED = path.join(ROOT, 'src/lib/data/licensed-images.json');
const TARGET = 'licensed/players';
/** Marca das entradas deste pacote (o resto do arquivo não é tocado). */
const SOURCE = 'pacote do dono, ranking mundial 2026-11';

const file = JSON.parse(readFileSync(LICENSED, 'utf8')) as LicensedImagesFile;
const ours = (entry: LicensedImageEntry) => entry.attribution.includes(SOURCE);
for (const entry of file.entries.filter((candidate) => candidate.kind === 'player' && ours(candidate))) rmSync(path.join(ROOT, 'static', entry.file), { force: true });
const kept = file.entries.filter((entry) => !(entry.kind === 'player' && ours(entry)));
const taken = new Set(kept.map((entry) => `${entry.kind}:${entry.key}`));

const folderKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const teamByFolder = new Map(realRanking.teams.map((team) => [folderKey(team.name), team]));
const catalogByHltv = new Map<string, string>();
for (const player of rawPlayers as Array<{ hltvPlayerId?: number | string | null; baseId?: string }>) {
  if (player.hltvPlayerId && player.baseId) catalogByHltv.set(String(player.hltvPlayerId), player.baseId.toLowerCase());
}
/** Nome de arquivo seguro para a chave ("tier0 s" vira "tier0-s"). */
const fileSlug = (key: string) => key.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'jogador';

interface Photo { src: string; key: string; rank: number; label: string }
const photos = new Map<string, Photo>();
const report = { matched: 0, byId: 0, kept: [] as string[], unmatched: [] as string[], duplicates: [] as string[] };
for (const folder of readdirSync(PACK).sort()) {
  const team = teamByFolder.get(folderKey(folder));
  if (!team) throw new Error(`pasta ${folder} não é um time do ranking`);
  const org = sceneOrgById.get(team.orgId)!;
  for (const name of readdirSync(path.join(PACK, folder)).sort()) {
    const match = /^(.+)_(\d+)\.png$/.exec(name);
    if (!match) continue;
    // O pacote troca espaço por "_" no nome do arquivo ("Temny_Prince" é o Temny Prince).
    const [, fileNick, hltvId] = match;
    const nick = fileNick.replace(/_/g, ' ');
    const catalog = catalogByHltv.get(hltvId);
    const member = org.roster.find((candidate) => !candidate.generated && ((catalog && candidate.catalogBaseId?.toLowerCase() === catalog) || [nick, fileNick].some((spelling) => candidate.nick.toLowerCase() === spelling.toLowerCase())));
    const key = member ? (member.catalogBaseId ?? member.nick).toLowerCase() : catalog;
    const label = `${nick} (${team.name})`;
    if (!key) { report.unmatched.push(label); continue; }
    if (catalog && key === catalog) report.byId += 1;
    if (taken.has(`player:${key}`)) { report.kept.push(label); continue; }
    const seen = photos.get(key);
    // Mesmo jogador em duas pastas: vale a do time em que ele joga na cena (senão, a do melhor ranking).
    if (seen && (!member || seen.rank < team.rank)) { report.duplicates.push(`${label}: fica ${seen.label}`); continue; }
    if (seen) report.duplicates.push(`${seen.label}: fica ${label}`);
    photos.set(key, { src: path.join(PACK, folder, name), key, rank: member ? 0 : team.rank, label });
  }
}

const used = new Set<string>();
const jobs: Array<{ src: string; dst: string }> = [];
const added: LicensedImageEntry[] = [];
for (const photo of [...photos.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  let slug = `${fileSlug(photo.key)}-2026`;
  for (let index = 2; used.has(slug); index += 1) slug = `${fileSlug(photo.key)}-2026-${index}`;
  used.add(slug);
  const target = `${TARGET}/${slug}.webp`;
  jobs.push({ src: photo.src, dst: path.join(ROOT, 'static', target) });
  added.push({
    kind: 'player',
    key: photo.key,
    file: target,
    license: {
      holder: 'N/A — sem permissão concedida pelo jogador',
      type: 'fair use editorial / figura pública, sem consentimento',
      scope: 'Identificação visual do jogador no contexto da própria carreira competitiva; não implica endosso nem afiliação',
      grantedAt: '2026-11-09',
      evidence: 'player-photos-fair-use-basis.md'
    },
    attribution: `Foto do jogador em contexto competitivo, uso editorial sem consentimento · ${SOURCE}`
  });
}
report.matched = added.length;

const result = JSON.parse(execFileSync('python3', [path.join(ROOT, 'scripts/convert-player-photos.py')], { input: JSON.stringify(jobs), maxBuffer: 1 << 20 }).toString()) as { count: number; bytes: number; largest: number };
writeFileSync(LICENSED, `${JSON.stringify({ ...file, entries: [...kept, ...added] }, null, 2)}\n`);

const list = (title: string, items: string[]) => console.log(`${title}: ${items.length}${items.length && (process.env.VERBOSE === '1' || items.length <= 30) ? `\n  ${items.join('\n  ')}` : ''}`);
console.log(`Fotos novas: ${report.matched} (${report.byId} pelo id do catálogo); ${result.count} WebP, ${(result.bytes / 1024 / 1024).toFixed(2)} MB, maior ${(result.largest / 1024).toFixed(1)} KB`);
list('Jogador que já tinha foto (mantida)', report.kept);
list('Sem jogador na cena nem carta pelo id (fica sem foto)', report.unmatched);
list('Mesmo jogador em duas pastas', report.duplicates);
