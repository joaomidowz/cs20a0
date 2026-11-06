// src/lib/game/playerCareer/agenda.ts
// A semana entre campeonatos da Carreira de Jogador: um catálogo de ações (treino, amigos, bootcamp, stream,
// coach, profissionais de fora, time, descanso, mercado). Cada janela mostra 5 cartas (o treino sugerido + 4
// sorteadas pelo seed da janela) e vale UMA escolha, a mesma vaga do treino. Os efeitos são reais: atributos
// entram no bônus de treino (mesmo teto), moral puxa o Mental, forma vale no próximo campeonato, seguidores
// contam a fama e "elenco" mexe na relação com os 4 parceiros.
import rawWeek from '$lib/data/cs/career-week.game.json';
import { createSeededRng } from '../simulation';
import type { Player, TrainingFocus } from '../types';
import { orgOf, playedCount, type PlayerCareerState, type PlayerRole, type TrainedAttribute, type TrainedBonus } from './engine';
import { coachOf, matesOf, myLanguageFit, myPlayerOf, relationshipOf, TRAIN_CAP, trainingWindowOf } from './squad';
import { LANGUAGE_LABEL, learn, myFluency, NON_NATIVE_MAX } from './language';
import { careerCtx, conditionsHold, isUnsupported } from './conditions';
import { lifeOf, orgRegionOf } from './life';
import { memberBirthYear, memberNick, memberRoles, sceneOrgs } from './data';
import { orgIn } from './world';

/** As 9 categorias originais e as 14 da planilha nova da semana. */
export type AgendaCategory = 'treino' | 'amigos' | 'bootcamp' | 'stream' | 'coach' | 'externo' | 'time' | 'descanso' | 'mercado'
  | 'pug' | 'posicao' | 'scrim' | 'analise' | 'mente' | 'adaptacao' | 'familia' | 'conteudo' | 'convivencia' | 'negocios' | 'corpo' | 'lazer' | 'campeonato' | 'social';

export interface AgendaEffects {
  attrs?: Partial<Record<TrainedAttribute, number>>;
  morale?: number;
  form?: number;
  fame?: number;
  /** Relação com os 4 parceiros. */
  team?: number;
  /** Conta como sessão de treino (a cada 3, +1 de overall até o teto da carreira). */
  trainStep?: boolean;
  /** Cansaço (positivo cansa, negativo recupera). Sem valor, vale o padrão da categoria. */
  fatigue?: number;
  /** Fluência de idioma: inglês ou o idioma da call do time. */
  lang?: { target: 'en' | 'team'; amount: number };
  /** Cabeça (o Mental fora do servidor, 0-100). */
  mind?: number;
}

export interface AgendaAction {
  id: string;
  category: AgendaCategory;
  title: string;
  text: string;
  effects: AgendaEffects;
  /** O que você ouve depois de escolher. */
  line: string;
  risk?: { chance: number; effects: AgendaEffects; line: string };
  needs?: { realOrg?: boolean; fame?: number; roles?: PlayerRole[]; /** Só aparece se ainda há o que aprender no idioma. */ language?: 'en' | 'team' };
  /** Planilha nova: condições conferidas no estado real, raridade, cooldown (semanas) e de quem é o contato. */
  conditions?: string[];
  rarity?: 'comum' | 'moderado' | 'grave';
  cooldownWeeks?: number;
}

export const CATEGORY_LABEL: Record<AgendaCategory, string> = {
  treino: 'Treino', amigos: 'Amigos', bootcamp: 'Bootcamp', stream: 'Stream', coach: 'Coach',
  externo: 'Profissional', time: 'Time', descanso: 'Descanso', mercado: 'Mercado',
  pug: 'PUG', posicao: 'Posição', scrim: 'Scrim', analise: 'Análise', mente: 'Cabeça', adaptacao: 'Adaptação',
  familia: 'Família', conteudo: 'Conteúdo', convivencia: 'Convivência', negocios: 'Carreira', corpo: 'Corpo', lazer: 'Lazer',
  campeonato: 'Campeonato', social: 'Vida social'
};

export const ATTR_LABEL: Record<TrainedAttribute, string> = {
  firepower: 'Mira', entry: 'Entrada', clutch: 'Clutch', awp: 'AWP', support: 'Suporte', igl: 'IGL', mental: 'Mental', consistency: 'Consistência'
};

const A = (
  id: string, category: AgendaCategory, title: string, text: string, effects: AgendaEffects, line: string,
  extra: Pick<AgendaAction, 'risk' | 'needs'> = {}
): AgendaAction => ({ id, category, title, text, effects, line, ...extra });

/** O treino de sempre, por foco: a carta sugerida da semana é um destes. */
export const TRAINING_BY_FOCUS: Record<TrainingFocus, string> = {
  aim: 'treino-mira', utility: 'treino-util', clutch: 'treino-clutch', opening: 'treino-entrada', recovery: 'treino-recuperacao'
};

