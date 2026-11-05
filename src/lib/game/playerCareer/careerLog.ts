// src/lib/game/playerCareer/careerLog.ts
// O histórico da carreira fora do servidor, para a aba "Histórico" da sala de troféus: acontecimentos e dilemas
// (com a sua escolha e como saiu), as conversas com o elenco e o coach, as marcas que voltam depois e quem ficou
// atravessado com você. Só lê o save; não muda nada.
import type { PlayerCareerState } from './engine';
import { HAPPENING_BY_ID, SEVERITY_LABEL, type Severity } from './happenings';
import { DILEMMA_BY_ID } from './dilemmas';
import { answerText, memoryOf, SITUATION_LABEL } from './talks';
import { lifeOf } from './life';
import { MONTH_LABEL } from './calendar';

export interface DecisionRow { key: string; when: string; kind: 'Acontecimento' | 'Dilema'; title: string; severity: Severity | null; choice: string | null; success: boolean | null }
export interface TalkRow { key: string; when: string; who: string; situation: string; answer: string; delta: number }

export interface CareerLog { decisions: DecisionRow[]; talks: TalkRow[]; marks: string[]; grudges: string[] }

/** As marcas vêm sem acento (são chaves); para a tela, a palavra certa. */
const ACCENT: Record<string, string> = {
  calendario: 'calendário', coesao: 'coesão', comunicacao: 'comunicação', confianca: 'confiança', consistencia: 'consistência',
  elegibilidade: 'elegibilidade', financas: 'finanças', funcao: 'função', gestao: 'gestão', humilhacao: 'humilhação', lideranca: 'liderança',
  logistica: 'logística', midia: 'mídia', mudanca: 'mudança', pais: 'país', patrocinio: 'patrocínio', politica: 'política',
  preparacao: 'preparação', pressao: 'pressão', publica: 'pública', quimica: 'química', reconstrucao: 'reconstrução', reputacao: 'reputação',
  saude: 'saúde', seguranca: 'segurança', tatica: 'tática', transferencia: 'transferência', transferencias: 'transferências',
  familia: 'família', tensao: 'tensão', igl: 'IGL', org: 'org', planejada: 'planejada'
};
const NAMED: Record<string, string> = {
  visita_familia_planejada: 'visita à família planejada', acordo_folgas_org: 'acordo de folgas com a org',
  comunicacao_aberta_com_coach: 'conversa aberta com o coach', tensao_igl: 'tensão com o IGL', promessa_patrocinio: 'promessa ao patrocinador'
};
const KIND: Record<string, string> = { risco: 'risco', construtivo: 'construtivo', alternativo: 'alternativo' };
const words = (key: string) => key.split('_').map((word) => ACCENT[word] ?? word).join(' ');

/** "racha_interno:risco" → "racha interno (risco)". */
const markLabel = (flag: string) => {
  if (NAMED[flag]) return NAMED[flag];
  const [arc, kind] = flag.split(':');
  return kind ? `${words(arc)} (${KIND[kind] ?? words(kind)})` : words(arc);
};

export function careerLog(state: PlayerCareerState): CareerLog {
  const decisions: DecisionRow[] = [...(state.happeningHistory ?? [])].reverse().map((record, index) => {
    const dilemma = record.id.startsWith('dilema-') ? DILEMMA_BY_ID.get(record.id) : null;
    const event = dilemma ? null : HAPPENING_BY_ID.get(record.id);
    const choice = dilemma ? dilemma.options[record.choice ?? -1]?.text : event?.choices[record.choice ?? -1]?.text;
    return {
      key: `${record.id}:${index}`,
      when: `${MONTH_LABEL[record.month] ?? ''} ${record.year}`.trim(),
      kind: dilemma ? 'Dilema' : 'Acontecimento',
      title: dilemma?.title ?? event?.situation ?? record.id,
      severity: record.severity === 'grave' || record.severity === 'critico' ? record.severity : null,
      choice: record.line ?? choice ?? null,
      success: dilemma || record.success === undefined ? null : record.success
    };
  });
  const memory = memoryOf(state);
  const talks: TalkRow[] = [...memory.log].reverse().map((entry, index) => ({
    key: `${entry.who}:${index}`,
    when: `${state.year - (state.seasonNumber - entry.season)}`,
    who: entry.name,
    situation: SITUATION_LABEL[entry.situation],
    answer: answerText(entry.situation, entry.answer),
    delta: entry.delta
  }));
  // As marcas de dilema já aparecem na lista de decisões; aqui ficam os arcos e as marcas com nome.
  const marks = [...new Set(lifeOf(state).flags.filter((flag) => !/^checkup_|^dilema-/.test(flag)).map(markLabel))].reverse().slice(0, 12);
  const grudges = Object.entries(memory.grudges).filter(([, season]) => state.seasonNumber - season <= 1)
    .map(([id]) => memory.log.find((entry) => entry.who === id)?.name ?? id);
  return { decisions, talks, marks, grudges };
}

export { SEVERITY_LABEL };
