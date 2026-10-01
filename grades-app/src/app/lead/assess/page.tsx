export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canGradeDesigner } from '@/lib/permissions';
import { avatarSrc } from '@/lib/avatar';
import { isGradable, isHourly, nonGradingBuildNote, type WithBuild } from '@/lib/employment';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import { currentCycle } from '@/lib/cycle';
import AssessmentForm from './AssessmentForm';

export default async function AssessPage({
  searchParams,
}: {
  searchParams: { id?: string; new?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/auth/signin');

  // Доступ только тем, кто реально может оценивать (admin/lead/stardiz).
  // Иначе любой designer мог зайти `/lead/assess?id=сосед` и создать
  // мусорный пустой draft (API не пускал бы сохранять scores, но draft
  // уже был бы в БД).
  if (user.role !== 'admin' && user.role !== 'lead' && user.role !== 'stardiz') {
    redirect('/admin/users');
  }

  const designerId = parseInt(searchParams.id ?? '', 10);
  if (isNaN(designerId)) redirect('/admin/users');

  const designer = await prisma.user.findUnique({
    where: { id: designerId },
    include: { build: true },
  });

  if (!designer) redirect('/admin/users');

  // Права и грейдируемость — те же хелперы, что у API оценок: иначе страница
  // создала бы черновик, а сохранение баллов и публикация упёрлись бы в
  // 403/400. Кто оценивает: admin — всех, лид — своих (leadId), стардиз —
  // своих подопечных (lib/permissions). Чужого — назад в команду.
  if (!canGradeDesigner(user, designer)) redirect('/admin/users');
  // Почасовщика, неактивного и билд без грейдов не грейдируют: черновик не
  // создаём и старый не открываем — баллы в нём всё равно не сохранить.
  // Объясняем, почему.
  if (!isGradable(designer)) {
    return <NotGradable fullName={designer.fullName} reason={notGradableReason(designer)} />;
  }
  if (!designer.build) redirect('/admin/users');

  const buildCode = designer.build.code as BuildCode;

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) redirect('/admin/users');

  // Логика выбора оценки:
  // 1. Если есть незавершённый draft — открываем его (продолжаем).
  // 2. Если ?new=1 — принудительно создаём новый draft (для «новой оценки» поверх опубликованной).
  // 3. Иначе — новый draft, если совсем ничего не было.
  const forceNew = searchParams.new === '1';

  let assessment = forceNew
    ? null
    : await prisma.assessment.findFirst({
        where: { designerId, status: 'draft' },
        orderBy: { createdAt: 'desc' },
        include: { scores: true },
      });

  if (!assessment) {
    // Если есть последняя опубликованная — копируем scores как стартовую точку.
    const lastPublished = await prisma.assessment.findFirst({
      where: { designerId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
      include: { scores: true },
    });

    assessment = await prisma.assessment.create({
      data: {
        designerId,
        leadId: user.id,
        matrixVersionId: matrix.id,
        cycle: currentCycle(),
        status: 'draft',
        scores: lastPublished
          ? {
              create: lastPublished.scores.map((s) => ({
                skillId: s.skillId,
                masteryLevel: s.masteryLevel,
              })),
            }
          : undefined,
      },
      include: { scores: true },
    });
  }

  // Skills + grade levels + самооценка (Phase 14) параллельно
  const [skills, gradeLevels, selfAssessments, evidences] = await Promise.all([
    prisma.skill.findMany({
      where: { matrixVersionId: matrix.id, active: true },
      include: {
        weights: { where: { buildId: designer.buildId! } },
        group: { include: { taxonomy: true } },
        masteries: { orderBy: { level: 'asc' } },
      },
      orderBy: [
        { group: { taxonomy: { sortOrder: 'asc' } } },
        { group: { sortOrder: 'asc' } },
        { name: 'asc' },
      ],
    }),
    prisma.gradeLevel.findMany({
      where: { matrixVersionId: matrix.id },
      include: { gates: { where: { buildId: designer.buildId! } } },
      orderBy: { sortOrder: 'asc' },
    }),
    // Phase 14: самооценка дизайнера — референс лиду рядом с навыком
    prisma.selfAssessment.findMany({
      where: { designerId: designer.id },
      select: { skillId: true, level: true, comment: true, updatedAt: true },
    }),
    prisma.skillEvidence.findMany({
      where: { designerId: designer.id },
      select: {
        id: true,
        skillId: true,
        url: true,
        title: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Serialize for client
  const skillsData = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    type: s.type,
    maxMasteryLevel: s.maxMasteryLevel,
    replaceableNote: s.replaceableNote,
    weight: s.weights[0]?.weight ?? 0,
    taxonomyCode: s.group.taxonomy.code,
    taxonomyName: s.group.taxonomy.name,
    groupName: s.group.name,
    levels: s.masteries.map((ml) => ({
      level: ml.level,
      title: ml.title,
      criteria: ml.criteria ?? '',
    })),
  }));

  const gradesData = gradeLevels.map((g) => ({
    code: g.code as GradeCode,
    name: GRADE_NAMES[g.code as GradeCode] ?? g.code,
    threshold: (g.xpThresholds as Record<string, number>)?.[buildCode] ?? 0,
    gates: g.gates.map((gate) => ({
      skillId: gate.skillId,
      requiredMastery: gate.requiredMastery,
    })),
  }));

  const existingScores: Record<number, number> = {};
  const existingFlags: Record<number, boolean> = {};
  for (const sc of assessment.scores) {
    existingScores[sc.skillId] = sc.masteryLevel;
    if (sc.flagged) existingFlags[sc.skillId] = true;
  }

  // Phase 14: маппинг самооценки/подтверждений по skillId для формы
  const selfBySkill: Record<
    number,
    { level: number; comment: string | null; updatedAt: string }
  > = {};
  for (const sa of selfAssessments) {
    selfBySkill[sa.skillId] = {
      level: sa.level,
      comment: sa.comment,
      updatedAt: sa.updatedAt.toISOString(),
    };
  }
  const evidencesBySkill: Record<
    number,
    Array<{
      id: number;
      url: string;
      title: string;
      description: string | null;
      createdAt: string;
    }>
  > = {};
  for (const ev of evidences) {
    (evidencesBySkill[ev.skillId] ??= []).push({
      id: ev.id,
      url: ev.url,
      title: ev.title,
      description: ev.description,
      createdAt: ev.createdAt.toISOString(),
    });
  }

  // Max possible XP
  const maxXp = skillsData.reduce(
    (sum, s) => sum + s.weight * s.maxMasteryLevel,
    0,
  );

  return (
    <AssessmentForm
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      designer={{
        id: designer.id,
        fullName: designer.fullName,
        // Ссылка на /api/avatar, а не data URL: он раздувал HTML страницы
        avatarUrl: avatarSrc(designer, 256),
        buildCode,
        buildName: designer.build.name,
        department: designer.department,
        gradeFloor: designer.gradeFloor as GradeCode | null,
        hiredAt: designer.hiredAt?.toISOString() ?? null,
      }}
      cycle={assessment.cycle}
      skills={skillsData}
      grades={gradesData}
      existingScores={existingScores}
      existingFlags={existingFlags}
      initialLeadComment={assessment.leadComment ?? ''}
      maxXp={maxXp}
      selfBySkill={selfBySkill}
      evidencesBySkill={evidencesBySkill}
    />
  );
}

/** Почему человека не грейдируют — для экрана вместо формы. */
function notGradableReason(
  u: { role: string; active: boolean; employmentType: string | null } & WithBuild,
): string {
  if (!u.active) return 'Учётка неактивна, а неактивных не грейдируют.';
  if (isHourly(u)) return 'Это почасовщик — у почасовщиков нет оценок и дат грейдирования.';
  const buildNote = nonGradingBuildNote(u);
  if (buildNote) return `${buildNote}. Оценок и дат грейдирования у этого билда нет.`;
  return 'Грейдируют только дизайнеров и стардизов.';
}

function NotGradable({ fullName, reason }: { fullName: string; reason: string }) {
  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-8 pb-16">
      <div className="text-xs text-stone mb-3">
        <Link href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </Link>
        <span className="text-ash mx-1.5">/</span>
        <span>{fullName}</span>
      </div>
      <div className="mb-8">
        <h1 className="font-display text-4xl font-medium tracking-tight mb-2">{fullName}</h1>
      </div>
      <div className="card p-10 text-center">
        <div className="font-display text-2xl font-medium tracking-tight mb-2">
          Оценку не заполнить
        </div>
        <p className="text-stone mb-6">{reason}</p>
        {/* В команду, а не на портрет: портрет без оценок сам ведёт сюда */}
        <Link href="/admin/users" className="btn-secondary">
          К команде
        </Link>
      </div>
    </main>
  );
}
