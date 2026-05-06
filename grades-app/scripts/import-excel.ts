/**
 * Импорт «Шаблон Скиллсет 2.0.xlsx» в БД.
 *
 * Создаёт MatrixVersion=1 и заполняет:
 *   - SkillTaxonomy (UI, UX, PRD, IND, RES) и SkillGroup
 *   - Build (creator, visioner, navigator)
 *   - Skill + SkillWeight + MasteryLevel
 *   - GradeLevel (intern, junior, junior_plus, middle, middle_plus, senior)
 *   - SkillGate (для каждой пары grade × build, какие навыки обязательны)
 *
 * Запуск: npm run import:excel
 *
 * Источник истины Excel-структуры — README.md «Импорт Excel».
 */

import * as XLSX from 'xlsx';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import type { BuildCode, GradeCode, SkillType } from '../src/lib/types';

const prisma = new PrismaClient();

const EXCEL_PATH =
  process.env.EXCEL_TEMPLATE_PATH || path.resolve(process.cwd(), '..', 'Шаблон Скиллсет 2.0.xlsx');

// ============================================================
// Парсинг
// ============================================================

interface ParsedSkill {
  tax: string; // UI/UX/PRD/IND/RES
  group: string;
  name: string;
  description: string;
  type: SkillType;
  maxMasteryLevel: number;
  rationale: string;
  weights: { creator: number; visioner: number; navigator: number };
  levels: { level: number; title: string; criteria: string }[];
  replaceableNote: string | null;
}

const TAX_NAMES: Record<string, string> = {
  UI: 'UI · Визуальное',
  UX: 'UX · Сценарии',
  PRD: 'PRD · Продукт',
  IND: 'IND · Самостоятельность',
  RES: 'RES · Результативность',
};

/**
 * Из текста «Критерии подтверждения / Множитель» вытаскиваем уровни мастерства.
 *
 * Если max=1 → один уровень «Освоен» с полным текстом.
 * Если max>1 → ищем паттерны "1. Title: ...", "2. Title: ..." и т.д.
 * Отдельно вытаскиваем пометку «Заменяемые навыки (З)».
 */
function parseLevels(criteria: string, maxLevel: number): {
  levels: { level: number; title: string; criteria: string }[];
  note: string | null;
} {
  if (!criteria || maxLevel === 1) {
    return {
      levels: [{ level: 1, title: 'Освоен', criteria: criteria || '' }],
      note: null,
    };
  }

  // Извлечь note "Заменяемые навыки..." если есть
  let note: string | null = null;
  const noteMatch = criteria.match(/(Заменяемые навыки[\s\S]*)/);
  if (noteMatch) {
    note = noteMatch[1].trim();
  }

  // Удалить note из основного текста, чтобы не смешивать
  const mainText = noteMatch ? criteria.slice(0, noteMatch.index!).trim() : criteria;

  // Разбить по паттерну «N. Title:»
  // Используем lookahead, чтобы сохранить разделитель
  const parts = mainText.split(/(?=^\s*\d+\.\s)/m).filter((p) => /^\s*\d+\.\s/.test(p));

  const levels: { level: number; title: string; criteria: string }[] = [];
  for (const p of parts) {
    const m = p.match(/^\s*(\d+)\.\s*([^:]+):\s*([\s\S]*)/);
    if (m) {
      const level = parseInt(m[1], 10);
      const title = m[2].trim();
      const text = m[3].trim();
      levels.push({ level, title, criteria: text });
    }
  }

  // Если не удалось распарсить — fallback: один уровень с целым текстом
  if (levels.length === 0) {
    return {
      levels: [{ level: 1, title: 'Освоен', criteria: mainText }],
      note,
    };
  }

  // Гарантировать, что есть все уровни 1..max (если каких-то нет — добавляем заглушки)
  for (let i = 1; i <= maxLevel; i++) {
    if (!levels.find((l) => l.level === i)) {
      levels.push({ level: i, title: `Уровень ${i}`, criteria: '' });
    }
  }
  levels.sort((a, b) => a.level - b.level);

  return { levels: levels.slice(0, maxLevel), note };
}

