'use client';

import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { isPlainClick } from '@/lib/linkClick';

/**
 * Человек в списке — строка «Команды», карточка канбана, строка «Оценок».
 * Обычный клик и Enter делают то же, что раньше (поп-ап 360, переход), а для
 * браузера это настоящая ссылка на портрет: Cmd/Ctrl/Shift-клик, колесо и
 * «Открыть в новой вкладке» открывают его отдельно (Pavel, 12.10.2026).
 *
 *  • href — куда ведёт ссылка (lib/portraitHref). null — зрителю портрет не
 *    открыть: рисуем обычный div, всё как раньше, мёртвых ссылок не даём;
 *  • onOpen — что делает обычный клик. Не задан — клик всплывает к строке
 *    с её собственным onClick, ссылка лишь не уводит со страницы;
 *  • клик с модификатором дальше не всплывает: строка не откроет поп-ап
 *    поверх новой вкладки.
 *
 * Внутри не должно быть кнопок и ссылок — вложенные интерактивные элементы
 * в <a> запрещены. Вид не меняется: подчёркивания и цвета ссылки нет
 * (preflight), курсор и ховер — классы вызывающего, фокус — общий
 * :focus-visible из globals.css.
 */
export default function PersonLink({
  href,
  onOpen,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'onClick'> & {
  href: string | null;
  onOpen?: () => void;
  draggable?: boolean;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <div {...rest} onClick={onOpen}>
        {children}
      </div>
    );
  }
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(e)) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    onOpen?.();
  }
  return (
    <a {...rest} href={href} onClick={onClick}>
      {children}
    </a>
  );
}