export const AGENDA: AgendaAction[] = [
  // Treino
  A('treino-mira', 'treino', 'Treino de mira', 'Deathmatch e mapas de aim a semana toda.', { attrs: { firepower: 2, consistency: 1 }, trainStep: true }, 'Spray mais firme. A mira respondeu.'),
  A('treino-util', 'treino', 'Treino de utilitária', 'Smokes e flashes no servidor vazio.', { attrs: { support: 2, igl: 1 }, trainStep: true }, 'Utilitária limpa. O time sente a diferença.'),
  A('treino-clutch', 'treino', 'Retakes 1vX', 'Fim de round no treino até cansar.', { attrs: { clutch: 3, mental: 1 }, trainStep: true }, 'Cabeça fria nos rounds de fim.'),
  A('treino-entrada', 'treino', 'Treino de entrada', 'Timing de entry em bombsite.', { attrs: { entry: 3, firepower: 1 }, trainStep: true }, 'Entrada afiada. Você chega primeiro.'),
  A('treino-recuperacao', 'treino', 'Recuperação', 'Alongamento, sono e menos tela.', { attrs: { mental: 2, consistency: 2 }, morale: 4, trainStep: true }, 'Corpo e cabeça descansados.'),
  A('treino-awp', 'treino', 'Treino de AWP', 'Flicks e posições de AWP.', { attrs: { awp: 3, consistency: 1 }, trainStep: true }, 'A AWP ficou mais rápida na sua mão.'),
  A('treino-demos', 'treino', 'Estudar demos', 'Rever as suas mortes da última etapa.', { attrs: { consistency: 2, igl: 1 }, form: 1, trainStep: true }, 'Você viu os erros e não vai repetir.'),
  A('treino-pistol', 'treino', 'Rounds de pistol', 'Treinar o round 1 e o 13 à exaustão.', { attrs: { firepower: 1, entry: 1, consistency: 1 }, trainStep: true }, 'Pistol virou ponto forte.'),
  A('treino-ct', 'treino', 'Posições de CT', 'Ângulos e rotações do lado CT.', { attrs: { support: 1, consistency: 2 }, trainStep: true }, 'Rotação mais rápida no CT.'),
  A('treino-maratona', 'treino', 'Maratona de treino', '12 horas por dia no servidor.', { attrs: { firepower: 3, entry: 1 }, morale: -6, form: -1, trainStep: true }, 'Muito treino. A mira subiu, o corpo sentiu.', {
    risk: { chance: 0.25, effects: { attrs: { mental: -2 } }, line: 'Cansou demais e jogou travado no fim da semana.' }
  }),

  // Amigos e scrims
  A('amigos-ranked', 'amigos', 'Ranked com amigos', 'Jogar solto com a galera de sempre.', { morale: 6, attrs: { firepower: 1 } }, 'Risada no Discord e mira solta.'),
  A('amigos-mix', 'amigos', 'Mix com amigos de outros times', 'Treino com gente de outras orgs.', { attrs: { firepower: 1, entry: 1 }, morale: 3, fame: 150 }, 'Você aprendeu um truque com outro time.'),
  A('scrim-forte', 'amigos', 'Scrim contra time forte', 'Treino contra um time acima de vocês.', { attrs: { igl: 1, support: 1, consistency: 1 }, form: 1, team: 2, morale: -2 }, 'Apanharam, mas acharam os buracos do time.'),
  A('scrim-fraco', 'amigos', 'Scrim contra time fraco', 'Ganhar treino para pegar confiança.', { morale: 5, form: 1 }, 'Vitórias fáceis e o time confiante.'),
  A('faceit-noite', 'amigos', 'Madrugada de FACEIT', 'Subir o nível jogando até tarde.', { attrs: { firepower: 2 }, morale: 2, form: -1 }, 'Level alto, olheira também.', {
    risk: { chance: 0.2, effects: { attrs: { mental: -1 }, morale: -3 }, line: 'Tiltou numa partida ruim e dormiu bravo.' }
  }),
  A('amigos-retake', 'amigos', 'Retake com amigos', 'Servidor de retake com os parças.', { attrs: { clutch: 2 }, morale: 3 }, 'Clutch treinado sem pressão.'),
  A('amigos-1v1', 'amigos', '1v1 com um amigo', 'Duelos de mira até alguém desistir.', { attrs: { firepower: 2, entry: 1 }, morale: 2 }, 'Você ganhou mais duelos do que perdeu.'),

  // Bootcamp (precisa de org)
  A('bootcamp-europa', 'bootcamp', 'Bootcamp na Europa', 'Duas semanas de scrims contra times europeus.', { attrs: { consistency: 2, igl: 1, support: 1 }, form: 2, team: 3, morale: -3 }, 'Voltaram mais organizados e mais unidos.', { needs: { realOrg: true } }),
  A('bootcamp-casa', 'bootcamp', 'Bootcamp na gaming house', 'O time inteiro morando junto por uma semana.', { team: 5, attrs: { support: 1, consistency: 1 }, morale: 2 }, 'Convivência forte: o time virou família.', {
    needs: { realOrg: true },
    risk: { chance: 0.2, effects: { team: -6 }, line: 'A convivência pesou e teve briga no fim da semana.' }
  }),
  A('bootcamp-mapa', 'bootcamp', 'Bootcamp de mapa novo', 'Montar o jogo de um mapa do zero.', { attrs: { igl: 2, support: 1 }, form: 1, team: 2 }, 'Mapa novo no pool, com tática própria.', { needs: { realOrg: true } }),
  A('bootcamp-fisico', 'bootcamp', 'Bootcamp com preparador', 'Rotina, físico e sono com o time.', { attrs: { mental: 2, consistency: 1 }, morale: 2, team: 2 }, 'Rotina de atleta. Todo mundo mais disposto.', { needs: { realOrg: true } }),
  A('bootcamp-lan', 'bootcamp', 'Treinar em LAN', 'Simular palco, fone e barulho de arena.', { attrs: { mental: 2, clutch: 1 }, form: 1 }, 'O palco assusta menos agora.', { needs: { realOrg: true } }),

  // Stream e conteúdo
  A('stream-ranked', 'stream', 'Live jogando ranked', 'Câmera aberta e jogo com o chat.', { fame: 400, morale: 2, attrs: { firepower: 1 } }, 'Chat cheio e seguidores novos.'),
  A('stream-tutorial', 'stream', 'Live ensinando', 'Mostrar smokes e explicar calls.', { fame: 300, attrs: { support: 1, igl: 1 } }, 'Explicar fez você entender melhor.'),
  A('stream-maratona', 'stream', 'Maratona de live', 'Dez horas de live para bater meta.', { fame: 900, morale: -5, form: -1 }, 'Meta batida, energia no fim.', {
    risk: { chance: 0.2, effects: { morale: -8 }, line: 'Um clipe seu viralizou do jeito errado.' }
  }),
  A('video-jogadas', 'stream', 'Vídeo de jogadas', 'Editar um vídeo com seus melhores rounds.', { fame: 350, morale: 3 }, 'O vídeo rodou e o pessoal gostou.'),
  A('react-final', 'stream', 'React da final', 'Comentar uma final ao vivo com o chat.', { fame: 500, attrs: { igl: 1 } }, 'Você leu o jogo como um analista.'),
  A('collab-streamer', 'stream', 'Collab com streamer grande', 'Jogar na live de um streamer famoso.', { fame: 800, morale: 4 }, 'Muita gente nova conheceu o seu nick.', { needs: { fame: 1000 } }),
  A('sair-redes', 'stream', 'Sair das redes', 'Uma semana sem Twitter e sem live.', { attrs: { mental: 2 }, morale: 3, mind: 4, fame: -200 }, 'Paz na cabeça. Alguns seguidores foram embora.'),

  // Coach
  A('coach-mortes', 'coach', 'Coach: rever suas mortes', 'Ver com o coach onde você morre de graça.', { attrs: { consistency: 2 }, form: 1, trainStep: true }, 'Você parou de dar pick de graça.'),
  A('coach-calls', 'coach', 'Coach: entender as calls', 'O porquê de cada call do time.', { attrs: { igl: 2, support: 1 } }, 'Agora você joga a tática, não só o round.'),
  A('coach-funcao', 'coach', 'Coach: ajustar sua função', 'Refinar o que o time espera de você.', { attrs: { consistency: 1, support: 1, entry: 1 }, form: 1 }, 'Papel claro. Menos dúvida no jogo.'),
  A('coach-cobranca', 'coach', 'Pedir a real ao coach', 'Ouvir sem filtro o que falta no seu jogo.', { attrs: { consistency: 2 }, morale: -4, form: 1 }, 'Doeu ouvir, mas você sabe o que mudar.'),
  A('coach-anti', 'coach', 'Coach: estudar o adversário', 'Anti-strat do próximo time.', { attrs: { igl: 1 }, form: 2 }, 'Você sabe o que eles vão fazer.'),
  A('coach-papo', 'coach', 'Conversa leve com o coach', 'Alinhar expectativas sem pressão.', { morale: 5, team: 1 }, 'Coach do seu lado. Clima bom.'),
  A('coach-protagonismo', 'coach', 'Pedir mais protagonismo', 'Ser a primeira opção do time.', { morale: 3, form: 1, team: -3 }, 'O time vai jogar mais por você.', {
    risk: { chance: 0.3, effects: { team: -4 }, line: 'O IGL não gostou e o clima ficou estranho.' }
  }),

  // Profissionais de fora
  A('psicologo', 'externo', 'Psicólogo esportivo', 'Trabalhar pressão e respiração.', { attrs: { mental: 3, consistency: 1 }, morale: 4, mind: 6 }, 'Respirar antes do round virou hábito.'),
  A('coach-mira-particular', 'externo', 'Coach de mira particular', 'Aulas com um especialista em mira.', { attrs: { firepower: 3 }, morale: -1 }, 'Mira nova. Cansativo, mas valeu.'),
  A('analista', 'externo', 'Analista de dados', 'Números das suas últimas partidas.', { attrs: { consistency: 2, igl: 1 } }, 'Os números mostraram onde você perde round.'),
  A('preparador', 'externo', 'Preparador físico', 'Postura, punho e resistência.', { attrs: { consistency: 2, mental: 1 }, morale: 2 }, 'Sem dor no punho no fim do dia.'),
  A('nutricionista', 'externo', 'Nutricionista', 'Comer e dormir para render no palco.', { attrs: { mental: 1, consistency: 1 }, form: 1, morale: 2 }, 'Mais energia na terceira partida do dia.'),
  A('mentoria-veterano', 'externo', 'Mentoria com um veterano', 'Um ex-pro conta como é jogar um Major.', { attrs: { mental: 2, clutch: 1 }, morale: 3 }, 'Ele já passou por isso e te acalmou.'),
  A('aula-comunicacao', 'externo', 'Aula de comunicação', 'Falar curto e claro no rádio.', { attrs: { igl: 2, support: 1 }, team: 2 }, 'Calls mais limpas. O time entende de primeira.'),
  A('empresario', 'externo', 'Conversa com empresário', 'Entender o seu valor no mercado.', { morale: 2, fame: 100 }, 'Agora você sabe quanto vale.'),

  // Time
  A('jantar-time', 'time', 'Jantar com o time', 'Uma noite fora do servidor com o elenco.', { team: 5, morale: 3 }, 'Risada na mesa. O time ficou mais junto.'),
  A('alinhar-igl', 'time', 'Alinhar com o IGL', 'Combinar o seu papel nas táticas.', { team: 2, attrs: { igl: 1, support: 1 } }, 'Você e o IGL na mesma página.'),
  A('resolver-atrito', 'time', 'Resolver um atrito', 'Conversar com quem está mais distante.', { team: 4, morale: 1 }, 'Atrito resolvido. Menos silêncio no rádio.'),
  A('treino-dupla', 'time', 'Treino em dupla', 'Combos de entrada com um parceiro.', { attrs: { entry: 1, support: 1 }, team: 3 }, 'Vocês entram juntos sem precisar falar.'),
  A('viagem-time', 'time', 'Viagem com o time', 'Folga juntos antes da etapa.', { team: 4, morale: 5, form: -1 }, 'Cabeça leve e o time unido.'),
  A('cobrar-time', 'time', 'Cobrar o time', 'Dizer o que está errado no treino.', { team: -4, form: 1, attrs: { consistency: 1 } }, 'Treino mais sério depois da cobrança.', {
    risk: { chance: 0.3, effects: { team: -5 }, line: 'Pegou mal. Dois parceiros ficaram calados.' }
  }),

  // Descanso e vida
  A('folga', 'descanso', 'Folga total', 'Desligar o PC por três dias.', { morale: 8, mind: 3, attrs: { mental: 1 }, form: -1 }, 'Voltou com vontade de jogar.'),
  A('familia', 'descanso', 'Visitar a família', 'Voltar para casa por uns dias.', { morale: 10, mind: 4, attrs: { mental: 1 } }, 'Comida de casa e apoio de quem importa.'),
  A('academia', 'descanso', 'Academia', 'Treino físico todo dia.', { attrs: { consistency: 1, mental: 1 }, morale: 2, mind: 2 }, 'Corpo forte, cabeça também.'),
  A('ajustar-sono', 'descanso', 'Ajustar o sono', 'Dormir no horário do campeonato.', { attrs: { consistency: 2 }, form: 1 }, 'Acordado e afiado na hora do jogo.'),
  A('balada', 'descanso', 'Sair para a balada', 'Comemorar com os amigos.', { morale: 7, form: -2 }, 'Noite boa. A ressaca nem tanto.', {
    risk: { chance: 0.25, effects: { team: -2, fame: 300 }, line: 'Uma foto sua na balada rodou o Twitter.' }
  }),
  A('outro-jogo', 'descanso', 'Jogar outro jogo', 'Descansar a cabeça em outro game.', { morale: 6, mind: 2, attrs: { firepower: -1 } }, 'Cabeça leve. A mira enferrujou um pouco.'),

  // Mercado
  A('ouvir-propostas', 'mercado', 'Ouvir propostas', 'Seu empresário sonda outros times.', { fame: 150, morale: 2, team: -3 }, 'Tem time de olho em você.'),
  A('prometer-lealdade', 'mercado', 'Prometer lealdade', 'Dizer ao time que você fica.', { team: 5, morale: 2 }, 'O elenco confia mais em você.'),
  A('patrocinio', 'mercado', 'Ação de patrocínio', 'Gravar conteúdo para um patrocinador.', { fame: 250, morale: 1, form: -1 }, 'Patrocinador feliz e mais gente te seguindo.', { needs: { fame: 300 } }),
  // Idiomas: cansa um pouco, anima e abre portas (call em outro idioma custa sinergia até você aprender).
  A('aula-ingles', 'externo', 'Aula de inglês', 'Professor particular duas vezes na semana.', { morale: 1, fatigue: 6, lang: { target: 'en', amount: 12 } }, 'Já dá para pedir backup em inglês.', { needs: { language: 'en' } }),
  A('ranked-gringa', 'amigos', 'Ranked em servidor gringo', 'FACEIT na Europa, só call em inglês.', { attrs: { firepower: 1 }, morale: 1, fatigue: 8, lang: { target: 'en', amount: 8 } }, 'Apanhou no começo, mas a call em inglês destravou.', { needs: { language: 'en' } }),
  A('aula-idioma-time', 'externo', 'Aula do idioma do time', 'Aprender a call do time de verdade.', { morale: 1, team: 2, fatigue: 6, lang: { target: 'team', amount: 15 } }, 'O time já entende as suas calls.', { needs: { realOrg: true, language: 'team' } }),
  A('entrevista', 'mercado', 'Dar entrevista', 'Falar com a imprensa sobre a temporada.', { fame: 300, morale: 1 }, 'Entrevista boa, nome em alta.', {
    risk: { chance: 0.3, effects: { team: -3 }, line: 'Uma frase sua foi mal interpretada pelo time.' }
  })
];

