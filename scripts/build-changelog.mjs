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
/** Commits de controle do changelog (registrando notas) não são nota de release para o jogador. */
const META_HASHES = new Set([
  '09399779cba8dd1ddf2b52f84f03bb96e2dcb1de',
  '2f07056d7f008d633781099d9edbb29c3601e394',
  // Isenção de ranking da conta do dono: interna por decisão dele, nunca vira nota para o jogador.
  'f74bb3ee81008cf203cb3e5b8df0a08f027e024c'
]);

function noteOf(commit) {
  // Notas públicas aprovadas: manter os textos nas próximas regenerações.
  const pinned = {
    '659c2b6f4f577cf67ee94f39e7ff77be81e1e41f': {
      title: 'Hotfix: economia das caixas e venda de cartas',
      summary: 'Venda de jogadores e coaches ajustada para 40% do valor da carta; caixa Ouro a 12.000 coins e Prata a 5.000 coins para corrigir o lucro médio no ciclo de abrir, vender e recomprar.'
    },
    'ce52c6fa6fd85f1730e0f6897448d8c5101f3ef6': {
      title: 'Nova marca visual e modo app',
      summary: 'Ícone, favicon e imagem de compartilhamento renovados com a marca CS, e o jogo agora pode ser instalado como aplicativo na tela inicial do celular; links compartilhados mostram o banner novo.'
    },
    '808b51b4d28715693a64917dc4de8be952059093': {
      title: 'Menu estilizado no Time e entrada mais leve no online',
      summary: 'Função, coach e filtros do Time agora abrem em menu no estilo do jogo; quem está com conta entra no online já com seu nick e organização (sem digitar), o toggle do time da coleção virou chave on/off ao lado do Criar sala, e o card de buscar partida ficou compacto com o detalhe no botão de interrogação.'
    },
    '1023bbf0ec48d4ecf9334b5835c1079a83c188bf': {
      title: 'Login por código de 6 dígitos, além do link',
      summary: 'O e-mail de acesso passa a trazer um código que dá para digitar na tela de login quando o link não abre o jogo — vale no celular, no app instalado e em qualquer navegador.'
    },
    'd84c27502bfd6bbfa584368a9dc5e7268e821612': {
      title: 'Caixa do Major: prêmio pela colocação nas patentes do CS',
      summary: 'Todo Major ranqueado com o time da coleção (2+ jogadores) lacra uma caixa pela colocação final — 5º–8º Prata, 3º–4º Ouro, vice Supremo e campeão Global — e todas abrem no pé da Loja, com um aviso explicando o prêmio.'
    }
  };
  if (pinned[commit.hash]) return pinned[commit.hash];
  if (META_HASHES.has(commit.hash)) return { title: '', summary: '' };
  const withoutType = commit.subject.replace(/^(feat|fix|chore|docs|test|refactor|perf|style|balance|merge)(\([^)]*\))?:\s*/i, '');
  const title = withoutType.charAt(0).toUpperCase() + withoutType.slice(1);
  const bodyWithoutTrailers = commit.body.split('\n').filter((line) => line.trim() && !TRAILER_LINE.test(line.trim()) && !/^https:\/\/claude\.ai\//.test(line.trim())).join('\n');
  const firstParagraph = bodyWithoutTrailers.split('\n\n')[0]?.replace(/\n/g, ' ').trim() ?? '';
  const sentence = firstParagraph.split(/(?<=\.)\s/)[0] ?? '';
  return { title, summary: sentence.length > 240 ? `${sentence.slice(0, 237)}…` : sentence };
}

const entries = commits.filter((commit) => !META_HASHES.has(commit.hash)).map((commit, index) => ({
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
