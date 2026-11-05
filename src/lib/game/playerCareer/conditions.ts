// src/lib/game/playerCareer/conditions.ts
// As condições das planilhas (semana, dilemas, acontecimentos) viram regras do jogo. Cada frase cai num de quatro
// tipos: FATO (conferido no estado e nos resultados reais), MOMENTO (antes do jogo, depois, entre campeonatos),
// PREMISSA (o próprio acontecimento cria a situação: um convite, uma proposta, um rumor) e NÃO SUPORTADO (fato de
// round que o motor não guarda: o item com ela nunca aparece). Nenhuma frase fica sem tipo (há teste para isso).
import { regionOf } from './calendar';
import { orgOf, playedCount, type CalendarEntry, type PlayerCareerState, type TournamentResult } from './engine';
import { lifeOf, livesAbroad, type CareerLife } from './life';
import { myFluency } from './language';
import { matesOf, myLanguageFit, planOf, type SquadMate } from './squad';
import { majorEntryStage, worldRankOf } from './live';
import { sceneOrgs } from './data';

export type Moment = 'pre' | 'post' | 'between';

export interface CareerCtx {
  state: PlayerCareerState;
  moment: Moment;
  /** O campeonato que acabou de terminar (depois do jogo). */
  result: TournamentResult | null;
  /** O último jogado (ou o que acabou de terminar). */
  last: TournamentResult | null;
  recent: TournamentResult[];
  next: CalendarEntry | null;
  upcoming: CalendarEntry[];
  life: CareerLife;
  abroad: boolean;
  orgRegion: string;
  level: number;
  mates: SquadMate[];
  avgRel: number;
  minRel: number;
}

/** Monta o contexto uma vez para checar várias condições. */
export function careerCtx(state: PlayerCareerState, moment: Moment, result: TournamentResult | null = null): CareerCtx {
  const org = orgOf(state.orgId, state) as { level: number; region?: string };
  const played = (state.calendar ?? []).filter((entry) => entry.result && !entry.result.skipped).map((entry) => entry.result!);
  const recent = [...state.history.flatMap((log) => log.tournaments.filter((entry) => !entry.skipped)), ...played].reverse();
  const upcoming = (state.calendar ?? []).filter((entry) => entry.status === 'UPCOMING');
  const mates = state.orgId === 'lan-house' ? [] : matesOf(state);
  const relations = mates.map((mate) => mate.relationship);
  return {
    state, moment, result, last: result ?? recent[0] ?? null, recent, next: upcoming[0] ?? null, upcoming,
    life: lifeOf(state), abroad: livesAbroad(state, org.region), orgRegion: org.region ?? regionOf(state.country), level: org.level,
    mates, avgRel: relations.length ? relations.reduce((sum, value) => sum + value, 0) / relations.length : 60, minRel: relations.length ? Math.min(...relations) : 60
  };
}