// ---------------------------------------------------------------------------------------------------------------
// A planilha nova da semana (194 atividades): cada uma com condição real, raridade e cooldown. As originais
// ganham as mesmas regras (condição e cooldown da planilha) sem mudar texto nem efeito.
interface WeekRow { id: string; rarity: 'comum' | 'moderado' | 'grave'; cooldownWeeks: number; condition: string[]; category?: string; title?: string; text?: string; effects?: AgendaEffects; line?: string; risk?: AgendaAction['risk'] }
const WEEK = rawWeek as unknown as { originals: WeekRow[]; activities: WeekRow[] };
const WEEK_CATEGORY: Record<string, AgendaCategory> = {
  'PUG e FACEIT': 'pug', 'Treino de posição': 'posicao', 'Scrim e fundamentos': 'scrim', 'Coach e análise': 'analise', 'Mental e pressão': 'mente',
  'Europa e adaptação': 'adaptacao', 'Família e relações': 'familia', 'Fama e conteúdo': 'conteudo', 'Time e convivência': 'convivencia',
  'Negócios e carreira': 'negocios', 'Corpo e saúde': 'corpo', 'Lazer e descanso': 'lazer', 'Pré e pós campeonato': 'campeonato', 'Vida social e reputação': 'social'
};
const ORIGINAL_META = new Map(WEEK.originals.map((row) => [row.id, row]));
for (const action of AGENDA) {
  const meta = ORIGINAL_META.get(action.id);
  if (meta) Object.assign(action, { conditions: meta.condition, rarity: meta.rarity, cooldownWeeks: meta.cooldownWeeks });
}

