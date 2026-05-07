export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import GradesClient from './GradesClient';

export default async function AdminGradesPage() {
  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) {
    return (
      <main className="max-w-[800px] mx-auto px-8 pt-12">
        <p className="text-stone">Активная матрица не найдена.</p>
      </main>
    );
  }

  const builds = await prisma.build.findMany({ orderBy: { sortOrder: 'asc' } });

  const grades = await prisma.gradeLevel.findMany({
    where: { matrixVersionId: matrix.id },
    include: {
      gates: {
        include: { skill: true, build: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  // Skill list — for building gate-skill name lookup
  const skills = await prisma.skill.findMany({
    where: { matrixVersionId: matrix.id, active: true },
    select: {
      id: true,
      name: true,
      group: { select: { taxonomy: { select: { code: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <GradesClient
      matrixNumber={matrix.number}
      builds={builds.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
      grades={grades.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        sortOrder: g.sortOrder,
        xpThresholds: (g.xpThresholds as Record<string, number>) ?? {},
        gates: g.gates.map((gate) => ({
          id: gate.id,
          buildId: gate.buildId,
          buildCode: gate.build.code,
          skillId: gate.skillId,
          skillName: gate.skill.name,
          requiredMastery: gate.requiredMastery,
        })),
      }))}
      skills={skills.map((s) => ({
        id: s.id,
        name: s.name,
        taxonomyCode: s.group.taxonomy.code,
      }))}
    />
  );
}
