'use client';

/**
 * Выключатель зарплат в шапке (Phase 23.4) — для показа экрана на встрече.
 *
 * Как тема: состояние — атрибут html[data-salary='hidden'], прятанием
 * занимается CSS (.salary-sensitive в globals.css), выбор хранится в
 * localStorage('salary-hidden') и восстанавливается инлайн-скриптом в
 * layout.tsx до первой отрисовки. JS-состояния нет — гидрации нечего ломать.
 */

export function toggleSalaryVisibility() {
  const root = document.documentElement;
  const hide = root.getAttribute('data-salary') !== 'hidden';
  if (hide) root.setAttribute('data-salary', 'hidden');
  else root.removeAttribute('data-salary');
  try {
    localStorage.setItem('salary-hidden', hide ? '1' : '0');
  } catch {
    // приватный режим — работает до перезагрузки, и ладно
  }
}
