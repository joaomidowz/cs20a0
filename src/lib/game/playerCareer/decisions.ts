// src/lib/game/playerCareer/decisions.ts
// A matriz de decisões do CS2: as 10 situações originais de cada função (trazidas pelo dono do jogo), mais 35
// extras por função e 60 gerais (situations.ts). Cada função sorteia de mais de 100 situações.
// Cada alternativa tem um PERFIL de consequência que vira edge de probabilidade no round decisivo — o RNG
// do motor decide o round; a leitura certa inclina a moeda. Os textos são da matriz, verbatim.
import { createSeededRng } from '../simulation';
import type { PlayerRole } from './engine';
import { EXTRA_ROWS, SHARED_ROWS, type SituationRow } from './situations';

/** Como cada decisão inclina o round: disciplinada, leitura de jogo, aposta ou jogo de time. */
export type ClutchProfile = 'solid' | 'read' | 'gamble' | 'team';

export interface ClutchAlternative {
  text: string;
  profile: ClutchProfile;
}

export interface ClutchSituation {
  id: string;
  /** Função dona da situação ('any' nas gerais; o sorteio devolve com a função de quem joga). */
  role: PlayerRole | 'any';
  text: string;
  alternatives: [ClutchAlternative, ClutchAlternative, ClutchAlternative];
}

const build = (role: PlayerRole | 'any', rows: SituationRow[], offset = 0): ClutchSituation[] =>
  rows.map(([text, a, b, c], index) => ({
    id: `${role === 'any' ? 'all' : role}-${offset + index + 1}`,
    role,
    text,
    alternatives: [
      { text: a[0], profile: a[1] },
      { text: b[0], profile: b[1] },
      { text: c[0], profile: c[1] }
    ]
  }));