const real = (ctx: CareerCtx) => ctx.state.orgId !== 'lan-house';
const lostSeries = (result: TournamentResult | null) => (result?.opponents ?? []).some((game) => !game.won);
const reachedFinal = (result: TournamentResult | null) => result?.placement === 'Campeão' || result?.placement === 'Vice';
const big = (result: TournamentResult | null) => result?.tier === 'Major' || result?.tier === 'S';
const badRun = (ctx: CareerCtx) => ctx.recent.length >= 2 && ctx.recent.slice(0, 2).every((result) => !['Campeão', 'Vice', 'Semis'].includes(result.placement));
const lastMajor = (ctx: CareerCtx) => ctx.recent.find((result) => result.tier === 'Major') ?? null;
const seasonResults = (ctx: CareerCtx) => (ctx.state.calendar ?? []).flatMap((entry) => (entry.result && !entry.result.skipped ? [entry.result] : []));
const careerCount = (ctx: CareerCtx, placement: string) => ctx.recent.filter((result) => result.placement === placement).length;
const gapMonths = (ctx: CareerCtx) => {
  const lastMonth = Math.max(0, ...(ctx.state.calendar ?? []).filter((entry) => entry.status === 'PLAYED').map((entry) => entry.month ?? 0));
  return ctx.next ? (ctx.next.month ?? lastMonth) - lastMonth : 3;
};
const lostByScore = (ctx: CareerCtx, scores: string[]) => (ctx.last?.opponents ?? []).some((game) => !game.won && scores.includes(game.score ?? ''));
const rankOfName = (ctx: CareerCtx, name: string) => {
  const org = sceneOrgs.find((candidate) => candidate.name === name);
  return org ? worldRankOf(ctx.state, org.id) ?? 99 : 99;
};
const myRank = (ctx: CareerCtx) => worldRankOf(ctx.state, ctx.state.orgId) ?? 99;
const beatBetter = (ctx: CareerCtx) => (ctx.last?.opponents ?? []).some((game) => game.won && rankOfName(ctx, game.team) < myRank(ctx));
const lostToWorse = (ctx: CareerCtx) => (ctx.last?.opponents ?? []).some((game) => !game.won && rankOfName(ctx, game.team) > myRank(ctx) + 5);
const seriesWinStreak = (ctx: CareerCtx) => {
  let streak = 0;
  for (const result of ctx.recent) {
    for (const game of [...(result.opponents ?? [])].reverse()) { if (!game.won) return streak; streak += 1; }
  }
  return streak;
};
const changedLineup = (ctx: CareerCtx) => Object.keys(planOf(ctx.state).lineup).length > 0 || (ctx.state.kickedMates?.[ctx.state.orgId]?.length ?? 0) > 0;
const reserveHot = (ctx: CareerCtx) => {
  const reserve = planOf(ctx.state).reserve;
  return Boolean(reserve && reserve.overall >= ctx.state.overall - 4);
};
const fame = (ctx: CareerCtx) => ctx.state.fame ?? 0;
const money = (ctx: CareerCtx) => ctx.state.money ?? 0;
const fatigue = (ctx: CareerCtx) => ctx.state.fatigue ?? 0;
/** Fase do documento (1 online amador … 10 Tier S e legado) pelo nível do seu time. */
const phaseOf = (level: number) => ({ 5: 2, 4: 4, 3: 5, 2: 7, 1: 9, 0: 10 } as Record<number, number>)[level] ?? 1;

type Kind = 'fact' | 'moment' | 'premise' | 'unsupported';
interface Rule { kind: Kind; test: (ctx: CareerCtx, match: RegExpMatchArray) => boolean }
const fact = (test: Rule['test']): Rule => ({ kind: 'fact', test });
const moment = (...moments: Moment[]): Rule => ({ kind: 'moment', test: (ctx) => moments.includes(ctx.moment) });
const PREMISE: Rule = { kind: 'premise', test: () => true };
const UNSUPPORTED: Rule = { kind: 'unsupported', test: () => false };

