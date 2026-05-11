/**
 * Парсер CSV-выгрузки Google Form для 360-оценки лидов и стардизов (Phase 22).
 *
 * Шаги:
 *   1. Разобрать CSV в массив строк (учёт кавычек и многострочных значений).
 *   2. Первая строка — заголовки. Маппим точный текст вопроса → SurveyItem.id.
 *   3. Каждая последующая строка — ответ респондента. Извлекаем роль из
 *      колонки «Какая у тебя роль в команде?», числовые значения 1-5 для
 *      пунктов категорий, eNPS из шкалы 1-10, текстовые ответы.
 *   4. Считаем средние арифметические: общее, по роли, по пункту, по категории.
 *   5. Возвращаем { responseCount, aggregates, errors }.
 *
 * Пустые значения и нечисловые («-», «нет», «—») не учитываются в среднем
 * для числовых пунктов. Для текстовых — пустая строка/прочерк просто не
 * добавляется в массив ответов.
 */

import {
  LEAD_SURVEY_CATEGORIES,
  ENPS_QUESTION,
  OPEN_QUESTIONS,
  ROLE_FROM_CSV,
  ROLE_COLUMN,
  type LeadReviewAggregates,
  type ResponderRole,
  type CategoryAggregate,
  type ItemAggregate,
  type OpenItemAggregate,
  type OpenAnswer,
  type RoleCounts,
} from './leadSurvey';

export type ParseResult =
  | {
      ok: true;
      responseCount: number;
      aggregates: LeadReviewAggregates;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      missingColumns?: string[];
    };

/** Состояние CSV-парсера. */
function parseCsv(input: string): string[][] {
  // BOM-маркер с начала, если есть
  const src = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // Игнорим CR — \r\n становится просто \n
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Последнее поле / строка
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Нормализация заголовка для маппинга (схлопываем пробелы и переносы строк). */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Безопасный парсер числа: возвращает null если не парсится. */
function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Игнорируем явные «нет ответа» маркеры
  if (/^(-+|—+|нет|n\/a|–)$/i.test(trimmed)) return null;
  // Иногда Google Form пишет «5 — Полностью согласен» — берём первое число
  const m = trimmed.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Number((sum / values.length).toFixed(2));
}

