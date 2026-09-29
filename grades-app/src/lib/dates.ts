/**
 * Единый формат дат сервиса (Pavel, 12.07.2026):
 * «число месяц-сокращённо год» без «г.» — например «18 сент. 2024».
 */
export function formatDateShort(
  iso: string | Date | null | undefined,
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '—';
  return d
    .toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .replace(/\s*г\.$/, '');
}

/**
 * Сегодня в формате input[type=date] (YYYY-MM-DD) — по местному времени.
 * Не toISOString(): тот даёт дату в UTC, и в Москве с 00:00 до 03:00
 * по умолчанию подставлялось бы вчера.
 */
export function todayLocalIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}
