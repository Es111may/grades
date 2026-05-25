/**
 * GET /api/audit
 *
 * Возвращает события аудит-лога с применёнными фильтрами. Используется
 * страницей /admin/audit для:
 *   - перезагрузки выдачи при смене фильтров
 *   - пагинации «Загрузить ещё» (через beforeId)
 *
 * Query-параметры:
 *   - actorId      number   — фильтр по тому, кто инициировал
 *   - action       string   — фильтр по конкретному action ('user_password_changed' и т.п.)
 *   - targetType   string   — 'user' | 'assessment' | ...
 *   - from / to    YYYY-MM-DD — диапазон дат
 *   - beforeId     number   — id, СТРОГО МЕНЬШЕ которого вернуть события
 *                              (для «загрузить ещё», т.к. сортировка desc)
 *
 * Права:
 *   - admin — видит всё
 *   - lead  — только actorId=me ИЛИ target=user из его подопечных
 *   - остальные роли — Forbidden
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (me.role !== 'admin' && me.role !== 'lead') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const actorIdRaw = url.searchParams.get('actorId');
  const action = url.searchParams.get('action');
  const targetType = url.searchParams.get('targetType');
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const beforeIdRaw = url.searchParams.get('beforeId');

  // Scope для лида — только свой и события про подопечных.
  let scopeFilter: object = {};
  if (me.role === 'lead') {
    const reportees = await prisma.user.findMany({
      where: { OR: [{ leadId: me.id }, { stardizId: me.id }] },
      select: { id: true },
    });
    const ids = reportees.map((u) => u.id);
    scopeFilter = {
      OR: [
        { actorId: me.id },
        ...(ids.length > 0
          ? [{ targetType: 'user', targetId: { in: ids } }]
          : []),
      ],
    };
  }

  // Пользовательские фильтры.
  const userFilter: Record<string, unknown> = {};
  if (actorIdRaw) {
    const aid = parseInt(actorIdRaw, 10);
    if (Number.isFinite(aid)) userFilter.actorId = aid;
  }
  if (action) userFilter.action = action;
  if (targetType) userFilter.targetType = targetType;
  if (fromRaw || toRaw) {
    const range: Record<string, Date> = {};
    if (fromRaw) {
      const d = new Date(fromRaw + 'T00:00:00');
      if (!isNaN(d.getTime())) range.gte = d;
    }
    if (toRaw) {
      // конец дня: добавляем 23:59:59
      const d = new Date(toRaw + 'T23:59:59.999');
      if (!isNaN(d.getTime())) range.lte = d;
    }
    if (Object.keys(range).length > 0) {
      userFilter.createdAt = range;
    }
  }
  if (beforeIdRaw) {
    const bid = parseInt(beforeIdRaw, 10);
    if (Number.isFinite(bid)) userFilter.id = { lt: bid };
  }

  const where = {
    AND: [scopeFilter, userFilter].filter((x) => Object.keys(x).length > 0),
  };

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    include: {
      actor: { select: { id: true, fullName: true, role: true } },
    },
  });

  // Имена пользователей в target — одним запросом.
  const userTargetIds = entries
    .filter((e) => e.targetType === 'user' && e.targetId)
    .map((e) => e.targetId!);
  const userTargets =
    userTargetIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(new Set(userTargetIds)) } },
          select: { id: true, fullName: true },
        })
      : [];
  const userTargetMap = new Map(userTargets.map((u) => [u.id, u.fullName]));

  const serialized = entries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    targetName:
      e.targetType === 'user' && e.targetId
        ? userTargetMap.get(e.targetId) ?? null
        : null,
    details: e.details,
    actor: {
      id: e.actor.id,
      fullName: e.actor.fullName,
      role: e.actor.role,
    },
  }));

  return NextResponse.json({ entries: serialized });
}