function parseSkillsSheet(workbook: XLSX.WorkBook): ParsedSkill[] {
  const sheet = workbook.Sheets['Скиллсет'];
  if (!sheet) throw new Error('Лист «Скиллсет» не найден в файле');

  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });

  const skills: ParsedSkill[] = [];
  // Ряд 0 — заголовки. Начинаем с 1.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tax = row[1]; // B: Характеристики (UI/UX/...)
    const group = row[2]; // C: Группа
    const name = row[3]; // D: Навык
    const description = row[4]; // E: Описание
    const type = row[5]; // F: Тип
    const maxMastery = row[6]; // G: Мастерство
    const criteria = row[7]; // H: Критерии
    const wNav = row[9]; // J: вес Навигатор
    const wVis = row[10]; // K: вес Визионер
    const wCre = row[11]; // L: вес Создатель
    const rationale = row[12]; // M: Обоснование

    if (!tax || !name || name === 'Навык') continue;
    if (!['UI', 'UX', 'PRD', 'IND', 'RES'].includes(String(tax))) continue;

    const max = parseInt(String(maxMastery), 10) || 1;
    const { levels, note } = parseLevels(String(criteria || ''), max);

    skills.push({
      tax: String(tax),
      group: String(group || '').trim(),
      name: String(name).trim(),
      description: String(description || '').trim(),
      type: type === 'SEC' ? 'SEC' : 'CORE',
      maxMasteryLevel: max,
      rationale: String(rationale || '').trim(),
      weights: {
        creator: Number(wCre) || 0,
        visioner: Number(wVis) || 0,
        navigator: Number(wNav) || 0,
      },
      levels,
      replaceableNote: note,
    });
  }

  return skills;
}

interface XpThresholds {
  intern: number;
  junior: number;
  junior_plus: number;
  middle: number;
  middle_plus: number;
  senior: number;
}

function parseXpGatesSheet(workbook: XLSX.WorkBook): Record<BuildCode, XpThresholds> {
  // По PRD пороги едины для всех билдов: 0/0/70/120/180/230.
  // Лист «Гейты (XP)» содержит конкретные значения; Excel показывает их как
  // "70 / 120 / 180 / 230 / 231+" — это пороги ENTRY.
  // Для Intern принимаем 0 (любой положительный XP даёт Junior, Intern = "оценка не начата").

  const fixed: XpThresholds = {
    intern: -1, // условный — фактически intern когда total <= 0
    junior: 0,
    junior_plus: 70,
    middle: 120,
    middle_plus: 180,
    senior: 230,
  };

  // Возвращаем одно и то же для всех билдов
  return {
    creator: { ...fixed },
    visioner: { ...fixed },
    navigator: { ...fixed },
  };
}

interface ParsedGate {
  build: BuildCode;
  grade: GradeCode;
  skillName: string;
  groupName: string;
  taxonomy: string;
  requiredMastery: number;
  hint: string; // оригинальный текст, для дебага
}

// Алиасы для рассогласования между именами навыков в листе «Гейты (билды)»
// и точными именами в листе «Скиллсет». Ключ = упрощённое имя из гейтов,
// значение = точное имя навыка.
const SKILL_ALIASES: Record<string, string> = {
  'Эстимирование и декомпозиция': 'Оценка и декомпозиция',
  'Коммуникация с разработкой': 'Знание разработки',
  'Design QA': 'Тестирование',
  'Защита и Презентация': 'Защита',
  'Работа со сложными задачами': 'Решение проблем',
  'Ревью (других)': 'Ревью',
  'Аналитика': 'Метрики',
  'Аналитика (Гипотезы)': 'Гипотезы',
  'Бизнес (CJM покупки)': 'Бизнес',
  'Экспертиза': 'Паттерны',
  'Сложные интерфейсы': 'Админ-интерфейсы',
  'Компоненты': 'Компоненты и лейауты',
};