/** Padrão (regex de frase inteira) → regra. A ordem importa: o primeiro que casar vale. */
const RULES: Array<[RegExp, Rule]> = [
  [/^sempre$|^temporada_ativa$/, fact(() => true)],
  [/^(?:fase_atual|fase)>=(\d+)$/, fact((ctx, m) => phaseOf(ctx.level) >= Number(m[1]))],
  [/^(\d+)\+ fãs$/, fact((ctx, m) => fame(ctx) >= Number(m[1]))],
  [/^fama>=(\d+)$/, fact((ctx, m) => fame(ctx) >= Number(m[1]) * 1000)],
  [/^fama_alta$|^proposta_milionaria$/, fact((ctx) => fame(ctx) >= 50000)],
  // Estrutura do time e contatos.
  [/^time de verdade \(não lan house\)$|^cidade com lazer disponível$|^contato com atletas disponível$|^servidor competitivo ativo$|^companheiro da mesma área disponível$|^coach disponível$/, fact(real)],
  [/^time estruturado$|^org estruturada$|^calendário de bootcamp$|^bootcamp opcional$/, fact((ctx) => real(ctx) && ctx.level <= 3)],
  [/^(?:analista|manager|fisioterapeuta) disponível$|^acesso à fisioterapia$|^gaming house$|^organização com academy$|^contato na base$|^(?:jogador da base|contato jovem) acessível$/, fact((ctx) => real(ctx) && ctx.level <= 2)],
  [/^(?:jogador )?(?:AWPer|entry|IGL|lurker|support|rifler) acessível$|^pro (?:da (?:mesma )?posição|conhecido) acessível$|^(?:mentor|especialista)(?: [a-zA-Z]+)?(?: de pistol)? (?:acessível|disponível)$|^veterano disponível$|^três veteranos acessíveis$|^contato IGL de outra equipe$|^IGL acessível$/, fact((ctx) => real(ctx) && ctx.level <= 4)],
  [/^contato internacional e idioma suficiente$/, fact((ctx) => ctx.level <= 3 && myFluency(ctx.state, 'en') >= 60)],
  [/^criador acessível$/, fact((ctx) => fame(ctx) >= 1000)],
  [/^jornalista acessível$/, fact((ctx) => fame(ctx) >= 2000)],
  [/^conterrâneo acessível$/, fact((ctx) => ctx.abroad)],
  [/^colega próximo acessível$/, fact((ctx) => ctx.mates.some((mate) => mate.relationship >= 75))],
  [/^histórico de ex-companheiros$|^ex_clube$/, fact((ctx) => new Set(ctx.state.history.map((log) => log.orgId)).size >= 2)],
  [/^convidado disponível$|^cidade com lazer disponível$/, fact(real)],
  // Idioma e país.
  [/^ainda há idioma para aprender$/, fact((ctx) => myFluency(ctx.state, 'en') < 95 || myLanguageFit(ctx.state).fluency < 95)],
  [/^idioma insuficiente$/, fact((ctx) => myLanguageFit(ctx.state).fluency < 40)],
  [/^idioma intermediário$/, fact((ctx) => { const value = myLanguageFit(ctx.state).fluency; return value >= 40 && value < 70; })],
  [/^morando fora(?: do país de origem)?$|^família distante$|^conflitos_viagem$/, fact((ctx) => ctx.abroad)],
  [/^brasileiro vivendo no exterior$/, fact((ctx) => ctx.abroad && ctx.state.country === 'Brazil')],
  [/^jogador vivendo na Europa$/, fact((ctx) => ctx.abroad && ctx.orgRegion === 'eu')],
  [/^org europeia$/, fact((ctx) => real(ctx) && ctx.orgRegion === 'eu')],
  [/^org estrangeira$|^região estrangeira ou mudança planejada$/, fact((ctx) => real(ctx) && ctx.abroad)],
  [/^jogador no país de origem$|^time atual nacional$/, fact((ctx) => !ctx.abroad)],
  [/^adaptação recente$/, fact((ctx) => ctx.abroad && ctx.life.abroadWeeks <= 20)],
  [/^mudança internacional há <= (\d+) semanas$/, fact((ctx, m) => ctx.abroad && ctx.life.abroadWeeks <= Number(m[1]))],
  [/^morando fora há >= (\d+) semanas$/, fact((ctx, m) => ctx.abroad && ctx.life.abroadWeeks >= Number(m[1]))],
  [/^saudade alta$/, fact((ctx) => ctx.life.homesick >= 60)],
  [/^elenco_multinacional$/, fact((ctx) => real(ctx) && myLanguageFit(ctx.state).language === 'en')],
  // Função.
  [/^função (awper|entry|igl|lurker|rifler|support)(?: ou (awper|entry|igl|lurker|rifler|support))?$/i, fact((ctx, m) => [m[1], m[2]].filter(Boolean).map((role) => role.toLowerCase()).includes(ctx.state.role))],
  [/^igl_sobrecarga$|^experiencia_igl_baixa$|^novo_capitao$/, fact((ctx) => ctx.state.role === 'igl')],
  [/^IGL ativo$/, fact((ctx) => ctx.mates.some((mate) => mate.player.role === 'igl') || ctx.state.role === 'igl')],
  // Resultados recentes (reais).
  [/^título recente$|^campeao$|^foi campeão$/, fact((ctx) => ctx.last?.placement === 'Campeão')],
  [/^titulo_menor_recente$/, fact((ctx) => ctx.last?.placement === 'Campeão' && !big(ctx.last))],
  [/^vice-campeonato recente$|^segundo_lugar$|^foi vice$/, fact((ctx) => ctx.last?.placement === 'Vice')],
  [/^vice_elite$/, fact((ctx) => ctx.last?.placement === 'Vice' && big(ctx.last))],
  [/^final_elite$|^final_mundial$|^final de Tier S ou Major$/, fact((ctx) => reachedFinal(ctx.last) && big(ctx.last))],
  [/^final_nacional$|^final_classificatoria$|^final de campeonato que não é Tier S nem Major$/, fact((ctx) => reachedFinal(ctx.last) && !big(ctx.last))],
  [/^chegou à final$/, fact((ctx) => reachedFinal(ctx.last))],
  [/^semifinal_lan$|^semifinal_internacional$|^caiu na semifinal$|^caiu na semifinal do último campeonato$/, fact((ctx) => ctx.last?.placement === 'Semis')],
  [/^derrota recente$|^derrota_recente$|^perdeu uma série no (?:último )?campeonato$|^entrevista_pos_derrota$/, fact((ctx) => lostSeries(ctx.last))],
  [/^derrota relevante$/, fact((ctx) => lostSeries(ctx.last) && ['S', 'A', 'Major'].includes(ctx.last?.tier ?? ''))],
  [/^eliminação recente$|^eliminado$|^eliminado_recentemente$|^eliminacao$|^não foi campeão$/, fact((ctx) => Boolean(ctx.last) && ctx.last!.placement !== 'Campeão')],
  [/^eliminação traumática$|^perda histórica recente$/, fact((ctx) => ['Semis', 'Vice'].includes(ctx.last?.placement ?? '') && big(ctx.last))],
  [/^derrota_13_0$|^derrota_elastica$/, fact((ctx) => lostByScore(ctx, ['0-2', '0-3']))],
  [/^derrotas_apertadas>=2$|^queda_mapa3$|^virada_sofrida$|^vantagem_perdida$/, fact((ctx) => lostByScore(ctx, ['1-2', '2-3']))],
  [/^três derrotas (?:recentes|seguidas)$|^dois campeonatos seguidos sem semifinal$/, fact(badRun)],
  [/^mental baixo ou sequência ruim$/, fact((ctx) => badRun(ctx) || ctx.life.mind <= 35)],
  [/^classificação recente$/, fact((ctx) => ['Semis', 'Vice', 'Campeão'].includes(ctx.last?.placement ?? ''))],
  [/^série apertada recente$/, fact((ctx) => (ctx.last?.opponents ?? []).some((game) => ['2-1', '1-2', '3-2', '2-3'].includes(game.score ?? '')))],
  [/^campanha 0-3 recente$|^suico_0_2$|^major_eliminado$|^caiu num stage do Major$|^campanha ruim em Major$/, fact((ctx) => ['Stage 1', 'Stage 2', 'Fase suíça'].includes(lastMajor(ctx)?.placement ?? ''))],
  [/^suico_2_2$/, fact((ctx) => (lastMajor(ctx)?.stages ?? []).some((stage) => stage.standings.some((row) => row.you && row.wins === 2 && row.losses === 2)))],
  [/^major$/, fact((ctx) => ctx.next?.format === 'major' || ctx.last?.tier === 'Major')],
  [/^major_em_andamento$/, fact((ctx) => ctx.moment === 'pre' && ctx.next?.format === 'major')],
  [/^major_playoffs$|^playoffs de Tier S ou Major$/, fact((ctx) => ['Quartas', 'Semis', 'Vice', 'Campeão'].includes(lastMajor(ctx)?.placement ?? ''))],
  [/^major_semifinal$/, fact((ctx) => ['Semis', 'Vice', 'Campeão'].includes(lastMajor(ctx)?.placement ?? ''))],
  [/^titulo_major_recente$|^campeao_major$|^ganhou um Major no último campeonato$|^campeão de Tier S ou Major$/, fact((ctx) => ctx.last?.placement === 'Campeão' && big(ctx.last))],
  [/^chegou à final de Major$/, fact((ctx) => reachedFinal(ctx.last) && ctx.last?.tier === 'Major')],
  [/^fora_major_por_margem_minima$|^decisao_vaga_major$/, fact((ctx) => lastMajor(ctx)?.placement === 'Não classificado')],
  [/^dois_majors$/, fact((ctx) => seasonResults(ctx).filter((result) => result.tier === 'Major').length >= 2)],
  [/^classificado para Major$|^classificado_major$|^lan_classificada$|^qualificatoria_major_proxima$/, fact((ctx) => ctx.upcoming.some((entry) => entry.format === 'major') && majorEntryStage(ctx.state) !== null)],
  [/^o próximo é Major e você nunca jogou um$/, fact((ctx) => ctx.next?.format === 'major' && !ctx.recent.some((result) => result.tier === 'Major'))],
  [/^mvp_recente$/, fact((ctx) => Boolean(ctx.last?.mvp?.you))],
  [/^mvp_sem_titulo$/, fact((ctx) => Boolean(ctx.last?.mvp?.you) && ctx.last?.placement !== 'Campeão')],
  [/^premiacao_individual$/, fact((ctx) => seasonResults(ctx).some((result) => result.mvp?.you))],
  [/^ranking_top1$|^já foi top 3 da HLTV$/, fact((ctx) => ctx.state.history.some((log) => (log.hltvRank ?? 99) <= 3))],
  [/^rating_baixo$/, fact((ctx) => (ctx.last?.rating ?? 1) < 0.95)],
  [/^rating 1\.25\+ no último campeonato$/, fact((ctx) => (ctx.last?.rating ?? 0) >= 1.25)],
  [/^ma_fase_12_mapas$/, fact((ctx) => ctx.recent.length >= 3 && ctx.recent.slice(0, 3).every((result) => result.rating < 0.97))],
  [/^temporada_boa$/, fact((ctx) => { const list = seasonResults(ctx); return list.length >= 3 && list.reduce((sum, result) => sum + result.rating, 0) / list.length >= 1.1; })],
  [/^tres_titulos$/, fact((ctx) => seasonResults(ctx).filter((result) => result.placement === 'Campeão').length >= 3)],
  [/^titulos_seguidos>=3$/, fact((ctx) => ctx.recent.length >= 3 && ctx.recent.slice(0, 3).every((result) => result.placement === 'Campeão'))],
  [/^sequencia_8_vitorias$|^recorde_vitorias$/, fact((ctx) => seriesWinStreak(ctx) >= 8)],
  [/^tres_vice_campeonatos$|^vice_historico$/, fact((ctx) => careerCount(ctx, 'Vice') >= 3)],
  [/^semifinais_sem_titulo>=4$/, fact((ctx) => careerCount(ctx, 'Semis') >= 4)],
  [/^6 títulos ou mais na carreira$|^premio_legado$|^documentario_legado$|^dinastia_crise$/, fact((ctx) => careerCount(ctx, 'Campeão') >= 6)],
  [/^primeira final da carreira$/, fact((ctx) => reachedFinal(ctx.last) && !ctx.recent.slice(1).some(reachedFinal))],
  [/^ganhou série de playoff(?: no último campeonato)?$/, fact((ctx) => (ctx.last?.opponents ?? []).some((game) => game.won && ['quarterfinal', 'semifinal', 'final'].includes(game.phase ?? '')))],
  [/^não chegou à final$/, fact((ctx) => Boolean(ctx.last) && !reachedFinal(ctx.last))],
  [/^chegou à semifinal ou mais$/, fact((ctx) => ['Semis', 'Vice', 'Campeão'].includes(ctx.last?.placement ?? ''))],
  [/^não foi campeão e perdeu uma série$/, fact((ctx) => ctx.last?.placement !== 'Campeão' && lostSeries(ctx.last))],
  [/^vitoria_sobre_favorito$|^vitoria_sobre_top$|^vitoria_top10_recente$|^vitoria_arena$/, fact(beatBetter)],
  [/^zebra_sofrida$/, fact(lostToWorse)],
  [/^LAN concluída recentemente$|^viagem longa recente$|^viagem_longa$|^jet lag ou sono desregulado$|^sono_ruim$/, fact((ctx) => Boolean(ctx.last) && !/online/i.test(ctx.state.calendar?.find((entry) => entry.result === ctx.last)?.location ?? ''))],
  // Calendário.
  [/^(?:próximo campeonato|campeonato próximo|jogo oficial nesta semana|ha_partida_na_janela|viagem ou campeonato próximo|semana apertada|calendario_apertado|calendario_saturado|adversário definido|adversário menos ranqueado|playoff marcado|jogo decisivo|final em até 3 dias)$/, fact((ctx) => Boolean(ctx.next))],
  [/^próxima LAN ou tier A\+$|^evento internacional$|^viagem internacional próxima$|^viajando para LAN$|^viagem_internacional$|^lan_presencial$|^LAN presencial$/, fact((ctx) => ['S', 'A', 'Major'].includes(ctx.next?.tier ?? ''))],
  [/^dois eventos internacionais próximos$|^viagens_frequentes$/, fact((ctx) => ctx.upcoming.slice(0, 2).filter((entry) => ['S', 'A', 'Major'].includes(entry.tier ?? '')).length >= 2)],
  [/^final BO5 próxima$/, fact((ctx) => ctx.next?.finalBestOf === 5)],
  [/^janela de pausa$|^pausa >= 7 dias$|^folga e destino disponível$|^sem evento oficial$|^sem jogo oficial em 7 dias$|^sem jogo hoje$|^folga autorizável$|^sem jogo decisivo$/, fact((ctx) => gapMonths(ctx) >= 2 || !ctx.next)],
  [/^dezembro$/, fact((ctx) => !ctx.next || (ctx.next.month ?? 0) >= 11)],
  [/^contrato em renovação$|^contrato em negociação$|^contrato pendente$|^contrato expira em 2 meses$|^fim_contrato_proximo$|^renovacoes_conflitantes$/, fact((ctx) => ctx.upcoming.length <= 2)],
  [/^lans_ano>=(\d+)$/, fact((ctx, m) => seasonResults(ctx).length >= Number(m[1]))],
  [/^temporadas_carreira>=(\d+)$/, fact((ctx, m) => ctx.state.history.length >= Number(m[1]))],
  // Estado do jogador e do elenco.
  [/^cansaço alto$|^fadiga>=60$/, fact((ctx) => fatigue(ctx) >= 60)],
  [/^fadiga_time>=65$/, fact((ctx) => fatigue(ctx) >= 65)],
  [/^cansaço acima do normal$|^cansaço moderado$/, fact((ctx) => fatigue(ctx) >= 40)],
  [/^carga alta$/, fact((ctx) => fatigue(ctx) >= 50)],
  [/^exaustao_persistente$|^companheiro_esgotado$|^coach_esgotado$/, fact((ctx) => fatigue(ctx) >= 70)],
  [/^motivacao_baixa$/, fact((ctx) => (ctx.state.morale ?? 60) <= 35)],
  [/^forma baixa$/, fact((ctx) => (ctx.state.form ?? 0) <= -1)],
  [/^mental do time baixo$|^tensão interna$|^conflito interno$|^atrito de comunicação$|^crise interna recente$|^conflito_antigo$|^crise_elenco$/, fact((ctx) => ctx.minRel < 40)],
  [/^queixa física presente$|^desconforto físico$|^dor_recorrente$|^lesao_esforco$|^doente$/, fact((ctx) => ctx.life.condition <= 55 || fatigue(ctx) >= 65)],
  [/^sem lesão limitante$/, fact((ctx) => ctx.life.condition >= 40)],
  [/^sem check-up no último ano$/, fact((ctx) => !ctx.life.flags.includes(`checkup_${ctx.state.year}`))],
  [/^reserva em alta$|^reserva_em_alta$|^disputa por titularidade$|^risco de banco ou disputa por titularidade$|^promessa_pede_vaga$/, fact(reserveHot)],
  [/^reserva_promissor$|^assediado_reserva$|^reserva_feito_clutch$/, fact((ctx) => Boolean(planOf(ctx.state).reserve))],
  [/^jogador reserva$|^jogador_banco$/, fact((ctx) => (ctx.state.benchedEvents ?? 0) > 0)],
  [/^novo jogador no elenco$|^mudanca_elenco$|^estrela_nova_no_time$|^vaga_no_elenco$|^corte_elenco$|^igl_saiu$/, fact(changedLineup)],
  [/^rivalidade ativa$|^rival conhecido$|^rival_[a-z_0-9]+$|^rivalidade_amigo$/, fact((ctx) => Boolean(ctx.state.rival) || ctx.life.flags.some((flag) => flag.startsWith('rivalidade')) || ctx.level <= 2)],
  [/^dinheiro suficiente$|^recursos para viagem$/, fact((ctx) => money(ctx) >= 3000)],
  [/^caixa_baixo$|^verba_insuficiente$|^clube_com_fluxo_caixa_fraco$/, fact((ctx) => money(ctx) < 1500 || ctx.level >= 4)],
  [/^sem agente$/, fact((ctx) => !ctx.life.flags.includes('agente'))],
  [/^tier 2$/, fact((ctx) => ctx.level === 2)],
  [/^tier >= 2$/, fact((ctx) => ctx.level <= 2)],
  [/^sem promoção há >= 2 temporadas$/, fact((ctx) => ctx.state.history.length >= 2 && ctx.state.history.slice(-2).every((log) => log.orgLevel === ctx.level))],
  [/^elite_em_pressao$|^pressao_legado$/, fact((ctx) => ctx.level <= 1)],
  [/^aposentadoria_anunciada$|^despedida_planejada$|^convite_despedida$/, fact((ctx) => ctx.state.age >= 33)],
  [/^teste_tier1$|^convite_standin_tier1$/, fact((ctx) => ctx.level >= 2 && ctx.state.overall >= 75)],
  [/^proposta_supertime$/, fact((ctx) => ctx.level <= 1 && ctx.state.overall >= 85)],
  [/^exposição pública$|^exposição ativa$|^patrocínio ativo$|^patrocinador ativo$|^campanha comercial ativa$|^proposta comercial$|^onda de críticas$|^convite de evento$|^convite para painel$|^convite de produção$|^feira presencial$|^vínculo com org$|^público elevado$|^semana de anúncio$|^jornalista pergunta sobre colega criticado$/, fact((ctx) => fame(ctx) >= 2000)],
  [/^treino_online$|^ping_desigual$/, fact((ctx) => ctx.level >= 3)],
  [/^dispensa possível$|^autorização da org$|^fora de competição$/, fact((ctx) => gapMonths(ctx) >= 2 || !ctx.next)],
  [/^viagem planejada$/, fact((ctx) => ctx.abroad || ctx.life.flags.includes('visita_familia_planejada'))],
  [/^scrim decisiva$|^imprensa presente$/, fact((ctx) => ['S', 'A', 'Major'].includes(ctx.next?.tier ?? ''))],
  [/^amigos no mesmo país$/, fact((ctx) => !ctx.abroad || ctx.mates.some((mate) => mate.relationship >= 70))],
  [/^amigo próximo acessível$/, fact((ctx) => ctx.mates.some((mate) => mate.relationship >= 75))],
  [/^moradia independente$/, fact((ctx) => money(ctx) >= 5000 && ctx.state.age >= 18)],
  [/^LAN ou feira presencial$/, fact((ctx) => ['S', 'A', 'Major'].includes(ctx.next?.tier ?? '') || fame(ctx) >= 2000)],
  [/^críticas recentes$/, fact((ctx) => lostSeries(ctx.last) && (fame(ctx) >= 1000 || ctx.life.pressure >= 60))],
  [/^clutch recente$/, fact((ctx) => (ctx.last?.plays?.clutches ?? 0) > 0)],
  [/^multiplas_propostas>=3$/, fact((ctx) => (ctx.state.pendingOffers?.length ?? 0) >= 3)],
  [/^md3_frequentes$/, fact((ctx) => (ctx.last?.opponents?.length ?? 0) >= 3)],
  [/^semana do aniversário$|^suspeita_integridade$|^vaias_intensas$/, PREMISE],
  // Momento do acontecimento.
  [/^(?:antes_da_partida|em_serie|estreia_amanha|torneio_amanha|playoff_amanha|semifinal_hoje|antes_da_semifinal|lan_em_4_dias|final_proxima|durante_torneio|qualificatoria_em_andamento|transmissao|mapa_final)$/, moment('pre')],
  [/^pos_partida$|^entrevista_publicada$|^repercussao_negativa$/, moment('post')],
  [/^inscricao_aberta$|^entre_torneios$|^descanso_programado$/, moment('between')],
  // Fatos de round que o motor não guarda: quem depende deles não aparece.
  [/^(?:overtime|mapa_decisivo|vantagem_12_5|perdendo_sequencia_rounds>=5|vantagens_perdidas>=5|clutch_perdido|erro_timeout|retake_exposto|erro_desarme_viral|erro_leitura_economia|pausa_round_controversa|pausa_tecnica_decisiva|upsets_contra_azaroes>=3|finais_top5_ruins|cinco_derrotas_rival|derrota_match_point|derrota_por_desconexao|clutches perdidos recentemente|faltas ou atrasos recentes|colega com má fase|relacionamento existente|desligado \(o jogo não tem tiebreak\))$/, UNSUPPORTED],
  // Premissas: o acontecimento cria a situação (convite, proposta, rumor, polêmica, logística).
  [/^(?:acusacao|assedio|assédio|bonus|bootcamp|campanha|convite|documentario|oferta|proposta|premiacao|rumor|vazamento|patrocinio|imagem|interferencia|investimento|linha|livro|luto|mensagens|passaporte|salario|saude|segredo|streamer|taticas|teto|torneio|torneios|venda|veto|visita|clipe|agenda|agente|alta|arena|atraso|capitao|coach|companheiro|conflito|critica|culpa|diferenca|diretoria|disputa|dois|entrevista|equipamento|erro|estilo|estrutura|evento|execucao|fans|homenagem|incidente|mudanca|parceiro|pressao|prazo|proximo|recorde|saida|titular|mudança|proposta|mudança de função|LAN coincide|evento familiar|compromisso de treino opcional|família)[_ a-zçãéêíóõú0-9<>=]*/i, PREMISE]
];

