/**
 * Баннер портрета в стиле «карточка-афиша» — выезжает на самом верху
 * страницы /designer и /lead/portrait. Цвет фона зависит от грейда
 * (для дизайнеров) или роли (для лидов/стардизов).
 *
 * MVP (v0.19): фон + имя + фамилия + теги. Без стикеров, без upload
 * центральной картинки, без декоративных полос. Все эти штуки —
 * следующая итерация (заложены в PRD §11.16).
 *
 * Палитра — выдал Pavel:
 *   junior            → #E1E2E0
 *   junior_plus / pre → #BBBBC0
 *   middle            → #929298
 *   middle_plus       → #6D6D75
 *   senior / stardiz  → #292A2C
 *   lead              → #1A1B1D (планируется + зелёные полосы)
 */

import type { GradeCode, UserRole, BuildCode } from '@/lib/types';
import { GRADE_NAMES, BUILD_NAMES } from '@/lib/types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Админ',
  lead: 'Дизайн-лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

function bannerPalette(
  role: UserRole,
  grade: GradeCode | null,
): { bg: string; text: string; sub: string } {
  // Лид и стардиз — всегда тёмная палитра
  if (role === 'lead') return { bg: '#1A1B1D', text: '#fff', sub: '#fff8' };
  if (role === 'stardiz') return { bg: '#292A2C', text: '#fff', sub: '#fff8' };

  // Дизайнер: цвет по эффективному грейду
  if (role === 'designer') {
    switch (grade) {
      case 'senior':
        return { bg: '#292A2C', text: '#fff', sub: '#fff8' };
      case 'middle_plus':
        return { bg: '#6D6D75', text: '#fff', sub: '#fff9' };
      case 'middle':
        return { bg: '#929298', text: '#fff', sub: '#ffffffc8' };
      case 'premiddle':
      case 'junior_plus':
        return { bg: '#BBBBC0', text: '#1a1a1a', sub: '#1a1a1a99' };
      case 'junior':
      default:
        return { bg: '#E1E2E0', text: '#1a1a1a', sub: '#1a1a1a99' };
    }
  }

  // Admin / fallback
  return { bg: '#E1E2E0', text: '#1a1a1a', sub: '#1a1a1a99' };
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  // «Имя Фамилия» — первый = имя, остальное = фамилия
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export default function PortraitBanner({
  fullName,
  role,
  grade,
  buildCode,
  extraTags,
}: {
  fullName: string;
  role: UserRole;
  /** Эффективный грейд для дизайнера. Для лидов/стардизов игнорируется. */
  grade?: GradeCode | null;
  /** Билд = команда («Инхаус» / «Криэйт» / «Импрув»). Опционально. */
  buildCode?: BuildCode | null;
  /** Дополнительные теги через UPPERCASE — например название команды
   *  из Иды.Тимс. Pavel наполняет вручную, MVP пока пустой. */
  extraTags?: string[];
}) {
  const { bg, text, sub } = bannerPalette(role, grade ?? null);
  const { first, last } = splitName(fullName);

  const tags: string[] = [];
  if (role === 'designer' && grade) tags.push(GRADE_NAMES[grade] ?? grade);
  tags.push(ROLE_LABELS[role] ?? role);
  if (buildCode) tags.push(BUILD_NAMES[buildCode] ?? buildCode);
  if (extraTags && extraTags.length > 0) tags.push(...extraTags);

  return (
    <section
      className="relative overflow-hidden rounded-card mb-6"
      style={{ background: bg, color: text }}
      aria-label={`Карточка ${fullName}`}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-8 py-10 min-h-[200px]">
        {/* Имя — слева */}
        <div className="font-display font-medium tracking-tight leading-none text-3xl lg:text-5xl">
          @{first.toUpperCase()}
        </div>

        {/* Центр — пока пустой placeholder для будущей картинки. */}
        <div aria-hidden className="w-[280px] h-[140px] hidden md:block" />

        {/* Фамилия — справа */}
        <div className="font-display font-medium tracking-tight leading-none text-3xl lg:text-5xl text-right">
          {last.toUpperCase()}
        </div>
      </div>

      {/* Теги — внизу */}
      {tags.length > 0 && (
        <div className="px-8 pb-5 flex items-center gap-2 flex-wrap">
          {tags.map((t, i) => (
            <span
              key={i}
              className="text-[11px] font-medium uppercase tracking-wider px-3 py-1 rounded-pill"
              style={{
                color: text,
                background:
                  text === '#fff'
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(0,0,0,0.06)',
              }}
            >
              {t}
            </span>
          ))}
          <span
            className="ml-auto text-[10px] tracking-widest"
            style={{ color: sub }}
          >
            IDAPROJECT©
          </span>
        </div>
      )}
    </section>
  );
}