/** As 194 novas (as que dependem de fato que o motor não guarda ficam de fora, como "relacionamento existente"). */
export const WEEK_ACTIONS: AgendaAction[] = WEEK.activities.filter((row) => !isUnsupported(row.condition) && WEEK_CATEGORY[row.category ?? '']).map((row) => ({
  id: row.id, category: WEEK_CATEGORY[row.category!], title: row.title!, text: row.text!, effects: row.effects ?? {}, line: row.line!,
  ...(row.risk ? { risk: row.risk } : {}), conditions: row.condition, rarity: row.rarity, cooldownWeeks: row.cooldownWeeks
}));
export const WEEK_UNSUPPORTED = WEEK.activities.filter((row) => isUnsupported(row.condition)).map((row) => row.id);
export const ALL_ACTIONS: AgendaAction[] = [...AGENDA, ...WEEK_ACTIONS];

export const AGENDA_BY_ID = new Map(ALL_ACTIONS.map((action) => [action.id, action]));

/** Blocos da semana: 3 (2 quando o próximo é Major: a semana tem compromisso oficial). */
export function weekBlocks(state: PlayerCareerState): number {
  const next = (state.calendar ?? []).find((entry) => entry.status === 'UPCOMING');
  return next?.format === 'major' || next?.tier === 'Major' ? 2 : 3;
}

/** O treino livre ocupa 2 blocos. */
export const FREE_TRAINING_COST = 2;
const COST_OVERRIDE: Record<string, number> = { 'bootcamp-europa': 3, 'treino-maratona': 2, 'stream-maratona': 2, folga: 2, familia: 2 };

/** Quanto tempo a ação ocupa: 1 bloco; scrim, viagem curta e visita 2; viagem longa e bootcamp 3. */
export function costOf(action: AgendaAction): number {
  if (COST_OVERRIDE[action.id]) return COST_OVERRIDE[action.id];
  if (action.category === 'bootcamp') return 3;
  if (/voltar ao país de origem|viajar com a família|visitar pais/i.test(action.title)) return 3;
  if (action.category === 'scrim' || /^visitar (outro|nova)/i.test(action.title)) return 2;
  return 1;
}

/** Retorno decrescente: repetir o mesmo tipo nas últimas 4 semanas rende 100%, 65%, 35%. Treino, PUG, posição e
 *  scrim contam como o mesmo tipo (para não dar para só treinar). */
const GROUP: Partial<Record<AgendaCategory, string>> = { treino: 'treino', pug: 'treino', posicao: 'treino', scrim: 'treino' };
export const groupOf = (category: AgendaCategory) => GROUP[category] ?? category;
const DIMINISH = [1, 0.65, 0.35];

export function diminishOf(state: PlayerCareerState, category: AgendaCategory): number {
  const now = playedCount(state);
  const group = groupOf(category);
  const repeats = (state.weekLog ?? []).filter((entry) => entry.group === group && now - entry.at <= 3).length;
  return DIMINISH[Math.min(repeats, DIMINISH.length - 1)];
}

/** Você já fez esta carta nesta semana? */
export const pickedThisWeek = (state: PlayerCareerState, id: string) => {
  const window = trainingWindowOf(state);
  return Boolean(window && state.week?.window === window && state.week.picks.includes(id));
};

/** Blocos que sobram na semana (save antigo com a semana já decidida: zero). */
export function blocksLeft(state: PlayerCareerState): number {
  const window = trainingWindowOf(state);
  if (!window) return 0;
  const week = state.week?.window === window ? state.week : null;
  if (!week && state.trainedWindow === window) return 0;
  return Math.max(0, weekBlocks(state) - (week?.used ?? 0));
}

/** Cooldown em semanas vira campeonatos (cada janela entre campeonatos é um mês, ~4 semanas). Nunca zera no ano novo. */
function onCooldown(state: PlayerCareerState, action: AgendaAction): boolean {
  const used = state.agendaUsed?.[action.id];
  if (used === undefined) return false;
  return playedCount(state) - used < Math.max(1, Math.ceil((action.cooldownWeeks ?? 3) / 4));
}

/** De quem é o contato da carta: um jogador de verdade, de outro time da sua região e de um tier perto do seu. */
export interface AgendaContact { nick: string; org: string }
const CONTACT_ROLE: Array<[RegExp, PlayerRole | 'mesma' | 'veterano' | 'jovem']> = [
  [/AWPer/i, 'awper'], [/\bentry\b/i, 'entry'], [/\bIGL\b/, 'igl'], [/lurker/i, 'lurker'], [/support/i, 'support'], [/pistol/i, 'rifler'],
  [/mesma posição|mesma área/i, 'mesma'], [/veterano/i, 'veterano'], [/jovem|da base/i, 'jovem']
];

