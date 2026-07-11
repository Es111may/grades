/**
 * Права на самооценку и подтверждения (Phase 14).
 *
 * Правила (план: design-concepts/phase-14-self-assessment.md):
 *
 *   СМОТРЕТЬ (самооценки + ссылки-подтверждения):
 *     сам владелец, его лид, его стардиз, admin.
 *     Ровно те же люди, что видят портрет дизайнера.
 *
 *   РЕДАКТИРОВАТЬ (ставить/менять/снимать уровень, добавлять/удалять ссылки):
 *     ТОЛЬКО сам владелец, роль designer, активный.
 *     Лид не правит самооценку подопечного — иначе теряется смысл
 *     «вторых глаз» при грейдировании.
 *
 * Модуль чистый — без БД-зависимостей, caller передаёт поля сам.
 */

export type Viewer = { id: number; role: string };
export type Owner = {
  id: number;
  role: string;
  active: boolean;
  leadId: number | null;
  stardizId: number | null;
};

export function canViewSelfAssessment(viewer: Viewer, owner: Owner): boolean {
  if (viewer.id === owner.id) return true;
  if (viewer.role === 'admin') return true;
  if (owner.leadId !== null && owner.leadId === viewer.id) return true;
  if (owner.stardizId !== null && owner.stardizId === viewer.id) return true;
  return false;
}

export function canEditSelfAssessment(viewer: Viewer, owner: Owner): boolean {
  return viewer.id === owner.id && owner.role === 'designer' && owner.active;
}
