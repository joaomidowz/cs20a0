// scripts/build-changelog.mjs
// A versão do jogo e o changelog, tirados do próprio histórico do git.
//
// A versão anda um décimo a cada dez commits (dez commits = 0.1), como o dono pediu: com 299 commits o jogo está
// na 2.9 e o commit 300 abre a 3.0.
//
// Roda à mão (`npm run changelog`) e o resultado é COMMITADO. Não dá para gerar no build da Vercel: ela clona o
// repositório raso, e `git log` lá não enxerga o histórico inteiro.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

/** Commits por décimo de versão. */
const COMMITS_PER_STEP = 10;
/** O changelog mostra as notas mais recentes; o resto vira "e mais N mudanças". */
const ENTRIES_SHOWN = 120;

const versionOf = (count) => (Math.floor(count / COMMITS_PER_STEP) / 10).toFixed(1);

// Do mais antigo para o mais novo, para o número da versão crescer junto com o histórico.
const raw = git('log', '--no-merges', '--reverse', '--date=short', '--pretty=%H%x1f%ad%x1f%s%x1f%b%x1e').split('\x1e');
const commits = raw.map((block) => block.trim()).filter(Boolean).map((block) => {
  const [hash, date, subject, body] = block.split('\x1f');
  return { hash, date, subject, body: (body ?? '').trim() };
});

/** Linhas de rodapé de commit (assinaturas, sessões, e-mails) que não são nota de release. */
const TRAILER_LINE = /^(co-authored-by|claude-session|signed-off-by|generated with|refs|reviewed-by|🤖)/i;

/** O título e a frase de cada nota: o assunto do commit sem o prefixo, e a primeira frase do corpo sem trailers. */
function noteOf(commit) {
  const withoutType = commit.subject.replace(/^(feat|fix|chore|docs|test|refactor|perf|style|balance|merge)(\([^)]*\))?:\s*/i, '');
  const title = withoutType.charAt(0).toUpperCase() + withoutType.slice(1);
  const bodyWithoutTrailers = commit.body.split('\n').filter((line) => line.trim() && !TRAILER_LINE.test(line.trim()) && !/^https:\/\/claude\.ai\//.test(line.trim())).join('\n');
  const firstParagraph = bodyWithoutTrailers.split('\n\n')[0]?.replace(/\n/g, ' ').trim() ?? '';
  const sentence = firstParagraph.split(/(?<=\.)\s/)[0] ?? '';
  return { title, summary: sentence.length > 240 ? `${sentence.slice(0, 237)}…` : sentence };
}

const entries = commits.map((commit, index) => ({
  version: versionOf(index + 1),
  date: commit.date,
  hash: commit.hash.slice(0, 7),
  ...noteOf(commit)
}));

const version = versionOf(commits.length);
const shown = entries.slice(-ENTRIES_SHOWN).reverse();
const payload = { version, total: commits.length, generatedAt: new Date().toISOString().slice(0, 10), entries: shown };
writeFileSync(join(root, 'src/lib/data/changelog.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`changelog: versão ${version} (${commits.length} commits, ${shown.length} notas)`);