export function contactOf(state: PlayerCareerState, action: AgendaAction): AgendaContact | null {
  const clause = (action.conditions ?? []).find((text) => /acessível|disponível|contato/i.test(text) && CONTACT_ROLE.some(([pattern]) => pattern.test(text)));
  if (!clause) {
    if ((action.conditions ?? []).includes('coach disponível') && state.orgId !== 'lan-house') return { nick: coachOf(state).name, org: orgOf(state.orgId, state).name };
    return null;
  }
  const want = CONTACT_ROLE.find(([pattern]) => pattern.test(clause))![1];
  const role: PlayerRole | null = want === 'mesma' ? state.role : want === 'veterano' || want === 'jovem' ? null : want;
  const level = orgOf(state.orgId, state).level;
  const region = orgRegionOf(state, (orgOf(state.orgId, state) as { region?: string }).region);
  // Amador não tem acesso a estrela: só times até um degrau acima do seu.
  const orgs = sceneOrgs.filter((org) => org.id !== state.orgId && org.region === region && org.level >= Math.max(1, level - 1) && org.level <= Math.min(4, level + 1));
  const people = orgs.flatMap((org) => (orgIn(state.seed, state.seasonNumber, org.id)?.roster ?? []).map((member) => ({ member, org })))
    .filter(({ member }) => !role || memberRoles(member).includes(role));
  if (!people.length) return null;
  const aged = people.map((entry) => ({ ...entry, age: state.year - (memberBirthYear(entry.member) ?? state.year - 25) }));
  const pool = want === 'veterano' ? aged.filter((entry) => entry.age >= 28) : want === 'jovem' ? aged.filter((entry) => entry.age <= 21) : aged;
  if (!pool.length) return null;
  const rng = createSeededRng(`${state.seed}:contact:${trainingWindowOf(state) ?? ''}:${action.id}`);
  const pick = pool[Math.floor(rng() * pool.length)];
  return { nick: memberNick(pick.member), org: pick.org.name };
}

/** Cansaço padrão de cada categoria: treinar e viajar cansam, descansar recupera. */
const CATEGORY_FATIGUE: Partial<Record<AgendaCategory, number>> = {
  treino: 15, amigos: 8, bootcamp: 20, stream: 6, coach: 4, externo: -6, time: 0, descanso: -25, mercado: 0
};

/** Ajustes do cansaço por ação (o resto segue a categoria). */
const FATIGUE_OVERRIDE: Record<string, number> = {
  'treino-recuperacao': -25, 'treino-maratona': 30, 'stream-maratona': 22, 'faceit-noite': 15, 'coach-mira-particular': 10,
  balada: 12, academia: -5, 'outro-jogo': -12, familia: -30, folga: -35, 'viagem-time': -15, 'ajustar-sono': -15, 'sair-redes': -10
};

export const fatigueOf = (action: AgendaAction): number => action.effects.fatigue ?? FATIGUE_OVERRIDE[action.id] ?? CATEGORY_FATIGUE[action.category] ?? 0;

/** Cansado (70+) o treino rende metade e não conta para o +1 de overall. */
export const TIRED_AT = 70;

export function agendaAvailable(state: PlayerCareerState, action: AgendaAction): boolean {
  if (action.conditions && !conditionsHold(action.conditions, careerCtx(state, 'between'))) return false;
  // Carta que pede um contato de verdade só aparece se existe alguém de verdade para ser o contato.
  if (action.conditions?.some((text) => /acessível/i.test(text) && CONTACT_ROLE.some(([pattern]) => pattern.test(text))) && !contactOf(state, action)) return false;
  const needs = action.needs;
  if (!needs) return true;
  if (needs.realOrg && state.orgId === 'lan-house') return false;
  if (needs.fame && (state.fame ?? 0) < needs.fame) return false;
  if (needs.roles && !needs.roles.includes(state.role)) return false;
  if (needs.language === 'en' && myFluency(state, 'en') >= NON_NATIVE_MAX) return false;
  if (needs.language === 'team') {
    const fit = myLanguageFit(state);
    if (fit.language === 'en' || fit.fluency >= NON_NATIVE_MAX) return false;
  }
  return true;
}

/** Os 5 treinos básicos viram o "treino livre" (você escolhe as habilidades); o sorteio pega o resto. */
const BASIC_TRAINING = new Set(Object.values(TRAINING_BY_FOCUS));

/** Cartas da semana: 5 (mais o treino livre, 6 opções), uma por categoria sempre que der. */
export const WEEK_CARDS = 5;
const RARITY_WEIGHT = { comum: 1, moderado: 0.7, grave: 0.3 } as const;

/** As cartas da semana, sorteadas pelo seed da janela: condição real, sem as que estão em cooldown, raras com menos
 *  chance. Uma por categoria sempre que der. */
export function drawAgenda(state: PlayerCareerState): AgendaAction[] {
  const window = trainingWindowOf(state);
  if (!window) return [];
  // Depois da primeira ação a mesa da semana fica parada (as cartas não trocam enquanto você faz as outras).
  if (state.week?.window === window && state.week.cards?.length) return state.week.cards.flatMap((id) => AGENDA_BY_ID.get(id) ?? []);
  const rng = createSeededRng(`${state.seed}:agenda:${window}`);
  const pool = ALL_ACTIONS.filter((action) => !BASIC_TRAINING.has(action.id) && !onCooldown(state, action) && agendaAvailable(state, action));
  // Sorteio com peso (raro aparece menos): chave = sorteio^(1/peso), maior primeiro.
  const shuffled = pool.map((action) => ({ action, key: rng() ** (1 / RARITY_WEIGHT[action.rarity ?? 'comum']) })).sort((a, b) => b.key - a.key).map((entry) => entry.action);
  const picked: AgendaAction[] = [];
  const usedCategories = new Set<AgendaCategory>();
  for (const action of shuffled) {
    if (picked.length >= WEEK_CARDS) break;
    if (!usedCategories.has(action.category)) { picked.push(action); usedCategories.add(action.category); }
  }
  for (const action of shuffled) {
    if (picked.length >= WEEK_CARDS) break;
    if (!picked.includes(action)) picked.push(action);
  }
  // Idioma fraco (inglês ou a call do time abaixo de 70): na maioria das semanas vem uma aula na mesa.
  const fit = myLanguageFit(state);
  const weak = (fit.language !== 'en' && fit.fluency < 70 && fit.language !== 'other') || myFluency(state, 'en') < 70;
  if (weak && rng() < 0.65 && !picked.some((action) => action.effects.lang)) {
    const lessons = pool.filter((action) => action.effects.lang);
    const lesson = lessons[Math.floor(rng() * lessons.length)];
    if (lesson) picked.splice(picked.length - 1, 1, lesson);
  }
  // Cansado (50+): sempre há um descanso de verdade na mesa (Folga, Família ou Recuperação), no lugar da carta que
  // mais cansa.
  if ((state.fatigue ?? 0) >= 50 && !picked.some((action) => fatigueOf(action) <= -20)) {
    const rest = pool.filter((action) => fatigueOf(action) <= -20);
    const pickRest = rest[Math.floor(rng() * rest.length)];
    if (pickRest) {
      const heaviest = [...picked].sort((a, b) => fatigueOf(b) - fatigueOf(a))[0];
      picked.splice(picked.indexOf(heaviest), 1, pickRest);
    }
  }
  return picked;
}

