// Проверка баллов оценки перед сохранением (POST /api/assessments).
//
// Раньше сервер писал любые skillId и любые уровни: навык из чужой матрицы
// или уровень 7 при максимуме 5 молча попадали в оценку и портили XP.
// Навык считаем известным, если он из матрицы этой оценки — в том числе
// архивный: иначе архивация навыка при открытой форме навсегда заклинила бы
// автосейв (форма повторяет неудачную пачку целиком).

export type ScoreInput = {
  skillId: number;
  masteryLevel?: number;
  flagged?: boolean;
};

type SkillLimit = { id: number; maxMasteryLevel: number };

/** Текст ошибки для первого некорректного балла или null, если всё в порядке. */
export function validateScores(scores: ScoreInput[], skills: SkillLimit[]): string | null {
  const maxById = new Map(skills.map((s) => [s.id, s.maxMasteryLevel]));
  for (const s of scores) {
    const max = maxById.get(s.skillId);
    if (max === undefined) return `Навык #${s.skillId} не из матрицы этой оценки`;
    if (s.masteryLevel === undefined) continue;
    if (!Number.isInteger(s.masteryLevel) || s.masteryLevel < 0 || s.masteryLevel > max) {
      return `Уровень навыка #${s.skillId} должен быть целым от 0 до ${max}`;
    }
  }
  return null;
}