const BASE_MATRIX: Record<PlayerRole, ClutchSituation[]> = {
  awper: build('awper', [
    ['Errou o primeiro tiro de AWP', ['Recuar e reposicionar', 'solid'], ['Reabrir o mesmo ângulo', 'read'], ['Trocar para pistola e lutar', 'gamble']],
    ['Conseguiu a primeira kill', ['Avançar e conquistar espaço', 'gamble'], ['Reposicionar e segurar outro ângulo', 'solid'], ['Continuar na mesma posição', 'read']],
    ['Uma smoke bloqueou sua visão', ['Aguardar a smoke acabar', 'solid'], ['Rotacionar para outro ângulo', 'team'], ['Atravessar com flash e apoio', 'read']],
    ['Seu time está perdendo por 3v5', ['Buscar uma pick agressiva', 'gamble'], ['Jogar defensivamente', 'solid'], ['Agrupar com um companheiro', 'team']],
    ['Três inimigos estão entrando no bombsite', ['Buscar uma kill e recuar', 'read'], ['Segurar o bombsite', 'solid'], ['Abandonar e jogar retake', 'team']],
    ['Uma AWP inimiga domina o meio', ['Desafiar o duelo com flash', 'read'], ['Usar smoke para bloquear', 'team'], ['Buscar outro ângulo', 'solid']],
    ['Sua equipe está entrando no bombsite', ['Cobrir o entry', 'team'], ['Buscar uma pick antes da entrada', 'read'], ['Avançar junto com o grupo', 'solid']],
    ['Você está em clutch 1v2', ['Isolar duelos individuais', 'read'], ['Jogar pelo tempo', 'solid'], ['Reposicionar silenciosamente', 'gamble']],
    ['Faltam 20 segundos para entrar', ['Cobrir a execução', 'team'], ['Avançar junto com o entry', 'solid'], ['Procurar outra pick', 'gamble']],
    ['Round perdido e AWP muito cara', ['Salvar a arma', 'solid'], ['Tentar recuperar o round', 'gamble'], ['Buscar eliminações de saída', 'read']]
  ]),
  lurker: build('lurker', [
    ['Está sozinho no lado oposto ao time', ['Segurar o flanco', 'solid'], ['Avançar silenciosamente', 'read'], ['Fazer barulho para atrair CTs', 'gamble']],
    ['Escuta dois CTs rotacionando', ['Seguir e eliminar um deles', 'read'], ['Avançar para o espaço vazio', 'solid'], ['Avisar e aguardar outra rotação', 'team']],
    ['Um CT está bloqueando sua passagem', ['Esperar distração', 'solid'], ['Usar flash e enfrentar', 'read'], ['Abandonar a rota', 'team']],
    ['Seu time executa A e você está B', ['Segurar a rotação pelo meio', 'solid'], ['Entrar pelas costas do A', 'read'], ['Fingir pressão em B', 'gamble']],
    ['Encontrou um inimigo de costas', ['Eliminar imediatamente', 'solid'], ['Esperar outro inimigo aparecer', 'read'], ['Ignorar e buscar posição melhor', 'team']],
    ['Seu time perdeu dois jogadores', ['Agrupar com os sobreviventes', 'team'], ['Continuar lurkando', 'read'], ['Avançar para tentar compensar', 'gamble']],
    ['Bomba plantada do lado oposto', ['Cortar a rotação', 'read'], ['Reagrupar no bombsite', 'team'], ['Ficar escondido para punir retake', 'gamble']],
    ['Sua posição foi descoberta', ['Reposicionar', 'solid'], ['Recuar completamente', 'team'], ['Enfrentar o CT', 'gamble']],
    ['Você está sozinho em 1v3', ['Buscar eliminações isoladas', 'read'], ['Rotacionar silenciosamente', 'solid'], ['Criar distrações', 'gamble']],
    ['Inimigos pressionam constantemente o meio', ['Esperar e punir avanço', 'read'], ['Pedir apoio para dominar o meio', 'team'], ['Explorar outra região', 'solid']]
  ]),
  entry: build('entry', [
    ['Vai entrar no bombsite', ['Entrar com flash', 'team'], ['Abrir em contato silencioso', 'read'], ['Pedir utilitário para limpar posições', 'solid']],
    ['Encontrou dois CTs durante a entrada', ['Focar ameaça imediata', 'read'], ['Buscar cobertura para receber trade', 'team'], ['Continuar movimentando para criar espaço', 'gamble']],
    ['Recebeu flash inimiga', ['Virar e continuar quando possível', 'read'], ['Recuar e esperar', 'solid'], ['Buscar cobertura e pedir contra-flash', 'team']],
    ['O segundo jogador está distante', ['Esperar o companheiro', 'solid'], ['Entrar sozinho', 'gamble'], ['Cancelar a execução', 'team']],
    ['Eliminou o primeiro defensor', ['Continuar avançando', 'read'], ['Segurar espaço conquistado', 'solid'], ['Deixar o segundo jogador ultrapassar', 'team']],
    ['Há uma smoke na entrada', ['Esperar desaparecer', 'solid'], ['Atravessar com flash', 'read'], ['Trocar a rota', 'team']],
    ['Seu time chamou rush', ['Entrar imediatamente', 'gamble'], ['Abrir espaço para o segundo entry', 'team'], ['Usar flash rápida antes do contato', 'read']],
    ['Está com 15 HP antes da execução', ['Continuar como primeiro contato', 'gamble'], ['Virar support', 'solid'], ['Fazer distração', 'team']],
    ['Está defendendo e recebe pressão', ['Buscar kill e recuar', 'read'], ['Atrasar com utilitários', 'team'], ['Preparar crossfire', 'solid']],
    ['Entrou em um bombsite vazio', ['Limpar posições escondidas', 'read'], ['Avançar para cortar rotações', 'solid'], ['Proteger o plant', 'team']]
  ]),
  support: build('support', [
    ['Entry prepara entrada', ['Jogar flash', 'team'], ['Jogar smoke', 'solid'], ['Acompanhar para trade', 'read']],
    ['Entry morreu entrando', ['Tentar trade imediato', 'read'], ['Usar utilitário para bloquear CT', 'team'], ['Reagrupar o ataque', 'solid']],
    ['Você tem uma flash restante', ['Guardar para pós-plant', 'solid'], ['Usar na execução', 'read'], ['Guardar para salvar companheiro', 'team']],
    ['Bomba plantada', ['Guardar molotov para defuse', 'solid'], ['Segurar crossfire', 'team'], ['Usar utilitário para atrasar retake', 'read']],
    ['Companheiro está preso', ['Flash para ajudar a sair', 'solid'], ['Smoke de proteção', 'team'], ['Avançar para dividir atenção', 'gamble']],
    ['Time prepara retake', ['Flash coordenada', 'team'], ['Smoke ou molotov para isolar posições', 'solid'], ['Entrar garantindo trade', 'read']],
    ['Está sozinho no bombsite CT', ['Molotov para atrasar', 'solid'], ['Smoke e pedir rotação', 'team'], ['Segurar posição segura', 'read']],
    ['Perderam controle do meio', ['Usar utilitários para recuperar', 'team'], ['Ajudar companheiro a disputar', 'solid'], ['Reforçar outro bombsite', 'read']],
    ['AWPer deseja disputar ângulo', ['Flash para ele', 'team'], ['Smoke para facilitar recuo', 'solid'], ['Acompanhar para trade', 'read']],
    ['Inimigos fazem rush', ['Molotov para parar', 'solid'], ['Smoke para bloquear', 'team'], ['Flash de contra-ataque', 'read']]
  ]),
  rifler: build('rifler', [
    ['Encontrou inimigo a média distância', ['Parar e buscar headshot', 'read'], ['Atirar em rajadas curtas', 'gamble'], ['Recuar para outro duelo', 'solid']],
    ['Está em 2v2 pós-plant', ['Jogar próximo para trade', 'team'], ['Criar crossfire', 'solid'], ['Avançar para surpreender', 'gamble']],
    ['Entry morreu', ['Buscar trade', 'read'], ['Assumir entry', 'gamble'], ['Recuar e reorganizar', 'solid']],
    ['Escutou passos defendendo', ['Segurar ângulo', 'solid'], ['Usar utilitário', 'read'], ['Pedir apoio e formar crossfire', 'team']],
    ['Ganhou duelo mas ficou com 10 HP', ['Recuar', 'solid'], ['Continuar pressionando', 'gamble'], ['Jogar de apoio', 'team']],
    ['Surgiu oportunidade de flanco', ['Flanquear imediatamente', 'gamble'], ['Esperar distração', 'read'], ['Continuar protegendo região', 'solid']],
    ['Está em clutch 1v2', ['Buscar duelos isolados', 'read'], ['Criar espaço com utilitário', 'team'], ['Jogar pelo objetivo e tempo', 'solid']],
    ['Seu time prepara retake', ['Entrar com companheiros', 'team'], ['Limpar acesso lateral', 'read'], ['Usar utilitário para expulsar CT/TR', 'solid']],
    ['Encontrou AWP inimiga', ['Enfrentar com flash', 'read'], ['Buscar outra rota', 'solid'], ['Aproximar usando smoke', 'team']],
    ['Defende bombsite sozinho', ['Segurar posição segura', 'solid'], ['Atrasar entrada', 'team'], ['Buscar kill e recuar', 'read']]
  ]),
  igl: build('igl', [
    ['Perderam três rounds consecutivos', ['Mudar estratégia', 'read'], ['Repetir com ajustes', 'solid'], ['Fazer round econômico', 'team']],
    ['CT concentra jogadores no A', ['Atacar B', 'solid'], ['Fazer fake A e terminar B', 'read'], ['Dominar meio e dividir defesa', 'team']],
    ['Time conseguiu primeira kill', ['Jogar pela vantagem', 'solid'], ['Acelerar execução', 'gamble'], ['Manter default para informação', 'team']],
    ['Time perdeu primeira kill', ['Buscar compensação', 'gamble'], ['Agrupar e executar', 'team'], ['Fazer distração e atacar outro lado', 'read']],
    ['Restam 35 segundos no default', ['Executar no bombsite próximo', 'solid'], ['Rotacionar imediatamente', 'team'], ['Entrada de contato com utilitários', 'read']],
    ['CT está fazendo rush frequentemente', ['Preparar anti-rush', 'read'], ['Jogar default recuado', 'solid'], ['Executar rapidamente outro lado', 'team']],
    ['Economia do time está ruim', ['Eco completo', 'solid'], ['Force buy', 'gamble'], ['Compra parcial', 'team']],
    ['Adversário repete a mesma defesa', ['Criar execução específica', 'read'], ['Fazer fake para provocar rotação', 'gamble'], ['Atacar outra região', 'solid']],
    ['Seu time está em 3v3 pós-plant', ['Organizar crossfire', 'team'], ['Controlar rotações', 'solid'], ['Jogar em duplas para trocas', 'read']],
    ['Último round do half', ['Executar estratégia preparada', 'solid'], ['Fazer rush surpresa', 'gamble'], ['Jogar default controlado', 'team']]
  ])
};