export interface AgendaChip { label: string; value: number; kind: 'attr' | 'morale' | 'form' | 'fame' | 'team' | 'train' | 'fatigue' }

/** Os efeitos em chips curtos ("+2 Mira", "−1 Forma") para a carta da semana. */
export function agendaChips(effects: AgendaEffects): AgendaChip[] {
  const chips: AgendaChip[] = [];
  for (const [attribute, value] of Object.entries(effects.attrs ?? {}) as Array<[TrainedAttribute, number]>) {
    if (value) chips.push({ label: ATTR_LABEL[attribute], value, kind: 'attr' });
  }
  if (effects.form) chips.push({ label: 'Forma', value: effects.form, kind: 'form' });
  if (effects.morale) chips.push({ label: 'Moral', value: effects.morale, kind: 'morale' });
  if (effects.team) chips.push({ label: 'Elenco', value: effects.team, kind: 'team' });
  if (effects.fame) chips.push({ label: 'Fãs', value: effects.fame, kind: 'fame' });
  if (effects.fatigue) chips.push({ label: 'Cansaço', value: effects.fatigue, kind: 'fatigue' });
  if (effects.mind) chips.push({ label: 'Cabeça', value: effects.mind, kind: 'morale' });
  if (effects.lang) chips.push({ label: effects.lang.target === 'en' ? 'Inglês' : 'Idioma do time', value: effects.lang.amount, kind: 'train' });
  return chips;
}

/** O que a semana faz pela Cabeça rende 50% a mais (cuidar da cabeça precisa valer a vaga na semana). */
export const MIND_WEEK_FACTOR = 1.5;
const weekMind = (effects: AgendaEffects): AgendaEffects => (effects.mind && effects.mind > 0 ? { ...effects, mind: Math.round(effects.mind * MIND_WEEK_FACTOR) } : effects);

/** Chips da carta da semana, já com o cansaço da ação. */
export const actionChips = (action: AgendaAction): AgendaChip[] => agendaChips({ ...weekMind(action.effects), fatigue: fatigueOf(action) });

export interface AgendaResult {
  state: PlayerCareerState;
  action: AgendaAction | null;
  line: string;
  /** O que de fato mudou (atributos respeitam o teto do treino). */
  chips: AgendaChip[];
  riskHit: boolean;
  overallUp: boolean;
}

const OVERALL_EVERY = 3;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function applyEffects(state: PlayerCareerState, effects: AgendaEffects, chips: AgendaChip[]): PlayerCareerState {
  const trained: TrainedBonus = { ...(state.trained ?? {}) };
  for (const [attribute, value] of Object.entries(effects.attrs ?? {}) as Array<[TrainedAttribute, number]>) {
    const before = trained[attribute] ?? 0;
    const after = clamp(before + value, -3, TRAIN_CAP);
    if (after !== before) {
      trained[attribute] = after;
      chips.push({ label: ATTR_LABEL[attribute], value: after - before, kind: 'attr' });
    }
  }
  let relationships = state.relationships ?? {};
  if (effects.team) {
    relationships = { ...relationships };
    for (const mate of matesOf(state)) relationships[mate.player.id] = clamp(relationshipOf(state, mate.player.id) + effects.team, 0, 100);
    chips.push({ label: 'Elenco', value: effects.team, kind: 'team' });
  }
  const fatigue = clamp((state.fatigue ?? 0) + (effects.fatigue ?? 0), 0, 100);
  if (fatigue !== (state.fatigue ?? 0)) chips.push({ label: 'Cansaço', value: fatigue - (state.fatigue ?? 0), kind: 'fatigue' });
  const morale = clamp((state.morale ?? 60) + (effects.morale ?? 0), 0, 100);
  const form = clamp((state.form ?? 0) + (effects.form ?? 0), -3, 3);
  const fame = Math.max(0, (state.fame ?? 0) + (effects.fame ?? 0));
  if (morale !== (state.morale ?? 60)) chips.push({ label: 'Moral', value: morale - (state.morale ?? 60), kind: 'morale' });
  if (form !== (state.form ?? 0)) chips.push({ label: 'Forma', value: form - (state.form ?? 0), kind: 'form' });
  if (fame !== (state.fame ?? 0)) chips.push({ label: 'Fãs', value: fame - (state.fame ?? 0), kind: 'fame' });
  let life = state.life;
  if (effects.mind) {
    const current = lifeOf(state);
    const mind = clamp(current.mind + effects.mind, 0, 100);
    if (mind !== current.mind) chips.push({ label: 'Cabeça', value: mind - current.mind, kind: 'morale' });
    life = { ...current, mind };
  }
  let languages = state.languages;
  if (effects.lang) {
    const language = effects.lang.target === 'en' ? 'en' : myLanguageFit(state).language;
    const before = myFluency(state, language);
    languages = learn(state, language, effects.lang.amount);
    const after = myFluency({ ...state, languages }, language);
    if (after !== before) chips.push({ label: LANGUAGE_LABEL[language], value: after - before, kind: 'train' });
  }
  return { ...state, trained, relationships, morale, form, fame, fatigue, ...(languages ? { languages } : {}), ...(life ? { life } : {}) };
}

/** Escala o que é ganho (o que custa, como cansaço, vale inteiro). */
function scaleGains(effects: AgendaEffects, factor: number): AgendaEffects {
  if (factor >= 1) return effects;
  const up = (value: number | undefined) => (value && value > 0 ? Math.round(value * factor) : value);
  return {
    ...effects,
    attrs: effects.attrs ? Object.fromEntries(Object.entries(effects.attrs).map(([key, value]) => [key, value > 0 ? Math.max(0, Math.round(value * factor)) : value])) : undefined,
    morale: up(effects.morale), form: up(effects.form), fame: up(effects.fame), team: up(effects.team), mind: up(effects.mind),
    lang: effects.lang ? { ...effects.lang, amount: Math.round(effects.lang.amount * factor) } : undefined
  };
}