function resolveSkillByGateName(
  allSkills: ParsedSkill[],
  tax: string,
  gateSkillName: string,
): ParsedSkill | null {
  const candidates = allSkills.filter((s) => s.tax === tax);

  // 1. Точное совпадение
  let match = candidates.find((s) => s.name === gateSkillName);
  if (match) return match;

  // 2. Алиас
  const aliased = SKILL_ALIASES[gateSkillName];
  if (aliased) {
    match = candidates.find((s) => s.name === aliased);
    if (match) return match;
  }

  // 3. Fuzzy: имя гейта содержит имя навыка или наоборот
  const lowerGate = gateSkillName.toLowerCase();
  match = candidates.find(
    (s) =>
      lowerGate.includes(s.name.toLowerCase()) ||
      s.name.toLowerCase().includes(lowerGate),
  );
  return match || null;
}

function parseGatesSheet(workbook: XLSX.WorkBook, allSkills: ParsedSkill[]): ParsedGate[] {
  const sheet = workbook.Sheets['Гейты (билды)'];
  if (!sheet) {
    console.warn('Лист «Гейты (билды)» не найден — пропускаю гейты');
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });

  // Структура: ряд 0 — заголовки (Билд, Джун, Джун+, Мидл, Мидл+, Синьор)
  // Каждая последующая строка билда: A=билд name, далее ячейки с многострочным текстом гейтов.

  const gradeColumns: { col: number; grade: GradeCode }[] = [
    { col: 1, grade: 'junior' }, // в шаблоне Джун — это "что нужно для Джун" (он пустой)
    { col: 2, grade: 'junior_plus' },
    { col: 3, grade: 'middle' },
    { col: 4, grade: 'middle_plus' },
    { col: 5, grade: 'senior' },
  ];

  const buildMap: Record<string, BuildCode> = {
    Навигатор: 'navigator',
    Визионер: 'visioner',
    Создатель: 'creator',
  };

  const result: ParsedGate[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const buildName = row[0];
    if (!buildName || !buildMap[buildName]) continue;
    const buildCode = buildMap[buildName];

    for (const { col, grade } of gradeColumns) {
      const cellText = row[col];
      if (!cellText) continue;
      const text = String(cellText);

      // Парсим строки вида "UI / Концептинг: Уровень 1 (Масштабируемая база)."
      // Или "UX / Компоненты и лейауты: Освоен (Критично!). Без автолейаутов..."
      const lines = text
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      for (const line of lines) {
        const m = line.match(/^([A-Z]+)\s*\/\s*([^:]+):\s*(.*)$/);
        if (!m) continue;
        const tax = m[1].trim();
        const skillName = m[2].trim();
        const requirement = m[3].trim();

        // Определить требуемый уровень мастерства из текста требования
        // "Уровень 1 (...)" → 1, "Уровень 2" → 2, "Освоен" → 1, "Мастер" → max, "Высший уровень" → max
        let requiredMastery = 1;
        const lvlMatch = requirement.match(/Уровень\s*(\d)/i);
        if (lvlMatch) {
          requiredMastery = parseInt(lvlMatch[1], 10);
        } else if (/Мастер|Высший|Высш\./i.test(requirement)) {
          // Найти max навыка через resolver
          const skill = resolveSkillByGateName(allSkills, tax, skillName);
          requiredMastery = skill?.maxMasteryLevel || 1;
        } else if (/Освоен/i.test(requirement)) {
          requiredMastery = 1;
        } else {
          requiredMastery = 1;
        }

        // Найти group этого навыка (с алиасами и fuzzy)
        const skill = resolveSkillByGateName(allSkills, tax, skillName);
        if (!skill) {
          console.warn(`  ⚠ Гейт ссылается на ненайденный навык: ${tax}/${skillName}  (gate: ${grade}, build: ${buildCode})`);
          continue;
        }

        result.push({
          build: buildCode,
          grade,
          skillName,
          groupName: skill.group,
          taxonomy: tax,
          requiredMastery,
          hint: line,
        });
      }
    }
  }

  return result;
}

// ============================================================
// Запись в БД
// ============================================================

