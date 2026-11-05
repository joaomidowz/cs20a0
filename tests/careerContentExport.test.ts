// tests/careerContentExport.test.ts
// Exporta todo o conteúdo da Carreira em planilhas (CSV) para o dono do jogo revisar e aumentar: situações do round
// decisivo (com quando cada uma cai), campeonatos, acontecimentos (com condição e o que a escolha muda), a semana
// e as falas. Só roda com CAREER_EXPORT=<pasta>.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { circuitCatalog, MONTH_LABEL, TIER_LABEL } from '../src/lib/game/playerCareer/calendar';
import { DECISION_MATRIX, SHARED_SITUATIONS, STORIES, situationWhen, type ClutchProfile, type ClutchSituation } from '../src/lib/game/playerCareer/decisions';
import { HAPPENINGS, BENCH_MOVE_LABEL, CALENDAR_MOVE_LABEL, NEED_LABEL, benchMoveOf, benchOf, calendarMoveOf, roleMoveOf, triggerOf, TRIGGER_LABEL, type HappeningEffect } from '../src/lib/game/playerCareer/happenings';
import { AGENDA, CATEGORY_LABEL } from '../src/lib/game/playerCareer/agenda';
import { TALK_LINES } from '../src/lib/game/playerCareer/squad';
import { TRASH_TALK } from '../src/lib/game/playerCareer/rivals';

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';

const PROFILE_PT: Record<ClutchProfile, string> = { solid: 'seguro', read: 'leitura', gamble: 'aposta', team: 'coletivo' };
const ROLE_PT: Record<string, string> = { awper: 'AWPer', rifler: 'Rifler', entry: 'Entry', igl: 'IGL', lurker: 'Lurker', support: 'Suporte', any: 'todas' };
const FORMAT_PT: Record<string, string> = { bracket8: 'mata-mata de 8', swiss16: 'suíça de 16 + mata-mata', major: 'Major (3 stages + playoffs)' };
const EFFECT_PT: Record<HappeningEffect, string> = { performance: 'Forma', fatigue: 'Cansaço', mental: 'Mental e moral', mind: 'Mental', reputation: 'Reputação', money: 'Caixa', chemistry: 'Química', fame: 'Fãs' };