/** As situações de cada função: as 10 originais (ids preservados) + as 35 extras, numeradas em sequência. */
export const DECISION_MATRIX = Object.fromEntries(
  (Object.entries(BASE_MATRIX) as Array<[PlayerRole, ClutchSituation[]]>).map(([role, base]) => [role, [...base, ...build(role, EXTRA_ROWS[role], base.length)]])
) as Record<PlayerRole, ClutchSituation[]>;

/** As 60 situações que servem a qualquer função. */
export const SHARED_SITUATIONS: ClutchSituation[] = build('any', SHARED_ROWS);

/** Tudo o que pode cair para uma função: as dela + as gerais. */
export const situationsFor = (role: PlayerRole): ClutchSituation[] => [...DECISION_MATRIX[role], ...SHARED_SITUATIONS];

/** Sorteio determinístico da situação da vez, sem repetir o que já caiu (até esgotar a função). */
/** De que lado é a situação: pós-plant e "sem plantar" são do TR; desarmar, retake e bomba inimiga plantada, do CT. */
export function situationSide(situation: Pick<ClutchSituation, 'text' | 'alternatives'>): 't' | 'ct' | null {
  const all = `${situation.text} ${situation.alternatives.map((alternative) => alternative.text).join(' ')}`.toLowerCase();
  if (/pós-plant|pos-plant|sem plantar|plantar em|ouviu o defuse|defuse começar|você plantou|seu time plantou|carrega a bomba|com a bomba no/.test(all)) return 't';
  if (/defus|desarm|retake|retomad|plantou|kit de defuse|bomba plantada|bomba vindo|antes do plant/.test(all)) return 'ct';
  return null;
}

