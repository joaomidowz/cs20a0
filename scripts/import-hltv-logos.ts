// scripts/import-hltv-logos.ts
// Logos dos times do ranking mundial de novembro de 2026 (pacote do dono) para static/licensed/orgs/<id da org>.<ext>,
// registradas em src/lib/data/licensed-images.json do mesmo jeito das logos que já existiam (chave = crestKey do nome
// da org na cena, uso nominativo com a base em docs/permissions/granted/fair-use-basis.md).
//   npx tsx scripts/import-hltv-logos.ts <pasta-logos-do-pacote>
// Arquivos do pacote: NNN_Nome.ext (NNN = posição no ranking). Variantes `_escura` (fundo escuro) e `_clara` (fundo
// claro): o escudo do jogo mostra uma imagem só e o tema padrão é escuro, então vale a `_escura`. Os ".png" do pacote
// são WebP: o arquivo é copiado com a extensão do formato real. SVG com script, evento ou link externo fica de fora.
// Org que já tinha logo registrada (de antes deste pacote) mantém a dela. Rodar de novo refaz só as entradas do pacote.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { realRanking, sceneOrgById } from '../src/lib/game/playerCareer/data';
import { crestKey } from '../src/lib/game/visuals/crest';
import type { LicensedImageEntry, LicensedImagesFile } from '../src/lib/game/visuals/licensed';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACK = process.argv[2];
if (!PACK) throw new Error('uso: npx tsx scripts/import-hltv-logos.ts <pasta-logos-do-pacote>');
const LICENSED = path.join(ROOT, 'src/lib/data/licensed-images.json');
const TARGET = path.join(ROOT, 'static/licensed/orgs');
/** Marca das entradas deste pacote (o resto do arquivo não é tocado). */
const SOURCE = 'pacote do dono, ranking mundial 2026-11';

const file = JSON.parse(readFileSync(LICENSED, 'utf8')) as LicensedImagesFile;
const ours = (entry: LicensedImageEntry) => entry.kind === 'org' && entry.attribution.includes(SOURCE);
const kept = file.entries.filter((entry) => !ours(entry));
const taken = new Set(kept.map((entry) => `${entry.kind}:${entry.key}`));

const packFiles = readdirSync(PACK).sort();
/** Formato real pelo começo do arquivo. */
function formatOf(bytes: Buffer): 'webp' | 'png' | 'svg' | null {
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  const head = bytes.subarray(0, 512).toString('utf8');
  return /<svg[\s>]/i.test(head) || /<\?xml/i.test(head) ? 'svg' : null;
}
/** SVG seguro para <img>: sem script, sem evento e sem imagem ou link fora do próprio arquivo. */
function unsafeSvg(text: string): string | null {
  if (/<script/i.test(text)) return 'script';
  if (/\son[a-z]+\s*=/i.test(text)) return 'evento';
  const links = [...text.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)].map((match) => match[1]);
  const outside = links.find((link) => !link.startsWith('#') && !link.startsWith('data:'));
  return outside ? `link externo (${outside})` : null;
}

const added: LicensedImageEntry[] = [];
const report = { added: [] as string[], kept: [] as string[], missing: [] as string[], rejected: [] as string[] };
mkdirSync(TARGET, { recursive: true });
for (const team of realRanking.teams) {
  const org = sceneOrgById.get(team.orgId);
  if (!org) throw new Error(`org ${team.orgId} (${team.name}) não está na cena`);
  const prefix = `${String(team.rank).padStart(3, '0')}_`;
  const candidates = packFiles.filter((name) => name.startsWith(prefix));
  const chosen = candidates.find((name) => /_escura\.[a-z]+$/i.test(name)) ?? candidates.find((name) => !/_(clara|escura)\.[a-z]+$/i.test(name)) ?? candidates[0];
  if (!chosen) { report.missing.push(`#${team.rank} ${team.name}`); continue; }
  const key = crestKey({ name: org.name });
  if (taken.has(`org:${key}`)) { report.kept.push(`#${team.rank} ${org.name} (${key})`); continue; }
  const bytes = readFileSync(path.join(PACK, chosen));
  const format = formatOf(bytes);
  const problem = format === null ? 'formato desconhecido' : format === 'svg' ? unsafeSvg(bytes.toString('utf8')) : null;
  if (problem) { report.rejected.push(`#${team.rank} ${team.name} (${chosen}): ${problem}`); continue; }
  if (bytes.length > 100 * 1024) { report.rejected.push(`#${team.rank} ${team.name} (${chosen}): ${Math.round(bytes.length / 1024)} KB`); continue; }
  const target = `licensed/orgs/${org.id}.${format}`;
  copyFileSync(path.join(PACK, chosen), path.join(ROOT, 'static', target));
  taken.add(`org:${key}`);
  added.push({
    kind: 'org',
    key,
    file: target,
    license: {
      holder: 'N/A — sem permissão concedida pela organização',
      type: 'fair use / uso nominativo, sem afiliação',
      scope: 'Identificação visual da organização no cs13a0; não implica endosso, patrocínio ou afiliação',
      grantedAt: '2026-11-09',
      evidence: 'fair-use-basis.md'
    },
    attribution: `Logo da organização, uso nominativo sem afiliação · ${SOURCE}`
  });
  report.added.push(`#${team.rank} ${org.name} → ${target}`);
}

writeFileSync(LICENSED, `${JSON.stringify({ ...file, entries: [...kept, ...added] }, null, 2)}\n`);
const list = (title: string, items: string[]) => console.log(`${title}: ${items.length}${items.length && (process.env.VERBOSE === '1' || items.length <= 30) ? `\n  ${items.join('\n  ')}` : ''}`);
list('Logos novas', report.added);
list('Org que já tinha logo (mantida)', report.kept);
list('Sem arquivo no pacote (fica o escudo gerado)', report.missing);
list('Recusadas', report.rejected);
