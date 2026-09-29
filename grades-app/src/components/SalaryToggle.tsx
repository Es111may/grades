'use client';

import { toggleSalaryVisibility } from '@/lib/salaryVisibility';
import { EyeIcon, EyeOffIcon } from './icons';
import Tooltip from './Tooltip';

/**
 * Кнопка в шапке: спрятать или показать всё про деньги — блоки зарплаты,
 * колонку в таблице, бейджи пересмотра. Только админу и лиду. Обе иконки в
 * DOM, видимую выбирает CSS — как у тумблера темы.
 */
export default function SalaryToggle() {
  return (
    <Tooltip text={<><span className="salary-shown-only">Скрыть зарплаты</span><span className="salary-hidden-only">Показать зарплаты</span></>} align="center">
      <button
        type="button"
        onClick={toggleSalaryVisibility}
        className="w-8 h-8 flex items-center justify-center rounded-pill
                   text-stone hover:text-ink hover:bg-cloud/50 transition-colors"
        aria-label="Скрыть или показать зарплаты"
      >
        <EyeIcon className="w-4 h-4 salary-shown-only" />
        <EyeOffIcon className="w-4 h-4 salary-hidden-only" />
      </button>
    </Tooltip>
  );
}
