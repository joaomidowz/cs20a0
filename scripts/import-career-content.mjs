#!/usr/bin/env node
// scripts/import-career-content.mjs
// Importa o conteúdo da Carreira que o dono do jogo escreve em planilhas (content/career-source/) para os JSON que o
// jogo lê (src/lib/data/cs/career-*.game.json) e grava um relatório do que entrou e do que ficou de fora
// (career-import-report.game.json). Nada é descartado em silêncio: token de efeito desconhecido, linha duplicada e
// fala de round ficam no relatório.
// Uso: node scripts/import-career-content.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'content/career-source');
const OUT = join(root, 'src/lib/data/cs');
const report = { semana: {}, dilemas: {}, dialogos: {}, falas: {}, campeonatos: {}, acontecimentos: {} };

/** CSV com aspas (RFC 4180), BOM e quebras de linha dentro de campos. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((cell) => cell !== '')) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((key, index) => [key.trim(), (cells[index] ?? '').trim()])));
}

const read = (name) => readFileSync(join(SRC, name), 'utf8');
const clauses = (text) => (text ?? '').split(';').map((part) => part.trim()).filter(Boolean);

// Efeitos das planilhas ("moral +8; cansaço +7; idioma (do time) +8") → efeito do motor.
const ATTRS = new Set(['firepower', 'consistency', 'support', 'igl', 'clutch', 'entry', 'awp']);
function parseEffects(text, bucket, rowId) {
  const effects = {};
  for (const part of clauses(text)) {
    if (part === 'conta como treino') { effects.trainStep = true; continue; }
    const match = part.match(/^(.+?)\s*([+-]\d+)$/);
    if (!match) { bucket.push({ id: rowId, token: part, motivo: 'efeito sem valor numérico' }); continue; }
    const key = match[1].trim();
    const value = Number(match[2]);
    if (ATTRS.has(key)) { effects.attrs = { ...(effects.attrs ?? {}), [key]: value }; continue; }
    if (key === 'moral') effects.morale = value;
    else if (key === 'mental') effects.mind = value;
    else if (key === 'cansaço') effects.fatigue = value;
    else if (key === 'forma') effects.form = value;
    else if (key === 'fãs') effects.fame = value;
    else if (key === 'relação com o time') effects.team = value;
    else if (key === 'idioma (inglês)') effects.lang = { target: 'en', amount: value };
    else if (key === 'idioma (do time)') effects.lang = { target: 'team', amount: value };
    else bucket.push({ id: rowId, token: part, motivo: 'efeito sem equivalente no jogo' });
  }
  return effects;
}

// --- Semana ---------------------------------------------------------------------------------------------------
const weekRows = parseCsv(read('semana_cs13a0_expandida.csv'));
const ignoredWeekTokens = [];
const seenIds = new Set();
const duplicates = [];
const activities = [];
const originals = [];
for (const row of weekRows) {
  if (seenIds.has(row.id)) { duplicates.push(row.id); continue; }
  seenIds.add(row.id);
  const meta = { id: row.id, rarity: row.raridade || 'comum', cooldownWeeks: Number(row.cooldown_semanas) || 3, condition: clauses(row.so_aparece_se) };
  if (row.novo !== 'sim') { originals.push(meta); continue; }
  const chance = row.risco_chance ? Number(row.risco_chance.replace('%', '')) / 100 : 0;
  activities.push({
    ...meta, category: row.categoria, title: row.titulo, text: row.texto,
    effects: parseEffects(row.efeitos, ignoredWeekTokens, row.id), line: row.frase_depois,
    risk: chance > 0 ? { chance, effects: parseEffects(row.risco_efeitos, ignoredWeekTokens, row.id), line: row.risco_frase } : null,
    axis: row.eixo_principal
  });
}
report.semana = { linhas: weekRows.length, originais_preservadas: originals.length, novas_importadas: activities.length, duplicadas_recusadas: duplicates, tokens_ignorados: ignoredWeekTokens };
writeFileSync(join(OUT, 'career-week.game.json'), JSON.stringify({ originals, activities }, null, 1));

// --- Dilemas --------------------------------------------------------------------------------------------------
const dilemmaRows = parseCsv(read('semana_cs13a0_dilemas.csv'));
const ignoredDilemmaTokens = [];
const dilemmas = new Map();
for (const row of dilemmaRows) {
  const group = dilemmas.get(row.grupo) ?? { id: row.grupo, title: row.titulo, condition: clauses(row.so_aparece_se), cooldownWeeks: Number(row.cooldown_semanas) || 12, options: [] };
  group.options.push({ key: row.opcao, text: row.escolha, effects: parseEffects(row.efeitos, ignoredDilemmaTokens, `${row.grupo}/${row.opcao}`), result: row.resultado });
  dilemmas.set(row.grupo, group);
}
const validDilemmas = [...dilemmas.values()].filter((group) => group.options.length >= 2);
report.dilemas = { linhas: dilemmaRows.length, dilemas: validDilemmas.length, recusados_menos_de_2_opcoes: [...dilemmas.values()].filter((group) => group.options.length < 2).map((group) => group.id), tokens_ignorados: ignoredDilemmaTokens };
writeFileSync(join(OUT, 'career-dilemmas.game.json'), JSON.stringify({ dilemmas: validDilemmas }, null, 1));

// --- Diálogos de decisão --------------------------------------------------------------------------------------
const dialogueRows = parseCsv(read('dialogos_cs13a0_decisoes.csv'));
const dialogues = new Map();
for (const row of dialogueRows) {
  const item = dialogues.get(row.id_dilema) ?? { id: row.id_dilema, speaker: row.interlocutor, situation: row.situacao, line: row.fala_inicial, trigger: clauses(row.gatilho), options: [] };
  const effects = Object.fromEntries(clauses(row.efeitos_sugeridos).map((part) => {
    const [key, value] = part.split(':');
    return [key.trim(), Number(value)];
  }));
  item.options.push({ text: row.resposta_do_jogador, effects });
  dialogues.set(row.id_dilema, item);
}
report.dialogos = { linhas: dialogueRows.length, dialogos: dialogues.size };
writeFileSync(join(OUT, 'career-dialogues.game.json'), JSON.stringify({ dialogues: [...dialogues.values()] }, null, 1));

// --- Falas (o JSON é a fonte; o CSV tem as mesmas linhas) -----------------------------------------------------------
const lines = JSON.parse(read('falas_cs13a0_contextuais.json'));
const pick = (line) => ({
  situation: line.situacao, speaker: line.interlocutor, text: line.texto, tone: line.tom, relMin: line.relacao_min, relMax: line.relacao_max,
  mindMin: line.mental_min, mindMax: line.mental_max, cooldown: line.cooldown_rounds, weight: line.peso, effects: line.efeitos_sugeridos
});
const contextual = lines.filter((line) => line.tipo === 'conversa contextual').map(pick);
const decisive = lines.filter((line) => line.tipo === 'fala pós-round' && line.situacao.startsWith('round_decisivo')).map(pick);
const skipped = {};
for (const line of lines) {
  if (line.tipo === 'conversa contextual' || (line.tipo === 'fala pós-round' && line.situacao.startsWith('round_decisivo'))) continue;
  const reason = line.tipo === 'fala pós-round' ? `fala de round (${line.situacao}): o motor não guarda esse fato do round`
    : line.origem === 'original' ? `já está no jogo (${line.tipo})` : `tipo ${line.tipo}`;
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}
report.falas = { total: lines.length, conversas_de_contexto: contextual.length, falas_de_round_decisivo_na_partida: decisive.length, nao_usadas: skipped };
writeFileSync(join(OUT, 'career-lines.game.json'), JSON.stringify({ contextual, decisive }, null, 1));

// --- Campeonatos: os retornos históricos --------------------------------------------------------------------------
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PERIOD = { bienal: 2, 'a cada 3 anos': 3, 'a cada 4 anos': 4 };
const TIER = { Major: 'Major', 'Tier S': 'S', 'Tier A': 'A', 'Tier B': 'B', 'Tier C': 'C' };
const eventRows = parseCsv(read('campeonatos_cs13a0_com_retornos.csv'));
const revivals = [];
const rejected = [];
for (const row of eventRows) {
  if (row.origem_calendario !== 'retorno histórico fictício') continue;
  const period = PERIOD[row.frequencia_sugerida];
  const month = MONTHS.indexOf(row.mes) + 1;
  if (!period || !month || !TIER[row.tier]) { rejected.push({ nome: row.nome, motivo: 'frequência, mês ou tier desconhecido' }); continue; }
  const teams = Number(row.equipes) || 8;
  revivals.push({
    name: row.nome, circuit: row.circuito, region: row.regiao, tier: TIER[row.tier], month, formatOriginal: row.formato,
    // O motor joga mata-mata de 8, suíça de 16 ou Major: formato que ele não tem vira o mais próximo, com aviso na tela.
    format: teams >= 12 ? 'swiss16' : 'bracket8', finalBestOf: row.final === 'MD5' ? 5 : 3,
    organizer: row.organizador, location: row.local, prizePool: Number(row.premiacao_usd) || 0, teams, periodYears: period,
    rotationGroup: row.grupo_rotacao, note: row.observacao_design
  });
}
report.campeonatos = { linhas: eventRows.length, originais_ja_no_jogo: eventRows.length - revivals.length - rejected.length, retornos_importados: revivals.length, recusados: rejected };
writeFileSync(join(OUT, 'career-revivals.game.json'), JSON.stringify({ revivals }, null, 1));

// --- Acontecimentos (350): os 150 legados mantêm o motor de hoje e ganham os metadados; os 200 novos entram ---------
const source = JSON.parse(read('acontecimentos_cs2_350.json'));
const SEVERITY = { leve: 'comum', comum: 'comum', moderado: 'moderado', grave: 'grave', critico: 'critico' };
const EFFECT = { forma: 'form', mental: 'mind', reputacao: 'reputation', quimica: 'chemistry', fadiga: 'fatigue', fama: 'fame', caixa: 'money' };
const legacy = {};
const created = [];
const unknownEffects = [];
const seenEvents = new Set();
const duplicatedEvents = [];
for (const event of source.eventos) {
  if (seenEvents.has(event.id)) { duplicatedEvents.push(event.id); continue; }
  seenEvents.add(event.id);
  const meta = { severity: SEVERITY[event.severidade] ?? 'comum', cooldownMonths: event.cooldown_meses, yearLimit: event.limite_por_ano, unique: event.unico_por_carreira, arc: event.arco };
  if (event.tipo === 'legado_revisao_pendente') { legacy[event.id] = meta; continue; }
  created.push({
    id: event.id, phase: event.fase, tierMin: event.fase_minima, situation: event.situacao, conditions: event.condicoes, weight: event.peso_base, ...meta,
    choices: event.escolhas.map((choice) => ({
      text: choice.texto,
      effects: Object.fromEntries(Object.entries(choice.efeitos ?? {}).flatMap(([key, value]) => {
        if (!EFFECT[key]) { unknownEffects.push({ id: event.id, token: key }); return []; }
        return value ? [[EFFECT[key], value]] : [];
      })),
      result: choice.resultado_imediato,
      flags: choice.flags_adicionadas ?? [],
      futureWeight: choice.peso_consequencia_futura ?? 0
    }))
  });
}
report.acontecimentos = {
  total: source.eventos.length, legados_com_metadados: Object.keys(legacy).length, novos_importados: created.length,
  duplicados_recusados: duplicatedEvents, efeitos_desconhecidos: unknownEffects, avisos_do_arquivo: source.avisos
};
writeFileSync(join(OUT, 'career-events-v3.game.json'), JSON.stringify({ legacy, events: created }, null, 1));

writeFileSync(join(OUT, 'career-import-report.game.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({
  semana: report.semana.novas_importadas, dilemas: report.dilemas.dilemas, dialogos: report.dialogos.dialogos, falas: report.falas.conversas_de_contexto,
  retornos: report.campeonatos.retornos_importados, acontecimentos_novos: report.acontecimentos.novos_importados
}));
