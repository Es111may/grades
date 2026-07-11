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
