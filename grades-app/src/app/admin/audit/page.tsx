export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import AuditView from './AuditView';

/**
 * /admin/audit — таблица событий аудит-лога.
 *
 * Доступ:
 *   - admin: видит все события
 *   - lead:  видит события, где он сам actor, ИЛИ target — его подопечный
 *            (target=user, leadId/stardizId === me.id)
 *
 * Чтобы не таскать большую таблицу руками, ограничиваем выдачу 200 свежими
 * событиями + дальнейший load-more на клиенте (через query-param `before`).
 * Этого хватает для подавляющего большинства сценариев.
 */
export default async function AdminAuditPage() {
  const me = await getCurrentUser();
  if (!me?.id) redirect('/auth/signin');
  if (me.role !== 'admin' && me.role !== 'lead') {
    redirect('/admin/users');
  }

  // Для лида — список id его подопечных, нужен в `where` для фильтра.
  let leadScopeUserIds: number[] = [];
  if (me.role === 'lead') {
    const reportees = await prisma.user.findMany({
      where: { OR: [{ leadId: me.id }, { stardizId: me.id }] },
      select: { id: true },
    });
    leadScopeUserIds = reportees.map((u) => u.id);
  }

  // Грузим actor'ов отдельным запросом — JSON для UI становится плоским.
  const PAGE_SIZE = 50;

  const where =
    me.role === 'admin'
      ? {}
      : {
          OR: [
            { actorId: me.id },
            ...(leadScopeUserIds.length > 0
              ? [{ targetType: 'user', targetId: { in: leadScopeUserIds } }]
              : []),
          ],
        };

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    include: {
      actor: { select: { id: true, fullName: true, role: true } },
    },
  });

  // Имена target'ов (только для targetType='user') — лучше отдельным
  // запросом, чем разбираться с полиморфным relation'ом.
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

  // Для admin — список actors для фильтра, чтобы UI знал кого предлагать.
  const actors = await prisma.user.findMany({
    where:
      me.role === 'admin'
        ? { role: { in: ['admin', 'lead', 'stardiz'] } }
        : { id: me.id },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: 'asc' },
  });

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

  return (
    <AuditView
      initialEntries={serialized}
      actors={actors}
      pageSize={PAGE_SIZE}
    />
  );
}