/** Como está a bomba no momento da call (para mostrar o round no meio, com credibilidade). */
export function situationBomb(situation: Pick<ClutchSituation, 'text' | 'alternatives'>): 'planted' | 'unplanted' | null {
  const all = `${situation.text} ${situation.alternatives.map((alternative) => alternative.text).join(' ')}`.toLowerCase();
  if (/plantad|plantou|pós-plant|pos-plant|segundos de bomba|ouviu o defuse|defuse começar|retake|desarm|defus/.test(all)) return 'planted';
  if (/sem plantar|antes do plant|bomba vindo|plantar em/.test(all)) return 'unplanted';
  return null;
}

/** O momento do mapa na hora da call: round, placar, sequência e dinheiro (por jogador) dos dois lados. */
export interface RoundContext {
  round: number;
  us: number;
  them: number;
  winStreak: number;
  lossStreak: number;
  /** O seu time ganhou o round anterior (null no round 1). */
  lastWon: boolean | null;
  money: number | null;
  theirMoney: number | null;
}

/** Abaixo disso o time está no eco/dinheiro curto; abaixo da compra cheia, força. */
const LOW_MONEY = 2400;
const FULL_BUY = 3600;
/** Rounds para fechar o mapa: 13 no tempo normal; na prorrogação, 16, 19, 22… */
export const mapTarget = (us: number, them: number) => (Math.min(us, them) >= 12 ? 16 + 3 * Math.floor((Math.min(us, them) - 12) / 3) : 13);

/** A situação só cai quando o que ela diz é verdade no mapa: "perderam três seguidos" só depois de três derrotas,
 *  "último round do half" só no 12, eco só com o dinheiro curto. Sem regra, serve a qualquer momento. */