export function parseLeadReviewCsv(rawCsv: string): ParseResult {
  const rows = parseCsv(rawCsv);
  if (rows.length < 2) {
    return { ok: false, error: 'Файл пуст или содержит только заголовки.' };
  }

  const headers = rows[0].map((h) => h.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((h, idx) => {
    headerIndex.set(normalize(h), idx);
  });

  // Маппим колонки шаблона на индексы CSV
  const itemIndex = new Map<string, number>();
  const missing: string[] = [];

  const tryMap = (questionText: string, itemId: string) => {
    const idx = headerIndex.get(normalize(questionText));
    if (idx === undefined) {
      missing.push(questionText);
      return;
    }
    itemIndex.set(itemId, idx);
  };

  for (const cat of LEAD_SURVEY_CATEGORIES) {
    for (const it of cat.items) tryMap(it.question, it.id);
    for (const it of cat.openItems) tryMap(it.question, it.id);
  }
  tryMap(ENPS_QUESTION.question, ENPS_QUESTION.id);
  for (const oq of OPEN_QUESTIONS) tryMap(oq.question, oq.id);

  const roleColIdx = headerIndex.get(normalize(ROLE_COLUMN));
  if (roleColIdx === undefined) {
    return {
      ok: false,
      error: `В CSV не найдена колонка «${ROLE_COLUMN}». Убедись, что выгрузка из правильной Google Form.`,
    };
  }

  // Если совсем ничего не нашли — это явно не наш опрос
  if (itemIndex.size === 0) {
    return {
      ok: false,
      error:
        'В CSV не найдена ни одна знакомая колонка. Похоже, это выгрузка другого опроса либо тексты вопросов изменились.',
      missingColumns: missing,
    };
  }

  const warnings: string[] = [];
  if (missing.length > 0) {
    warnings.push(
      `Не найдено колонок в CSV: ${missing.length} шт. Эти пункты не попадут в отчёт. Возможно, форму редактировали.`,
    );
  }

  // Аккумуляторы
  type NumAcc = { all: number[]; byRole: Record<string, number[]> };
  type TextAcc = OpenAnswer[];
  const numAcc = new Map<string, NumAcc>();
  const textAcc = new Map<string, TextAcc>();

  // Инициализируем
  for (const cat of LEAD_SURVEY_CATEGORIES) {
    for (const it of cat.items) numAcc.set(it.id, { all: [], byRole: {} });
    for (const it of cat.openItems) textAcc.set(it.id, []);
  }
  numAcc.set(ENPS_QUESTION.id, { all: [], byRole: {} });
  for (const oq of OPEN_QUESTIONS) textAcc.set(oq.id, []);

  const roleCounts: RoleCounts = {};
  let totalResponses = 0;

  // Идём по строкам ответов
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Пропускаем полностью пустые строки (multiline-парсер может оставлять)
    if (row.every((c) => c.trim() === '')) continue;
    totalResponses++;

    const rawRole = (row[roleColIdx] ?? '').trim();
    const role: ResponderRole = ROLE_FROM_CSV[rawRole] ?? 'other';
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;

    // Числовые пункты
    for (const [itemId, colIdx] of itemIndex) {
      const isText = textAcc.has(itemId);
      const raw = row[colIdx] ?? '';
      if (isText) {
        const text = raw.trim();
        if (!text || /^-+$|^—+$/.test(text)) continue;
        textAcc.get(itemId)!.push({ role, text });
      } else {
        const num = parseNumeric(raw);
        if (num === null) continue;
        const acc = numAcc.get(itemId)!;
        acc.all.push(num);
        if (!acc.byRole[role]) acc.byRole[role] = [];
        acc.byRole[role].push(num);
      }
    }
  }

  if (totalResponses === 0) {
    return { ok: false, error: 'В CSV нет ни одной строки с ответами.' };
  }

  // Собираем агрегаты
  function buildItemAgg(itemId: string, question: string): ItemAggregate {
    const acc = numAcc.get(itemId);
    if (!acc) {
      return {
        id: itemId,
        question,
        average: null,
        averageByRole: {},
        answeredCount: 0,
      };
    }
    const averageByRole: ItemAggregate['averageByRole'] = {};
    for (const [role, vals] of Object.entries(acc.byRole)) {
      averageByRole[role as ResponderRole] = average(vals);
    }
    return {
      id: itemId,
      question,
      average: average(acc.all),
      averageByRole,
      answeredCount: acc.all.length,
    };
  }

  function buildOpenAgg(itemId: string, question: string): OpenItemAggregate {
    return {
      id: itemId,
      question,
      answers: textAcc.get(itemId) ?? [],
    };
  }

  const categories: CategoryAggregate[] = LEAD_SURVEY_CATEGORIES.map((cat) => {
    const items = cat.items.map((it) => buildItemAgg(it.id, it.question));
    const openItems = cat.openItems.map((it) => buildOpenAgg(it.id, it.question));

    // Среднее по категории = среднее всех её числовых пунктов, у которых есть среднее
    const itemAverages = items.map((i) => i.average).filter((v): v is number => v !== null);
    const categoryAverage = average(itemAverages);

    // Среднее по категории по роли: для каждой роли берём средние пунктов
    const allRoles = new Set<ResponderRole>();
    items.forEach((i) => Object.keys(i.averageByRole).forEach((r) => allRoles.add(r as ResponderRole)));
    const averageByRole: CategoryAggregate['averageByRole'] = {};
    for (const role of allRoles) {
      const vals = items
        .map((i) => i.averageByRole[role])
        .filter((v): v is number => typeof v === 'number');
      averageByRole[role] = average(vals);
    }

    return {
      id: cat.id,
      label: cat.label,
      average: categoryAverage,
      averageByRole,
      items,
      openItems,
    };
  });

  // eNPS
  const enpsAcc = numAcc.get(ENPS_QUESTION.id)!;
  const enpsByRole: Partial<Record<ResponderRole, number | null>> = {};
  for (const [role, vals] of Object.entries(enpsAcc.byRole)) {
    enpsByRole[role as ResponderRole] = average(vals);
  }

  const aggregates: LeadReviewAggregates = {
    roleCounts,
    totalResponses,
    categories,
    enps: {
      average: average(enpsAcc.all),
      averageByRole: enpsByRole,
      values: enpsAcc.all,
      answeredCount: enpsAcc.all.length,
    },
    openQuestions: OPEN_QUESTIONS.map((oq) => buildOpenAgg(oq.id, oq.question)),
  };

  return { ok: true, responseCount: totalResponses, aggregates, warnings };
}
