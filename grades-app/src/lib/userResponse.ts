// Строка User в ответе API — под того, кто спрашивает.
//
// Роуты /api/users отдают запись целиком (все колонки таблицы), поэтому
// чувствительное вырезаем явно, а не надеемся на select:
//   • хэш пароля — никому, клиенту он не нужен;
//   • дата увольнения — только админу и лиду, тип и причина — только админу
//     (lib/dismissal);
//   • плановый пересмотр з/п — тем, кому можно видеть деньги этого человека
//     (lib/compPermissions). Премии — отдельная таблица, в строку не входят;
//   • аватар — ссылкой /api/avatar вместо data URL (lib/avatar): ответ
//     сливается в строку списка, и base64 не должен туда вернуться.
//
// Только для сервера: lib/avatar тянет node:crypto.

import { canViewCompensation } from './compPermissions';
import { canViewDismissalDate, canViewDismissalStatus } from './dismissal';
import { avatarSrc } from './avatar';

type Viewer = { id: number; role: string } | null;

const PLANNED_RAISE_KEYS = [
  'plannedRaiseSetAt',
  'plannedRaiseAt',
  'plannedRaiseSalary',
  'plannedRaiseNote',
  'plannedRaiseSetById',
  'plannedRaiseBaselineAt',
] as const;

export function userForViewer<T extends { id: number; leadId: number | null }>(
  user: T,
  me: Viewer,
): Partial<T> {
  const out = { ...user } as Record<string, unknown>;
  delete out.passwordHash;
  if (!canViewDismissalDate(me)) delete out.dismissedAt;
  if (!canViewDismissalStatus(me)) {
    delete out.dismissalType;
    delete out.dismissalReason;
  }
  if (!canViewCompensation(me, user)) {
    for (const k of PLANNED_RAISE_KEYS) delete out[k];
  }
  if (typeof out.avatarUrl === 'string') {
    out.avatarUrl = avatarSrc({ id: user.id, avatarUrl: out.avatarUrl });
  }
  return out as Partial<T>;
}