const cache = new Map<string, { rule: Rule; match: RegExpMatchArray } | null>();
export function ruleOf(clause: string): { rule: Rule; match: RegExpMatchArray } | null {
  if (cache.has(clause)) return cache.get(clause)!;
  for (const [pattern, rule] of RULES) {
    const match = clause.match(pattern);
    if (match && match[0] === clause) { cache.set(clause, { rule, match }); return { rule, match }; }
  }
  cache.set(clause, null);
  return null;
}

export const kindOf = (clause: string): Kind | null => ruleOf(clause)?.rule.kind ?? null;

/** Todas as condições valem? Momento: se houver alguma, o momento atual precisa estar entre elas. */
export function conditionsHold(clauses: readonly string[], ctx: CareerCtx): boolean {
  const moments = clauses.filter((clause) => kindOf(clause) === 'moment');
  if (moments.length && !moments.some((clause) => ruleOf(clause)!.rule.test(ctx, ruleOf(clause)!.match))) return false;
  return clauses.every((clause) => {
    const found = ruleOf(clause);
    if (!found) return false;
    if (found.rule.kind === 'moment') return true;
    return found.rule.test(ctx, found.match);
  });
}

/** O item depende de alguma condição que o motor não tem como conferir? */
export const isUnsupported = (clauses: readonly string[]) => clauses.some((clause) => kindOf(clause) === 'unsupported' || kindOf(clause) === null);

export { playedCount };