/** Morando fora: voltar para casa mata a saudade; atividade de adaptação ajuda a se sentir em casa. */
function lifeOfAction(state: PlayerCareerState, action: AgendaAction): PlayerCareerState {
  const life = lifeOf(state);
  if (/voltar ao país de origem|visitar pais|viajar com a família|^Família$/i.test(action.title) || action.id === 'familia') {
    return { ...state, life: { ...life, homesick: Math.max(0, life.homesick - 25), weeksSinceVisit: 0 } };
  }
  if (action.category === 'adaptacao') return { ...state, life: { ...life, adaptation: Math.min(100, life.adaptation + 5), homesick: Math.max(0, life.homesick - 3) } };
  if (action.category === 'familia') return { ...state, life: { ...life, homesick: Math.max(0, life.homesick - 6) } };
  return state;
}

/** Marca o tempo usado: blocos da semana, o tipo (para o retorno decrescente) e o cooldown da carta. */
function spend(state: PlayerCareerState, window: string, id: string, category: AgendaCategory, cost: number, trainStep: boolean, cards: string[]): PlayerCareerState {
  const week = state.week?.window === window ? state.week : { window, used: 0, picks: [], trainStepped: false, cards };
  const used = week.used + cost;
  const now = playedCount(state);
  return {
    ...state,
    week: { window, used, picks: [...week.picks, id], trainStepped: week.trainStepped || trainStep, cards: week.cards ?? cards },
    weekLog: [...(state.weekLog ?? []), { at: now, group: groupOf(category) }].slice(-24),
    agendaUsed: { ...(state.agendaUsed ?? {}), [id]: now },
    ...(used >= weekBlocks(state) ? { trainedWindow: window } : {})
  };
}

/**
 * Faz uma ação da semana. A semana tem 3 blocos (2 antes de Major): dá para fazer de 1 a 3 coisas. Repetir o mesmo
 * tipo nas últimas 4 semanas rende menos (100%, 65%, 35%), e semana cheia cansa mais e arrisca mais.
 */
export function applyAgenda(state: PlayerCareerState, actionId: string): AgendaResult {
  const action = AGENDA_BY_ID.get(actionId) ?? null;
  const window = trainingWindowOf(state);
  const cost = action ? costOf(action) : 0;
  const already = Boolean(window && state.week?.window === window && action && state.week.picks.includes(action.id));
  if (!action || !window || already || cost > blocksLeft(state) || !agendaAvailable(state, action) || onCooldown(state, action)) {
    const line = !window || blocksLeft(state) === 0 ? 'A semana já está decidida. A próxima abre depois do campeonato.' : action && cost > blocksLeft(state) ? `Não cabe na semana: precisa de ${cost} blocos.` : 'Essa não dá agora.';
    return { state, action, line, chips: [], riskHit: false, overallUp: false };
  }
  const chips: AgendaChip[] = [];
  const tired = (state.fatigue ?? 0) >= TIRED_AT;
  const factor = diminishOf(state, action.category);
  const busy = state.week?.window === window ? state.week.used : 0;
  const base = scaleGains(weekMind(action.effects), factor);
  const attrs = tired && base.attrs
    ? Object.fromEntries(Object.entries(base.attrs).map(([key, value]) => [key, value > 0 ? Math.floor(value / 2) : value]))
    : base.attrs;
  // Semana cheia: cada bloco já usado soma 2 de cansaço em quem cansa.
  const fatigue = fatigueOf(action) + (fatigueOf(action) > 0 ? busy * 2 : 0);
  let next = applyEffects(state, { ...base, attrs, fatigue }, chips);
  next = lifeOfAction(next, action);
  const rng = createSeededRng(`${state.seed}:agenda:${window}:${action.id}`);
  const riskHit = Boolean(action.risk && rng() < action.risk.chance + busy * 0.05);
  if (riskHit && action.risk) next = applyEffects(next, action.risk.effects, chips);
  let overallUp = false;
  let trainCount = next.trainCount ?? 0;
  // A sessão de treino (a cada 3, +1 de overall) conta uma vez por semana.
  const stepped = state.week?.window === window && state.week.trainStepped;
  const trainStep = Boolean(action.effects.trainStep && !tired && !stepped);
  if (trainStep) {
    trainCount += 1;
    overallUp = trainCount % OVERALL_EVERY === 0 && next.overall < next.truePotential;
  }
  next = spend({ ...next, trainCount, ...(overallUp ? { overall: next.overall + 1 } : {}) }, window, action.id, action.category, cost, trainStep, drawAgenda(state).map((card) => card.id));
  const merged = mergeChips(chips);
  const contact = contactOf(state, action);
  const line = [
    tired && action.effects.attrs ? 'Cansado: rendeu metade.' : null,
    contact ? `Com ${contact.nick} (${contact.org}).` : null,
    action.line,
    factor < 1 ? `Repetiu o mesmo tipo de semana: rendeu ${Math.round(factor * 100)}%.` : null,
    riskHit && action.risk ? action.risk.line : null,
    overallUp ? 'Treino em dia: overall +1.' : null
  ].filter(Boolean).join(' ');
  return { state: next, action, line, chips: merged, riskHit, overallUp };
}

function mergeChips(chips: AgendaChip[]): AgendaChip[] {
  const byLabel = new Map<string, AgendaChip>();
  for (const chip of chips) {
    const current = byLabel.get(chip.label);
    byLabel.set(chip.label, current ? { ...current, value: current.value + chip.value } : chip);
  }
  return [...byLabel.values()].filter((chip) => chip.value !== 0);
}

/** As 8 habilidades que dá pra treinar no treino livre. */
export const TRAINABLE: TrainedAttribute[] = ['firepower', 'entry', 'clutch', 'awp', 'support', 'igl', 'mental', 'consistency'];

/** Pontos do treino livre: quanto mais habilidades, menos em cada uma (4 no total, 3 se for uma só). */
export function customTrainingSplit(attributes: TrainedAttribute[]): Partial<Record<TrainedAttribute, number>> {
  const picked = [...new Set(attributes)].filter((attribute) => TRAINABLE.includes(attribute)).slice(0, 4);
  const points = picked.length === 1 ? [3] : picked.length === 2 ? [2, 2] : picked.length === 3 ? [2, 1, 1] : [1, 1, 1, 1];
  return Object.fromEntries(picked.map((attribute, index) => [attribute, points[index]]));
}