async function ensureBuilds(): Promise<Record<BuildCode, number>> {
  const builds: { code: BuildCode; name: string; sortOrder: number }[] = [
    { code: 'visioner', name: 'Визионер', sortOrder: 1 },
    { code: 'navigator', name: 'Навигатор', sortOrder: 2 },
    { code: 'creator', name: 'Создатель', sortOrder: 3 },
  ];
  const result: Record<string, number> = {};
  for (const b of builds) {
    const row = await prisma.build.upsert({
      where: { code: b.code },
      create: b,
      update: { name: b.name, sortOrder: b.sortOrder },
    });
    result[b.code] = row.id;
  }
  return result as Record<BuildCode, number>;
}

async function ensureTaxonomies(): Promise<Record<string, number>> {
  const taxonomies = [
    { code: 'UI', sortOrder: 1 },
    { code: 'UX', sortOrder: 2 },
    { code: 'PRD', sortOrder: 3 },
    { code: 'IND', sortOrder: 4 },
    { code: 'RES', sortOrder: 5 },
  ];
  const result: Record<string, number> = {};
  for (const t of taxonomies) {
    const row = await prisma.skillTaxonomy.upsert({
      where: { code: t.code },
      create: { code: t.code, name: TAX_NAMES[t.code] || t.code, sortOrder: t.sortOrder },
      update: { name: TAX_NAMES[t.code] || t.code, sortOrder: t.sortOrder },
    });
    result[t.code] = row.id;
  }
  return result;
}