const CONTEXT_RULES: Array<[RegExp, (ctx: RoundContext) => boolean, string]> = [
  [/perde(ram|u) (três|3) rounds/, (ctx) => ctx.lossStreak >= 3, 'depois de perder 3 rounds seguidos'],
  [/ganhou dois rounds seguidos/, (ctx) => ctx.winStreak >= 2, 'depois de ganhar 2 rounds seguidos'],
  [/perdeu o pistol/, (ctx) => (ctx.round === 2 || ctx.round === 14) && ctx.lastWon === false, 'round 2 ou 14, depois de perder o pistol'],
  [/ganhou o pistol/, (ctx) => (ctx.round === 2 || ctx.round === 14) && ctx.lastWon === true, 'round 2 ou 14, depois de ganhar o pistol'],
  [/depois do pistol/, (ctx) => ctx.round === 2 || ctx.round === 14, 'round 2 ou 14'],
  [/pistol round|pistola no round 1/, (ctx) => ctx.round === 1 || ctx.round === 13, 'round de pistol (1 ou 13)'],
  [/último round do half|decisivo para o half/, (ctx) => ctx.round === 12, 'round 12 (último do half)'],
  [/empatado em 12 a 12/, (ctx) => ctx.us === 12 && ctx.them === 12, 'placar 12 a 12'],
  [/primeiro round da prorrogação/, (ctx) => ctx.round >= 25 && (ctx.round - 25) % 6 === 0, 'primeiro round de cada prorrogação'],
  [/(último round|última entrada) para (fechar|ganhar) o mapa|último round do mapa/, (ctx) => mapTarget(ctx.us, ctx.them) - ctx.us === 1, 'match point a favor'],
  [/fim do mapa/, (ctx) => mapTarget(ctx.us, ctx.them) - Math.max(ctx.us, ctx.them) <= 2, 'fim do mapa (alguém a 2 rounds de fechar)'],
  [/cinco rounds atrás/, (ctx) => ctx.them - ctx.us >= 5, '5 ou mais rounds atrás'],
  [/perdendo e sem energia/, (ctx) => ctx.them - ctx.us >= 3, '3 ou mais rounds atrás'],
  [/placar apertado/, (ctx) => Math.abs(ctx.us - ctx.them) <= 2 && ctx.us + ctx.them >= 12, 'placar com até 2 de diferença depois do round 12'],
  [/eco round|está no eco|economia do time|economia apertada|dinheiro curto|sem dinheiro|pouco dinheiro/, (ctx) => ctx.money !== null && ctx.money < LOW_MONEY, 'seu time com menos de US$ 2.400 por jogador'],
  [/round de força/, (ctx) => ctx.money !== null && ctx.money < FULL_BUY, 'seu time abaixo da compra cheia (US$ 3.600)'],
  [/anti-eco|contra eco|economia quebrada/, (ctx) => ctx.theirMoney !== null && ctx.theirMoney < LOW_MONEY, 'adversário com menos de US$ 2.400 por jogador'],
  [/contra força|fez força/, (ctx) => ctx.theirMoney !== null && ctx.theirMoney < FULL_BUY, 'adversário abaixo da compra cheia (US$ 3.600)']
];

/** Quando a situação pode cair, em português: lado, bomba e o momento do mapa. Para a planilha de conteúdo. */
export function situationWhen(situation: Pick<ClutchSituation, 'text' | 'alternatives'>): { side: string; bomb: string; moment: string } {
  const side = situationSide(situation);
  const bomb = situationBomb(situation);
  const text = situation.text.toLowerCase();
  const moments = CONTEXT_RULES.filter(([pattern]) => pattern.test(text)).map(([, , label]) => label);
  return {
    side: side === 't' ? 'TR' : side === 'ct' ? 'CT' : 'qualquer',
    bomb: bomb === 'planted' ? 'plantada' : bomb === 'unplanted' ? 'não plantada' : 'qualquer',
    moment: moments.length ? moments.join(' e ') : 'qualquer round decisivo'
  };
}

export function situationFits(situation: Pick<ClutchSituation, 'text'>, ctx: RoundContext | null): boolean {
  const text = situation.text.toLowerCase();
  const rules = CONTEXT_RULES.filter(([pattern]) => pattern.test(text));
  if (!rules.length) return true;
  return Boolean(ctx) && rules.every(([, fits]) => fits(ctx!));
}