/** Treino livre: você escolhe de 1 a 4 habilidades. Ocupa a vaga da semana e conta como sessão de treino. */
export function applyCustomTraining(state: PlayerCareerState, attributes: TrainedAttribute[]): AgendaResult {
  const window = trainingWindowOf(state);
  const split = customTrainingSplit(attributes);
  const names = Object.keys(split).map((attribute) => ATTR_LABEL[attribute as TrainedAttribute]);
  const doneThisWeek = Boolean(window && state.week?.window === window && state.week.picks.includes('treino-livre'));
  if (!window || blocksLeft(state) < FREE_TRAINING_COST || doneThisWeek || !names.length) {
    const line = !names.length ? 'Escolha pelo menos uma habilidade.' : doneThisWeek ? 'Treino livre já feito nesta semana.' : blocksLeft(state) > 0 ? `O treino livre precisa de ${FREE_TRAINING_COST} blocos.` : 'A semana já está decidida. A próxima abre depois do campeonato.';
    return { state, action: null, line, chips: [], riskHit: false, overallUp: false };
  }
  const chips: AgendaChip[] = [];
  const tired = (state.fatigue ?? 0) >= TIRED_AT;
  const factor = diminishOf(state, 'treino');
  const scaled = Object.fromEntries(Object.entries(split).map(([key, value]) => [key, Math.max(factor < 1 ? 0 : 1, Math.round((value ?? 0) * factor))]));
  const attrs = tired ? Object.fromEntries(Object.entries(scaled).map(([key, value]) => [key, Math.floor((value ?? 0) / 2)])) : scaled;
  const busy = state.week?.window === window ? state.week.used : 0;
  let next = applyEffects(state, { attrs, fatigue: 12 + Object.keys(split).length * 2 + busy * 2 }, chips);
  const stepped = state.week?.window === window && state.week.trainStepped;
  const trainStep = !tired && !stepped;
  const trainCount = (next.trainCount ?? 0) + (trainStep ? 1 : 0);
  const overallUp = trainStep && trainCount % OVERALL_EVERY === 0 && next.overall < next.truePotential;
  next = spend({ ...next, trainCount, ...(overallUp ? { overall: next.overall + 1 } : {}) }, window, 'treino-livre', 'treino', FREE_TRAINING_COST, trainStep, drawAgenda(state).map((card) => card.id));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
  const capped = !chips.some((chip) => chip.kind === 'attr') ? ' Essas habilidades já estão no teto do treino.' : '';
  const tiredLine = tired ? ' Cansado: rendeu metade e não contou para o overall.' : '';
  const repeatLine = factor < 1 ? ` Muito treino seguido: rendeu ${Math.round(factor * 100)}%.` : '';
  return { state: next, action: null, line: `Treino: ${list}.${tiredLine}${repeatLine}${capped}${overallUp ? ' Treino em dia: overall +1.' : ''}`, chips: mergeChips(chips), riskHit: false, overallUp };
}

/** O que importa em cada função: o coach olha estas habilidades para achar o seu ponto fraco. */
export const ROLE_SKILLS: Record<PlayerRole, TrainedAttribute[]> = {
  awper: ['awp', 'firepower', 'clutch', 'consistency'],
  rifler: ['firepower', 'consistency', 'clutch', 'entry'],
  entry: ['entry', 'firepower', 'support', 'consistency'],
  igl: ['igl', 'support', 'mental', 'consistency'],
  lurker: ['clutch', 'firepower', 'consistency', 'mental'],
  support: ['support', 'igl', 'consistency', 'firepower']
};

/** Conversas com o coach por TEMPORADA (não por campeonato). */
export const COACH_TALKS_PER_SEASON = 3;
export const COACH_TALKS_PER_WINDOW = COACH_TALKS_PER_SEASON;
const coachKeyOf = (state: PlayerCareerState) => (state.status === 'ACTIVE' ? `season:${state.seasonNumber}` : null);

export interface CoachTalkResult {
  state: PlayerCareerState;
  line: string;
  /** Habilidades que o coach indicou treinar nesta janela (vazio até a primeira conversa). */
  tips: TrainedAttribute[];
  talksLeft: number;
}

/** Conversa com o coach: até 3 por temporada, cada uma com um retorno diferente; a dica vale a temporada toda. */
export function coachTalk(state: PlayerCareerState, me: Player = myPlayerOf(state)): CoachTalkResult {
  const window = coachKeyOf(state);
  const current: { window: string; count: number; tips: TrainedAttribute[]; tipWindow?: string } = state.coachTalk && window && state.coachTalk.window === window ? state.coachTalk : { window: window ?? '', count: 0, tips: [] as TrainedAttribute[] };
  if (!window || current.count >= COACH_TALKS_PER_WINDOW) {
    return { state, line: 'O coach já falou tudo o que tinha para esta temporada.', tips: current.tips, talksLeft: 0 };
  }
  const value = (attribute: TrainedAttribute) => Number(me[attribute] ?? 60);
  const skills = ROLE_SKILLS[state.role];
  const sorted = [...skills].sort((a, b) => value(a) - value(b));
  let line: string;
  let tips = current.tips;
  let next: PlayerCareerState = state;
  if (current.count === 0) {
    tips = sorted.slice(0, 2);
    line = `Seu ponto fraco é ${ATTR_LABEL[tips[0]]} (${value(tips[0])}). Treina ${ATTR_LABEL[tips[0]]} e ${ATTR_LABEL[tips[1]]} nesta temporada.`;
  } else if (current.count === 1) {
    const morale = state.morale ?? 60;
    if (morale < 45) {
      line = 'Você está pesado. Uma folga ou o psicólogo ajudam mais que treino agora.';
      next = { ...next, morale: Math.min(100, morale + 3) };
    } else if ((state.form ?? 0) < 0) {
      line = 'Sua forma caiu. Revê as demos antes de treinar mais.';
    } else {
      line = 'Cabeça boa. Mantém a rotina e não inventa.';
      next = { ...next, morale: Math.min(100, morale + 1) };
    }
  } else {
    const best = [...skills].sort((a, b) => value(b) - value(a))[0];
    line = `Seu forte é ${ATTR_LABEL[best]} (${value(best)}). O time vai jogar mais por você nisso.`;
    if ((state.form ?? 0) < 1) next = { ...next, form: Math.min(3, (state.form ?? 0) + 1) };
  }
  const count = current.count + 1;
  // A dica (o que treinar) vale só a semana em que ele falou; o limite de conversas é da temporada.
  return { state: { ...next, coachTalk: { window, count, tips, tipWindow: current.count === 0 ? trainingWindowOf(state) ?? '' : current.tipWindow ?? '' } }, line, tips, talksLeft: COACH_TALKS_PER_WINDOW - count };
}

/** As dicas do coach valem só a semana em que ele falou (a marca no treino livre some no próximo campeonato). */
export function coachTipsOf(state: PlayerCareerState): TrainedAttribute[] {
  const window = coachKeyOf(state);
  const week = trainingWindowOf(state);
  return window && week && state.coachTalk?.window === window && state.coachTalk.tipWindow === week ? state.coachTalk.tips : [];
}

export function coachTalksLeft(state: PlayerCareerState): number {
  const window = coachKeyOf(state);
  return window && state.coachTalk?.window === window ? Math.max(0, COACH_TALKS_PER_WINDOW - state.coachTalk.count) : COACH_TALKS_PER_WINDOW;
}
