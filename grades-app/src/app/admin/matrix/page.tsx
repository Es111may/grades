export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ensureTaxonomyNames, ensureGroupNames } from '@/lib/oneTimeMigrations';
import { getCurrentUser } from '@/lib/session';
import { canEditMatrix } from '@/lib/permissions';
import MatrixClient from './MatrixClient';

export default async function AdminMatrixPage() {
  const me = await getCurrentUser();
  if (!canEditMatrix(me?.role)) redirect('/admin/users');

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

  const [builds, groups, taxonomies, skills] = await Promise.all([
    prisma.build.findMany({ orderBy: { id: 'asc' } }),
    prisma.skillGroup.findMany({
      include: { taxonomy: true },
      orderBy: [
        { taxonomy: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    }),
    prisma.skillTaxonomy.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.skill.findMany({
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
    }),
  ]);

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