export function drawClutchSituation(role: PlayerRole, seed: string, usedIds: readonly string[] = [], side: 't' | 'ct' | null = null, round: RoundContext | null = null): ClutchSituation {
  // Só situações do seu lado no round (CT não planta, TR não desarma) e que batem com o placar e o dinheiro.
  const all = situationsFor(role).filter((situation) => (!side || !situationSide(situation) || situationSide(situation) === side) && situationFits(situation, round));
  const fresh = all.filter((situation) => !usedIds.includes(situation.id));
  const pool = fresh.length ? fresh : all;
  const rng = createSeededRng(`${seed}:situation`);
  return { ...pool[Math.floor(rng() * pool.length)], role };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface ClutchResolveInput {
  situation: ClutchSituation;
  /** 0, 1 ou 2 — a alternativa escolhida. */
  choice: 0 | 1 | 2;
  playerOverall: number;
  matesOverall: number;
  /** Força do time adversário no motor (escala de time: ~6 acima da média dos jogadores). */
  opponentOverall: number;
  seed: string;
  /** O momento do mapa (placar, sequência, dinheiro). Sem ele, a leitura usa só o texto e a força. */
  round?: RoundContext | null;
  /** Relação média com os parceiros (0-100): pesa no jogo de time. */
  chemistry?: number | null;
}

export type ReadQuality = 'good' | 'ok' | 'bad';

export interface ClutchResolve {
  profile: ClutchProfile;
  /** Edge aplicado no round: positivo inclina pro seu time, negativo contra. */
  edge: number;
  /** Só para a aposta: pra que lado a moeda virou. */
  coin: 'heads' | 'tails' | null;
  /** A leitura foi a certa (a melhor das 3), razoável ou errada. */
  quality: ReadQuality;
  /** A alternativa que era a leitura certa e o porquê, em uma frase. */
  best: 0 | 1 | 2;
  reason: string;
}

/** Força de time no motor fica uns 6 pontos acima da média dos jogadores: compara na mesma régua. */
const TEAM_SCALE = 6;

const CUE = {
  advantage: /vantagem|4v|3v2|2v1|na frente|pós-plant|plantad|ganhou|fechar o mapa|controle|primeira kill|domin/,
  disadvantage: /perd|atrás|1v2|1v3|contra três|contra dois|sozinho|último vivo|sem dinheiro|desvantagem|errou|morreu/,
  repeat: /repete|mesma|sempre|frequente|padrão|hábito|rush|concentra|lê|ler /,
  team: /time|trade|dupla|agrup|crossfire|junto|coletiv|flash|utilit|duplas/,
  clock: /segundos|sem tempo|tempo|relógio/
};

interface ReadFactors { lead: number; late: boolean; eco: boolean; theirEco: boolean; skill: number; teamFactor: number; chemistry: number | null; cues: Record<keyof typeof CUE, boolean> }

function factorsOf(input: Omit<ClutchResolveInput, 'choice'>): ReadFactors {
  const round = input.round ?? null;
  const text = input.situation.text.toLowerCase();
  return {
    lead: round ? round.us - round.them : 0,
    late: round ? Math.max(round.us, round.them) >= 10 : false,
    eco: round?.money !== null && round?.money !== undefined && round.money < 2400,
    theirEco: round?.theirMoney !== null && round?.theirMoney !== undefined && round.theirMoney < 2400,
    skill: clamp((input.playerOverall - (input.opponentOverall - TEAM_SCALE)) / 15, -1, 1),
    teamFactor: clamp((input.matesOverall - (input.opponentOverall - TEAM_SCALE)) / 15, -1, 1),
    chemistry: input.chemistry ?? null,
    cues: Object.fromEntries(Object.entries(CUE).map(([key, pattern]) => [key, pattern.test(text)])) as ReadFactors['cues']
  };
}

/** Quanto cada estilo encaixa no momento (quanto maior, mais certo). */
function profileFit(profile: ClutchProfile, f: ReadFactors): number {
  const lead = clamp(f.lead, -4, 4);
  switch (profile) {
    case 'solid':
      return 0.1 + 0.08 * lead + (f.cues.advantage ? 0.25 : 0) + (f.theirEco ? 0.15 : 0) - (f.cues.disadvantage ? 0.2 : 0) - (f.late && f.lead <= -3 ? 0.3 : 0);
    case 'read':
      return 0.05 + 0.5 * f.skill + (f.cues.repeat ? 0.3 : 0) + (f.theirEco ? 0.1 : 0);
    case 'gamble':
      return -0.1 - 0.08 * lead + (f.eco ? 0.3 : 0) + (f.cues.disadvantage ? 0.25 : 0) + (f.cues.clock ? 0.15 : 0) - (f.theirEco ? 0.2 : 0) + 0.15 * f.skill;
    case 'team':
      return 0.35 * f.teamFactor + (f.chemistry !== null ? (f.chemistry - 60) / 100 : 0) + (f.cues.team ? 0.25 : 0) + (f.cues.advantage ? 0.1 : 0) - (f.eco ? 0.1 : 0);
  }
}

/** Por que aquela era a leitura certa, em uma frase curta. */
function reasonOf(profile: ClutchProfile, f: ReadFactors): string {
  if (profile === 'solid') {
    if (f.lead >= 2) return `Com ${f.lead} rounds de vantagem, segurar era o certo.`;
    if (f.theirEco) return 'Contra o eco deles, bastava jogar o básico.';
    if (f.cues.advantage) return 'Com a vantagem no round, o plano seguro era o certo.';
    return 'O momento pedia calma e disciplina.';
  }
  if (profile === 'read') {
    if (f.skill >= 0.2) return 'Você é melhor que eles no duelo: a leitura era o caminho.';
    if (f.cues.repeat) return 'Eles vinham repetindo a jogada: dava para ler.';
    return 'Dava para ler o adversário naquele round.';
  }
  if (profile === 'gamble') {
    if (f.lead <= -2) return `Atrás por ${-f.lead}, era hora de arriscar.`;
    if (f.eco) return 'Sem dinheiro, só a aposta virava o round.';
    if (f.cues.disadvantage) return 'Em desvantagem, esperar não salvava o round.';
    return 'O round pedia uma jogada de coragem.';
  }
  if ((f.chemistry ?? 0) >= 75) return 'O time está entrosado: jogar junto era o certo.';
  return 'O round pedia o time junto, não um herói.';
}

/** A leitura de cada alternativa no momento: nota, posição (0 = a certa) e o porquê da certa. Um desempate fixo
 *  por situação evita que a resposta vire fórmula decorada. */
export function readOf(input: Omit<ClutchResolveInput, 'choice'>): { fits: number[]; ranks: Array<0 | 1 | 2>; best: 0 | 1 | 2; worst: 0 | 1 | 2; reason: string } {
  const f = factorsOf(input);
  const fits = input.situation.alternatives.map((alternative, index) => {
    const noise = (createSeededRng(`${input.situation.id}:${alternative.profile}:${index}:read`)() - 0.5) * 0.3;
    return profileFit(alternative.profile, f) + noise;
  });
  const order = [0, 1, 2].sort((a, b) => fits[b] - fits[a]) as Array<0 | 1 | 2>;
  const ranks = [0, 0, 0] as Array<0 | 1 | 2>;
  order.forEach((choice, rank) => { ranks[choice] = rank as 0 | 1 | 2; });
  return { fits, ranks, best: order[0], worst: order[2], reason: reasonOf(input.situation.alternatives[order[0]].profile, f) };
}

/**
 * A consequência da leitura. Cada momento tem uma alternativa certa (placar, sequência, dinheiro, lado, a sua força
 * contra a deles e a química do time): a certa vale de +0.09 a +0.12 no round, a do meio quase nada e a errada de
 * −0.06 a −0.08. A aposta ainda vira moeda (acerta mais quem é melhor). O RNG é seeded: mesma carreira, mesmo
 * round, mesmo resultado. O efeito vale para o round da call.
 */
export function resolveClutchEdge(input: ClutchResolveInput): ClutchResolve {
  const alternative = input.situation.alternatives[input.choice] ?? input.situation.alternatives[0];
  const read = readOf(input);
  const rank = read.ranks[input.choice] ?? 1;
  const [first, second, third] = [...read.fits].sort((a, b) => b - a);
  let edge = rank === 0 ? 0.1 + 0.04 * clamp((first - second) / 0.5, 0, 1) : rank === 1 ? 0.015 : -0.06 - 0.02 * clamp((second - third) / 0.5, 0, 1);
  let coin: ClutchResolve['coin'] = null;
  if (alternative.profile === 'gamble') {
    const skill = clamp((input.playerOverall - (input.opponentOverall - TEAM_SCALE)) / 15, -1, 1);
    coin = createSeededRng(`${input.seed}:${input.situation.id}:${input.choice}`)() < 0.5 + 0.2 * skill ? 'heads' : 'tails';
    edge += coin === 'heads' ? 0.03 : -0.05;
  }
  return { profile: alternative.profile, edge: clamp(edge, -0.15, 0.15), coin, quality: rank === 0 ? 'good' : rank === 1 ? 'ok' : 'bad', best: read.best, reason: read.reason };
}

/** O histórico das suas calls: quantas, quantas leituras certas e quantos rounds ganhos, por estilo. */
export interface DecisionLog {
  calls: number;
  good: number;
  ok: number;
  bad: number;
  roundsWon: number;
  byProfile: Partial<Record<ClutchProfile, { calls: number; good: number; won: number }>>;
  /** As últimas 12 calls: campeonato (temporada:índice), se ganhou o round e se era match point de alguém. */
  recent?: Array<{ key: string; won: boolean; matchPoint: boolean }>;
}

export const EMPTY_DECISIONS: DecisionLog = { calls: 0, good: 0, ok: 0, bad: 0, roundsWon: 0, byProfile: {} };

export function logDecision(log: DecisionLog | undefined, profile: ClutchProfile, quality: ReadQuality, won: boolean, call?: { key: string; matchPoint: boolean }): DecisionLog {
  const base = log ?? EMPTY_DECISIONS;
  const mine = base.byProfile[profile] ?? { calls: 0, good: 0, won: 0 };
  return {
    ...(call ? { recent: [...(base.recent ?? []), { key: call.key, won, matchPoint: call.matchPoint }].slice(-12) } : base.recent ? { recent: base.recent } : {}),
    calls: base.calls + 1,
    good: base.good + (quality === 'good' ? 1 : 0),
    ok: base.ok + (quality === 'ok' ? 1 : 0),
    bad: base.bad + (quality === 'bad' ? 1 : 0),
    roundsWon: base.roundsWon + (won ? 1 : 0),
    byProfile: { ...base.byProfile, [profile]: { calls: mine.calls + 1, good: mine.good + (quality === 'good' ? 1 : 0), won: mine.won + (won ? 1 : 0) } }
  };
}

/** A história do round decisivo: o que a SUA escolha causou — não só ganhou/perdeu. */
export const STORIES: Record<ClutchProfile, { won: string[]; lost: string[] }> = {
  // A alternativa chega no infinitivo ("Cobrir o entry"): os moldes a encaixam depois de um verbo conjugado.
  solid: {
    won: [
      'Sem heroísmo: a call foi {alt} e o plano segurou. O adversário bateu na parede e o round caiu do seu lado.',
      'Disciplina: você escolheu {alt}. O time inteiro na mesma página e o round veio pelo plano, não pelo milagre.'
    ],
    lost: [
      'Você escolheu {alt}, mas o adversário leu o ritmo. Round deles no detalhe.',
      'O plano era certo, a execução não: a call foi {alt} e o round escapou por pouco.'
    ]
  },
  read: {
    won: [
      'Leitura certeira: a call foi {alt} e caiu exatamente no ponto fraco deles. A arena viu a jogada acontecer.',
      'Você decidiu {alt} antes do adversário pensar. Você leu primeiro.'
    ],
    lost: [
      'Você escolheu {alt}, mas eles estavam um passo à frente. Te bangaram no ângulo.',
      'A leitura não veio: a call foi {alt} e o crossfire deles te pegou de jeito.'
    ]
  },
  gamble: {
    won: [
      'A aposta pagou: você resolveu {alt} com sangue frio e o ginásio veio abaixo. Round seu, narração dele.',
      'Todo mundo gritou NÃO e você decidiu {alt}. Funcionou. Essa é a história que vira clipe.'
    ],
    lost: [
      'A aposta não pagou: você tentou {alt} e te bangaram antes da jogada nascer. Round deles, culpa na mesa.',
      'Você arriscou {alt} e o timing traiu. O round morreu ali.'
    ]
  },
  team: {
    won: [
      'Jogo de time: a call foi {alt} e a jogada coordenada abriu o bombsite. Round construído, não roubado.',
      'Você escolheu {alt}. Companheiro certo, na hora certa.'
    ],
    lost: [
      'A call foi {alt}, mas a coordenação atrasou. O adversário puniu.',
      'A jogada de time saiu torta: a call foi {alt}, o trade não veio e o round ficou lá.'
    ]
  }
};

export function clutchStory(profile: ClutchProfile, alternative: string, won: boolean, kills: number): string {
  const rng = createSeededRng(`story:${profile}:${alternative}:${won}`);
  const pool = STORIES[profile][won ? 'won' : 'lost'];
  const alt = alternative.charAt(0).toLowerCase() + alternative.slice(1);
  const base = pool[Math.floor(rng() * pool.length)].replace('{alt}', alt);
  if (won && kills >= 3) return `${base} E ainda sobrou fôlego: ${kills} eliminações suas no round.`;
  if (won && kills >= 1) return `${base} (${kills} eliminaç${kills > 1 ? 'ões' : 'ão'} sua${kills > 1 ? 's' : ''} no round)`;
  return base;
}
