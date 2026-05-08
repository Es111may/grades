export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import MatrixClient from './MatrixClient';

const TAXONOMY_NAMES: Record<string, string> = {
  UI: 'UI · Визуал',
  UX: 'UX · Система',
  PRD: 'PRD · Продукт',
  IND: 'IND · Самостоятельность',
  RES: 'RES · Ответственность',
};

async function ensureTaxonomyNames() {
  for (const [code, name] of Object.entries(TAXONOMY_NAMES)) {
    const t = await prisma.skillTaxonomy.findUnique({ where: { code } });
    if (t && t.name !== name) {
      await prisma.skillTaxonomy.update({ where: { code }, data: { name } });
    }
  }
}

const GROUP_RENAMES: Array<{ from: string; to: string }> = [
  { from: 'Контент-дизайн', to: 'Контент' },
];

async function ensureGroupNames() {
  for (const { from, to } of GROUP_RENAMES) {
    const oldGroups = await prisma.skillGroup.findMany({ where: { name: from } });
    for (const old of oldGroups) {
      // Если в той же таксономии уже есть группа с целевым именем —
      // переносим скиллы в неё и удаляем старую (иначе unique-constraint).
      const existing = await prisma.skillGroup.findFirst({
        where: { taxonomyId: old.taxonomyId, name: to },
      });
      if (existing) {
        await prisma.skill.updateMany({
          where: { groupId: old.id },
          data: { groupId: existing.id },
        });
        await prisma.skillGroup.delete({ where: { id: old.id } });
      } else {
        await prisma.skillGroup.update({
          where: { id: old.id },
          data: { name: to },
        });
      }
    }
  }
}

export default async function AdminMatrixPage() {
  await ensureTaxonomyNames();
  await ensureGroupNames();

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) {
    return (
      <main className="max-w-[800px] mx-auto px-8 pt-12">
        <p className="text-stone">Активная матрица не найдена.</p>
      </main>
    );
  }

  const builds = await prisma.build.findMany({ orderBy: { id: 'asc' } });

  const groups = await prisma.skillGroup.findMany({
    include: { taxonomy: true },
    orderBy: [
      { taxonomy: { sortOrder: 'asc' } },
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });

  const taxonomies = await prisma.skillTaxonomy.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  const skills = await prisma.skill.findMany({
    where: { matrixVersionId: matrix.id },
    include: {
      weights: true,
      group: { include: { taxonomy: true } },
      masteries: { orderBy: { level: 'asc' } },
    },
    orderBy: [
      { group: { taxonomy: { sortOrder: 'asc' } } },
      { group: { sortOrder: 'asc' } },
      { name: 'asc' },
    ],
  });

  const data = skills.map((s) => {
    const weightMap: Record<number, number> = {};
    for (const w of s.weights) weightMap[w.buildId] = w.weight;
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      type: s.type,
      maxMasteryLevel: s.maxMasteryLevel,
      active: s.active,
      taxonomyCode: s.group.taxonomy.code,
      taxonomyName: s.group.taxonomy.name,
      groupName: s.group.name,
      weights: weightMap,
      masteries: s.masteries.map((m) => ({
        level: m.level,
        title: m.title,
        criteria: m.criteria ?? '',
      })),
    };
  });

  return (
    <MatrixClient
      builds={builds.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
      skills={data}
      matrixNumber={matrix.number}
      groups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        taxonomyCode: g.taxonomy.code,
        taxonomyName: g.taxonomy.name,
      }))}
      taxonomies={taxonomies.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
    />
  );
}