async function ensureGroups(
  taxonomyIds: Record<string, number>,
  skills: ParsedSkill[],
): Promise<Record<string, number>> {
  // group key = `${tax}::${groupName}`
  const result: Record<string, number> = {};
  const seen = new Set<string>();
  let order = 1;

  for (const s of skills) {
    const key = `${s.tax}::${s.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = await prisma.skillGroup.upsert({
      where: {
        taxonomyId_name: { taxonomyId: taxonomyIds[s.tax], name: s.group },
      },
      create: {
        taxonomyId: taxonomyIds[s.tax],
        name: s.group,
        sortOrder: order++,
      },
      update: { sortOrder: order++ },
    });
    result[key] = row.id;
  }
  return result;
}

async function importMatrix() {
  console.log(`📂 Reading ${EXCEL_PATH}`);
  const workbook = XLSX.readFile(EXCEL_PATH);

  console.log('  parsing skills...');
  const skills = parseSkillsSheet(workbook);
  console.log(`  ✓ ${skills.length} skills parsed`);

  console.log('  parsing XP thresholds...');
  const xpThresholds = parseXpGatesSheet(workbook);

  console.log('  parsing skill gates...');
  const gates = parseGatesSheet(workbook, skills);
  console.log(`  ✓ ${gates.length} gate rules parsed`);

  console.log('\n💾 Writing to database...');
  console.log('  • builds & taxonomies');
  const buildIds = await ensureBuilds();
  const taxIds = await ensureTaxonomies();
  const groupIds = await ensureGroups(taxIds, skills);

  // Создать MatrixVersion = 1, если ещё нет
  let matrixVersion = await prisma.matrixVersion.findFirst({
    where: { number: 1 },
  });

  if (matrixVersion) {
    console.log(`  ⚠ MatrixVersion #1 уже существует. Удаляю и пересоздаю.`);
    await prisma.matrixVersion.delete({ where: { id: matrixVersion.id } });
  }

  matrixVersion = await prisma.matrixVersion.create({
    data: {
      number: 1,
      isCurrent: true,
      comment: 'Импорт из Шаблон Скиллсет 2.0.xlsx',
    },
  });
  console.log(`  ✓ MatrixVersion #1 created (id=${matrixVersion.id})`);

  // Skills + Weights + MasteryLevels
  const skillIdByName = new Map<string, number>();
  for (const s of skills) {
    const groupId = groupIds[`${s.tax}::${s.group}`];
    if (!groupId) {
      throw new Error(`Group not found for ${s.tax}::${s.group}`);
    }

    const skill = await prisma.skill.create({
      data: {
        matrixVersionId: matrixVersion.id,
        groupId,
        name: s.name,
        description: s.description,
        type: s.type,
        maxMasteryLevel: s.maxMasteryLevel,
        replaceableNote: s.replaceableNote,
        rationale: s.rationale,
        active: true,
        weights: {
          create: [
            { matrixVersionId: matrixVersion.id, buildId: buildIds.creator, weight: s.weights.creator },
            { matrixVersionId: matrixVersion.id, buildId: buildIds.visioner, weight: s.weights.visioner },
            { matrixVersionId: matrixVersion.id, buildId: buildIds.navigator, weight: s.weights.navigator },
          ],
        },
        masteries: {
          create: s.levels.map((l) => ({
            matrixVersionId: matrixVersion!.id,
            level: l.level,
            title: l.title,
            criteria: l.criteria,
          })),
        },
      },
    });
    skillIdByName.set(`${s.tax}::${s.name}`, skill.id);
  }
  console.log(`  ✓ ${skills.length} skills + weights + mastery levels`);

  // GradeLevels с XP-порогами
  console.log('  • grade levels');
  const gradeOrder: GradeCode[] = ['intern', 'junior', 'junior_plus', 'middle', 'middle_plus', 'senior'];
  const gradeNames: Record<GradeCode, string> = {
    intern: 'Intern',
    junior: 'Джун',
    junior_plus: 'Джун+',
    middle: 'Мидл',
    middle_plus: 'Мидл+',
    senior: 'Синьор',
  };
  const gradeIdByCode = new Map<GradeCode, number>();
  for (let i = 0; i < gradeOrder.length; i++) {
    const code = gradeOrder[i];
    const grade = await prisma.gradeLevel.create({
      data: {
        matrixVersionId: matrixVersion.id,
        code,
        name: gradeNames[code],
        sortOrder: i,
        xpThresholds: {
          creator: xpThresholds.creator[code],
          visioner: xpThresholds.visioner[code],
          navigator: xpThresholds.navigator[code],
        },
      },
    });
    gradeIdByCode.set(code, grade.id);
  }
  console.log(`  ✓ ${gradeOrder.length} grade levels`);

  // SkillGates
  console.log('  • skill gates');
  let gateInserted = 0;
  for (const g of gates) {
    const skillId = skillIdByName.get(`${g.taxonomy}::${g.skillName}`);
    const gradeId = gradeIdByCode.get(g.grade);
    if (!skillId || !gradeId) continue;
    try {
      await prisma.skillGate.create({
        data: {
          matrixVersionId: matrixVersion.id,
          gradeLevelId: gradeId,
          buildId: buildIds[g.build],
          skillId,
          requiredMastery: g.requiredMastery,
        },
      });
      gateInserted++;
    } catch (e: any) {
      // duplicate (build × grade × skill) — некритично, пропускаем
      if (!String(e?.message || '').includes('Unique constraint')) {
        throw e;
      }
    }
  }
  console.log(`  ✓ ${gateInserted} skill gates`);

  // Sanity-check
  console.log('\n🧪 Sanity checks');
  const skillCount = await prisma.skill.count({ where: { matrixVersionId: matrixVersion.id } });
  const weightCount = await prisma.skillWeight.count({ where: { matrixVersionId: matrixVersion.id } });
  const gateCount = await prisma.skillGate.count({ where: { matrixVersionId: matrixVersion.id } });
  console.log(`  skills: ${skillCount}`);
  console.log(`  weights: ${weightCount} (ожидаем ${skillCount * 3})`);
  console.log(`  gates: ${gateCount}`);

  // Контрольный расчёт MAX XP по билдам
  for (const buildCode of ['creator', 'visioner', 'navigator'] as BuildCode[]) {
    const result: { sum: number | null }[] = await prisma.$queryRaw`
      SELECT SUM(s."maxMasteryLevel" * w.weight)::float AS sum
      FROM skills s
      JOIN skill_weights w ON w."skillId" = s.id AND w."buildId" = ${buildIds[buildCode]}
      WHERE s."matrixVersionId" = ${matrixVersion.id} AND s.active = true
    `;
    console.log(`  Σ MAX XP (${buildCode}): ${result[0]?.sum ?? 0}`);
  }

  console.log('\n✓ Импорт завершён успешно');
}

importMatrix()
  .catch((e) => {
    console.error('\n✗ Ошибка импорта:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