describe.skipIf(!process.env.CAREER_EXPORT)('exportar conteúdo da carreira (CAREER_EXPORT=<pasta>)', () => {
  it('grava as planilhas', () => {
    const dir = process.env.CAREER_EXPORT!;
    mkdirSync(dir, { recursive: true });

    const situations: ClutchSituation[] = [...Object.values(DECISION_MATRIX).flat(), ...SHARED_SITUATIONS];
    writeFileSync(join(dir, 'situacoes-round-decisivo.csv'), csv(
      ['id', 'funcao', 'situacao', 'alternativa_1', 'estilo_1', 'alternativa_2', 'estilo_2', 'alternativa_3', 'estilo_3', 'lado', 'bomba', 'quando'],
      situations.map((situation) => {
        const when = situationWhen(situation);
        return [situation.id, ROLE_PT[situation.role] ?? situation.role, situation.text,
          ...situation.alternatives.flatMap((alternative) => [alternative.text, PROFILE_PT[alternative.profile]]), when.side, when.bomb, when.moment];
      })
    ));

    writeFileSync(join(dir, 'campeonatos.csv'), csv(
      ['circuito', 'regiao', 'nome', 'tier', 'mes', 'formato', 'final', 'organizador', 'local', 'premiacao_usd'],
      circuitCatalog(2027).map((event) => [event.circuit, event.region, event.name, TIER_LABEL[event.tier], MONTH_LABEL[event.month - 1], FORMAT_PT[event.format], `MD${event.finalBestOf}`, event.organizer ?? '', event.location ?? '', event.prizePool ?? ''])
    ));

    const effects = (record: Partial<Record<HappeningEffect, number>>) => Object.entries(record).filter(([, value]) => value).map(([key, value]) => `${EFFECT_PT[key as HappeningEffect]} ${value! > 0 ? '+' : ''}${value}`).join('; ');
    writeFileSync(join(dir, 'acontecimentos.csv'), csv(
      ['id', 'fase', 'fase_minima', 'quando', 'peso', 'intervalo_minimo', 'situacao', 'so_aparece_se', ...[1, 2, 3].flatMap((n) => [`escolha_${n}`, `efeitos_${n}`, `consequencia_${n}`, `muda_${n}`])],
      HAPPENINGS.map((event) => [event.id, event.phase, event.tierMin, TRIGGER_LABEL[triggerOf(event)], event.weight, Math.max(event.cooldown, 8), event.situation, NEED_LABEL[event.id] ?? 'sempre',
        ...event.choices.flatMap((choice, index) => {
          const move = calendarMoveOf(event.id, index);
          const role = roleMoveOf(event.id, index);
          const changes = [move ? CALENDAR_MOVE_LABEL[move] : null, benchOf(event.id, index) ? 'você fica no banco no próximo campeonato' : null,
            role ? (role === 'melhor' ? 'você troca para a função em que rende mais' : `você vira ${ROLE_PT[role] ?? role}`) : null,
            benchMoveOf(event.id, index) ? BENCH_MOVE_LABEL(benchMoveOf(event.id, index)!) : null].filter(Boolean).join('; ');
          return [choice.text, effects(choice.effects), choice.consequence, changes];
        })])
    ));

    const agendaEffects = (action: (typeof AGENDA)[number]['effects']) => [
      ...Object.entries(action.attrs ?? {}).map(([key, value]) => `${key} ${value! > 0 ? '+' : ''}${value}`),
      action.morale ? `moral ${action.morale > 0 ? '+' : ''}${action.morale}` : null,
      action.form ? `forma ${action.form > 0 ? '+' : ''}${action.form}` : null,
      action.fame ? `fãs ${action.fame > 0 ? '+' : ''}${action.fame}` : null,
      action.team ? `relação com o time ${action.team > 0 ? '+' : ''}${action.team}` : null,
      action.fatigue ? `cansaço ${action.fatigue > 0 ? '+' : ''}${action.fatigue}` : null,
      action.lang ? `idioma (${action.lang.target === 'en' ? 'inglês' : 'do time'}) +${action.lang.amount}` : null,
      action.trainStep ? 'conta como treino' : null
    ].filter(Boolean).join('; ');
    writeFileSync(join(dir, 'semana.csv'), csv(
      ['id', 'categoria', 'titulo', 'texto', 'efeitos', 'frase_depois', 'risco_chance', 'risco_efeitos', 'risco_frase', 'so_aparece_se'],
      AGENDA.map((action) => [action.id, CATEGORY_LABEL[action.category], action.title, action.text, agendaEffects(action.effects), action.line,
        action.risk ? `${Math.round(action.risk.chance * 100)}%` : '', action.risk ? agendaEffects(action.risk.effects) : '', action.risk?.line ?? '',
        [action.needs?.realOrg ? 'time de verdade (não lan house)' : null, action.needs?.fame ? `${action.needs.fame}+ fãs` : null, action.needs?.roles ? `função: ${action.needs.roles.join('/')}` : null, action.needs?.language ? 'ainda há idioma para aprender' : null].filter(Boolean).join('; ') || 'sempre'])
    ));

    const lines: unknown[][] = [
      ...Object.entries(TALK_LINES).flatMap(([kind, list]) => list.map((text) => ['conversa com parceiro', kind === 'good' ? 'conversa boa (55%)' : kind === 'neutral' ? 'conversa neutra (30%)' : 'atrito (15%)', text])),
      ...TRASH_TALK.map((make) => ['provocação de rival', 'antes do campeonato (18% a 40%)', make('{rival}', '{voce}')]),
      ...(Object.entries(STORIES) as Array<[ClutchProfile, { won: string[]; lost: string[] }]>).flatMap(([profile, story]) => [
        ...story.won.map((text) => ['história da call', `${PROFILE_PT[profile]} · round ganho`, text]),
        ...story.lost.map((text) => ['história da call', `${PROFILE_PT[profile]} · round perdido`, text])
      ])
    ];
    writeFileSync(join(dir, 'falas.csv'), csv(['tipo', 'quando', 'texto'], lines));

    expect(situations.length).toBeGreaterThan(300);
  });
});
