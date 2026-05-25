export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { writeAudit, AUDIT_ACTIONS } from '@/lib/audit';

const CATEGORIES = ['developer', 'project', 'ida_product', 'other'] as const;

/**
 * GET /api/projects?q=&category=
 * Список всех проектов справочника. Опциональные фильтры:
 *   - q: substring-search по name (case-insensitive)
 *   - category: один из developer | project | ida_product | other
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const category = req.nextUrl.searchParams.get('category') ?? '';

  const projects = await prisma.project.findMany({
    where: {
      ...(q && { name: { contains: q, mode: 'insensitive' } }),
      ...(CATEGORIES.includes(category as (typeof CATEGORIES)[number]) && {
        category,
      }),
    },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true },
  });

  return NextResponse.json({ projects });
}

const createSchema = z.object({
  name: z.string().min(1).max(120).transform((s) => s.trim()),
  category: z.enum(CATEGORIES),
});

/**
 * POST /api/projects
 * Создать новый проект. Доступно любому залогиненному (admin / lead /
 * stardiz / designer) — они сами заполняют справочник по мере того, как
 * проекты появляются в работе. Уникальность по name (case-insensitive
 * лучше делать на стороне БД, но здесь Prisma @unique на name достаточно
 * — две карточки с одинаковым именем не имеют смысла).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || !me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Если уже есть точно такой же name — возвращаем существующий
  // (идемпотентность: пользователь жмёт «Создать» — если параллельно кто-то
  // уже создал, не падаем дублем, а отдаём что есть).
  const existing = await prisma.project.findUnique({
    where: { name: parsed.data.name },
    select: { id: true, name: true, category: true },
  });
  if (existing) {
    return NextResponse.json({ project: existing, created: false });
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      createdById: me.id,
      sortOrder: 1000, // новые проекты вниз каждой категории
    },
    select: { id: true, name: true, category: true },
  });

  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.PROJECT_CREATED,
    targetType: 'project',
    targetId: project.id,
    extra: { name: project.name, category: project.category },
  });

  return NextResponse.json({ project, created: true });
}
