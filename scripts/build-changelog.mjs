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
  // Anotação interna do changelog: mudanças seguintes ainda não estavam prontas para publicar.
  '85dbb7a28ef172ec6197e279c5341227cb226d6d',
  // Isenção de ranking da conta do dono: interna por decisão dele, nunca vira nota para o jogador.
  'f74bb3ee81008cf203cb3e5b8df0a08f027e024c'
]);
const isMetaCommit = (commit) => META_HASHES.has(commit.hash) || /^chore\(changelog\):/.test(commit.subject);

function noteOf(commit) {
  // Notas públicas aprovadas: manter os textos nas próximas regenerações.
  const pinned = {
    '3c4b0bb': {
      title: 'Links promocionais: coins para os primeiros a entrar',
      summary: 'Fique de olho nos stories: cada link promocional dá um bônus de coins para as primeiras contas que entrarem por ele, com as vagas mostradas na hora. O bônus soma às boas-vindas e cai na carteira assim que o login termina.'
    },
    '1539d0c': {
      title: 'Overall colorido só nas miniaturas do celular',
      summary: 'No celular a miniatura das cartas mostra o overall em um chip na cor da raridade; no desktop o número volta ao verde de sempre.'
    },
    '822321d8e213cce1609ab498b2536dbb3700d80e': {
      title: 'Fila Draft: pool mais forte, dicas de sinergia, deck no celular e coaches disputados',
      summary: 'O pool do snake agora traz só cartas fortes (2 GOATs, 3 Legends, 4 Superstars e 3 Elites por jogador) e a diferença entre os times vem da sinergia: durante o draft a sua line mostra o que falta e os temas que se formam, e cada carta do pool diz o que acrescentaria. No celular a navbar dá lugar a um deck fixo com as cinco vagas e uma barra de turno fixa mostra quem escolhe. Os coaches viraram um pool compartilhado de nove para a sala: quem contrata primeiro leva. A tela final da Fila Draft passa a mostrar coins, caixa, prêmios e pontos como a fila competitiva, e o overall das cartas ganhou um chip na cor da raridade.'
    },
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
    },
    'f3d708d7e300fcf0d7a4d3d002a7fbfd609c37af': {
      title: 'Pontuação da Season nova: toda partida conta e dominação paga',
      summary: 'Acabou o limite de 10 melhores por dia: agora toda partida ranqueada pontua (da 11ª do dia em diante vale metade). Campeão pontua mais (12), sair no suíço antes das quartas custa pontos, e mapa de 13 a 0 e série vencida sem perder mapa dão bônus.'
    },
    'dbbccf99fc9d1714f3bd60d05796c9f0f0e6514d': {
      title: 'Boost de Farm: 10 majors por dia sem ficar online',
      summary: 'Uma vez por dia, ative o boost na página do online e o servidor joga 10 majors com seu time salvo na hora — dá para fechar o jogo. Coins pela metade (como o solo) e missões de solo contam, mas NÃO vale ponto de temporada. Quer mais? Ative 20 majors por 3.000 coins.'
    },
    '93189983fa3b2c09926b94f4279b8b678d6390f0': {
      title: 'Boost de Farm agora é item da Loja, com interruptor no Solo',
      summary: 'Compre o item Boost de Farm na Loja por 4.500 coins (quantos quiser, fica de estoque) e ligue o interruptor abaixo dos botões de Solo: aí cada Major que você iniciar resolve 10 na hora, sem assistir, gastando 1 item. Time forte lucra mais do que gasta; o uso tem teto diário de 30 majors.'
    },
    '63613fde6bc7ccac47eb64cf5d59b40867cf83a0': {
      title: 'Planos de jogo rebalanceados: o meta fica plano',
      summary: 'Todos os seis planos de jogo foram recalibrados no motor real: o Tático voltou a ser opção (o coach agora define o estudo e a pausa tática forte vale em qualquer fila), o Agressivo tem dia bom em ~43% dos dias e não desmorona mais no dia ruim, o Equilibrado joga melhor as pistolas e converte a começada, e o Resiliente continua mortal em série longa — sem dominar tudo: nenhum confronto entre planos passa de 55% de chance.'
    },
    '6597df2e46c2062741098f798da19f6bc0e14823': {
      title: 'Nevasca do Agressivo e o antídoto da zebra (em testes)',
      summary: 'Ajustes competitivos em desenvolvimento: o Agressivo que engata 5+ rounds seguidos ganha o dobro de pressão, e um mapa vencido com 6+ seguidos carrega bônus para o próximo mapa da série — menos sorte, mais sequência construída. O Equilibrado virou o antídoto do Resiliente: contra ele, os trunfos de comeback (zebra, clutch, decididor e momentum) não disparam.'
    },
    '73add0b5f236b1b9bcd59144cbb37aa0d11fe0c3': {
      title: 'Poder, escalação, bots e coins rebalanceados',
      summary: 'Removemos o piso de 85 e o corte em 99: a nota agora acompanha o poder real até 99,9. Ajustamos os bônus e custos da escalação, incluímos a vaga IGL-Suporte, recalibramos os bots e aumentamos os prêmios do ranqueado (2,5×) e do Solo dos Campeões (4×).'
    },
    '25a94ec1d1c87cc57c64e9f1c8153a23914145c6': {
      title: 'Correção nos prêmios do Boost e na função de flusha',
      summary: 'Corrigimos a publicação dos prêmios do Boost e a função de flusha.'
    },
    '22c0c43defe84eed43711f83478de871ae0260bc': {
      title: 'Raridade GOAT de olofmeister restaurada',
      summary: 'Restauramos a raridade GOAT de olofmeister em 2015.'
    },
    '1217445cd449ebd4314359b66c3be73237a8b477': {
      title: 'Raridades históricas ajustadas',
      summary: 'Ajustamos as raridades de jogadores entre 2013 e 2015.'
    },
    '5d1556e7933129009051b1fc63d2e834f7ac69e8': {
      title: 'Overalls de f0rest e GeT_RiGhT atualizados',
      summary: 'Atualizamos os overalls de f0rest e GeT_RiGhT na temporada de 2014.'
    },
    '877444536f3fd2784ea5e7b89f021bf3ad2ed1db': {
      title: 'Funções de jogadores históricos corrigidas',
      summary: 'Corrigimos funções de jogadores no catálogo histórico.'
    },
    'fe3d9ecbf64c1709bec7ec479f0c47354ef69446': {
      title: 'Correção do voto de velocidade da final',
      summary: 'Corrigimos a votação da velocidade da final na fila rápida.'
    },
    '86b52226ac3acde49d9d2acdf9fe728be8c0e2a0': {
      title: 'Controles de Solo movidos para a partida',
      summary: 'Os controles de velocidade e voto da final agora ficam dentro da partida Solo.'
    },
    '772ca765cda4595adf87bd1e62c62cace822bb93': {
      title: 'Velocidade do Solo e voto da final configuráveis',
      summary: 'Adicionamos controles para a velocidade do Solo e a votação da final.'
    },
    '4efd54881f80e6bce288f4281665b435dff3ff75': {
      title: 'Confrontos entre planos explicados na wiki',
      summary: 'Esclarecemos como os planos de jogo se enfrentam no guia.'
    },
    '50d7078b4f3f797b974d394da4db67c5e2132ea9': {
      title: 'Wiki do jogo em três idiomas',
      summary: 'Publicamos uma wiki concisa em português, inglês e espanhol.'
    },
    '07887f82a7011698a4b2b84513bc0e5c44d2cf0e': {
      title: 'Correção da atualização de escalações salvas',
      summary: 'A escalação agora é atualizada corretamente depois de salvar as alterações.'
    },
    'f7d3a640f6266efcc7be9fd2b4897556c6189e76': {
      title: 'Correção de funções múltiplas do b1t',
      summary: 'Limitamos a alteração de funções múltiplas ao b1t, sem mudar outros jogadores.'
    },
    '63228f00e5b7aea74bf0d2dc66baca073957f578': {
      title: 'Funções secundárias respeitadas',
      summary: 'O jogo agora considera as funções secundárias registradas para cada jogador.'
    },
    // Notas de 2026-09-27/28 (chaves curtas: o hash completo é resolvido por prefixo abaixo).
    '85afe64': {
      title: 'Filtros de times, dia bom do Agressivo e contratos de cartas',
      summary: 'A página de times ganhou filtros combináveis por país, ano e organização. A coleção, o montador, o Upgrader e os Contratos filtram cartas por organização. Elencos mais consistentes aumentam a frequência de dia bom do Agressivo. No online, repetidas viram fragmentos para trade-ups e contratos de Lenda.'
    },
    '15e8113': {
      title: 'Animações e sons: o jogo responde ao que acontece',
      summary: 'Fila com radar e aviso de partida encontrada, sons de mapa e série decididos, campeão e eliminado, Upgrader e trade-up com vitória e derrota, pacotes com tremor, tampa e tensão de lenda e GOAT, poder do time deslizando no montador e avisos no canto superior. Botões respondem ao toque e o movimento reduzido do sistema é respeitado.'
    },
    '10c7b13': {
      title: 'Rating 3.0 nas partidas online, loading entre telas e chamada de conta',
      summary: 'As estatísticas do online passam a mostrar Rating 3.0 com Round Swing, KAST, assistências, trocas e multi-kills, calculados no servidor com a média do campo inteiro. A nota só explica o desempenho: não muda chance de vitória, coins nem pontos. A fila ganhou um radar único, as trocas de tela mostram o radar da home e a home destaca a entrada na conta.'
    }
  };
  if (pinned[commit.hash]) return pinned[commit.hash];
  const pinnedByPrefix = Object.keys(pinned).find((key) => key.length < 40 && commit.hash.startsWith(key));
  if (pinnedByPrefix) return pinned[pinnedByPrefix];
  if (isMetaCommit(commit)) return { title: '', summary: '' };
  const withoutType = commit.subject.replace(/^(feat|fix|chore|docs|test|refactor|perf|style|balance|merge)(\([^)]*\))?:\s*/i, '');
  const title = withoutType.charAt(0).toUpperCase() + withoutType.slice(1);
  const bodyWithoutTrailers = commit.body.split('\n').filter((line) => line.trim() && !TRAILER_LINE.test(line.trim()) && !/^https:\/\/claude\.ai\//.test(line.trim())).join('\n');
  const firstParagraph = bodyWithoutTrailers.split('\n\n')[0]?.replace(/\n/g, ' ').trim() ?? '';
  const sentence = firstParagraph.split(/(?<=\.)\s/)[0] ?? '';
  return { title, summary: sentence.length > 240 ? `${sentence.slice(0, 237)}…` : sentence };
}

const entries = commits.filter((commit) => !isMetaCommit(commit)).map((commit, index) => ({
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
