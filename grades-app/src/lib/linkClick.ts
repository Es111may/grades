// Обычный клик по ссылке — левая кнопка без модификаторов (и Enter на ней:
// браузер шлёт тот же click). Его страница может перехватить и сделать своё
// (открыть поп-ап); Cmd/Ctrl/Shift/Alt-клик — за браузером: новая вкладка,
// окно, загрузка. Средняя кнопка click не шлёт вовсе (только auxclick), но и
// её на всякий случай пропускаем. Правило то же, что у next/link.

export type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function isPlainClick(e: ClickLike): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
