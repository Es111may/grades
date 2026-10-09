// Портрет без опубликованной оценки (app/designer/PortraitPending): что
// сказать вместо грейда и XP и какую кнопку дать. Считает сервер (page.tsx),
// клиент только рисует — правила в одном месте и под тестами.
//
// Pavel, 09.10.2026: перформанс видно и до первых грейдов — экран в том же
// оформлении, что портрет с оценкой, но без блоков, которым нужна оценка,
// и с кнопкой «Провести оценку».

import { isGradable, isHourly, nonGradingBuildNote, type WithBuild } from '@/lib/employment';
import { gradeName } from '@/lib/types';

export type PendingPortraitView = {
  /** Грейдируется: ждёт первую оценку, может стоять в 9-Box. */
  gradable: boolean;
  /** Первый, белый чип hero вместо грейда. floor — закреплённый грейд. */
  status: { label: string; floor: boolean };
  /**
   * Ячейка «Общий XP» без оценки: строка под «—», тихая строка-причина
   * и пустой бар (только если XP ещё будет).
   */
  xp: { text: string; note: string | null; track: boolean };
  /** Главная кнопка — в форму оценки; черновик — продолжить его. */
  action: { href: string; label: string } | null;
};

type PendingPerson = WithBuild & {
  id: number;
  role: string;
  active: boolean;
  employmentType?: string | null;
  gradeFloor: string | null;
};

export function pendingPortraitView({
  viewer,
  person,
  canAssess = false,
  hasDraft = false,
}: {
  /** self — свой портрет (/designer), manager — админ, лид или стардиз. */
  viewer: 'self' | 'manager';
  person: PendingPerson;
  /** isGradable + canGradeDesigner — считает страница. */
  canAssess?: boolean;
  hasDraft?: boolean;
}): PendingPortraitView {
  const gradable = isGradable(person);
  const status = person.gradeFloor
    ? { label: `${gradeName(person.gradeFloor)} · закреплён`, floor: true }
    : // Вне грейдирования оценки не будет вовсе — не «ещё нет», а «без грейда»
      { label: gradable ? 'Без оценки' : 'Без грейда', floor: false };

  if (!gradable) {
    // Причина — та же, что у формы оценки (билд без грейдов), иначе общая
    const reason =
      nonGradingBuildNote(person) ??
      (isHourly(person) ? 'Почасовщик — не грейдируется' : 'Сейчас не грейдируется');
    return {
      gradable,
      status,
      xp: { text: reason, note: 'Оценок и XP не будет', track: false },
      action: null,
    };
  }

  const self = viewer === 'self';
  return {
    gradable,
    status,
    xp: {
      text: self ? 'Появится, когда лид опубликует первую оценку' : 'Появится после первой оценки',
      // Зритель смотрит, но не оценивает — подсказать, кто проводит
      note: !self && !canAssess ? 'Оценку проводит лид или стардиз этого человека' : null,
      track: true,
    },
    action:
      !self && canAssess
        ? {
            href: `/lead/assess?id=${person.id}`,
            label: hasDraft ? 'Продолжить черновик' : 'Провести оценку',
          }
        : null,
  };
}
