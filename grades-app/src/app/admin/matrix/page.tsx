export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import MatrixClient from './MatrixClient';

const TAXONOMY_NAMES: Record<string, string> = {
  UI: 'Визуал',
  UX: 'Система',
  PRD: 'Продукт',
  IND: 'Самостоятельность',
  RES: 'Ответственность',
};

async function ensureTaxonomyNames() {
  for (const [code, name] of Object.entries(TAXONOMY_NAMES)) {
    const t = await prisma.skillTaxonomy.findUnique({ where: { code } });
    if (t && t.name !== name) {
      await prisma.skillTaxonomy.update({ where: { code }, data: { name } });
    }
  }
}

export default async function AdminMatrixPage() {
  await ensureTaxonomyNames();

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
