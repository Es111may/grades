/**
 * Набор иконок проекта. Все SVG используют currentColor — цвет
 * наследуется от родителя (text-ink, text-blaze и т.д.).
 * Размер контролируется классами Tailwind w-4 h-4 / w-5 h-5.
 */

type IconProps = {
  className?: string;
};

export function EditIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.8995 6.85453L17.1421 11.0972L7.24264 20.9967H3V16.754L12.8995 6.85453ZM14.3137 5.44032L16.435 3.319C16.8256 2.92848 17.4587 2.92848 17.8492 3.319L20.6777 6.14743C21.0682 6.53795 21.0682 7.17112 20.6777 7.56164L18.5563 9.68296L14.3137 5.44032Z" />
    </svg>
  );
}

export function PlusIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z" />
    </svg>
  );
}

export function ChevronDownIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z" />
    </svg>
  );
}

export function SunIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM11 1H13V4H11V1ZM11 20H13V23H11V20ZM3.51472 4.92893L4.92893 3.51472L7.05025 5.63604L5.63604 7.05025L3.51472 4.92893ZM16.9497 18.364L18.364 16.9497L20.4853 19.0711L19.0711 20.4853L16.9497 18.364ZM19.0711 3.51472L20.4853 4.92893L18.364 7.05025L16.9497 5.63604L19.0711 3.51472ZM5.63604 16.9497L7.05025 18.364L4.92893 20.4853L3.51472 19.0711L5.63604 16.9497ZM23 11V13H20V11H23ZM4 11V13H1V11H4Z" />
    </svg>
  );
}

export function MoonIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.3807 2.01886C9.91573 3.38768 9 5.3369 9 7.49999C9 11.6421 12.3579 15 16.5 15C18.6631 15 20.6123 14.0843 21.9811 12.6193C21.6613 17.8537 17.3149 22 12 22C6.47715 22 2 17.5228 2 12C2 6.68514 6.14629 2.33869 11.3807 2.01886Z" />
    </svg>
  );
}

export function CalendarIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 1V3H15V1H17V3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H7V1H9ZM20 11H4V19H20V11ZM7 5H4V9H20V5H17V7H15V5H9V7H7V5Z" />
    </svg>
  );
}

export function CheckIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10.0007 15.1709L19.1931 5.97852L20.6079 7.39273L10.0007 18L3.63672 11.636L5.05093 10.2218L10.0007 15.1709Z" />
    </svg>
  );
}

export function FlagIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 3H21L17 9L21 15H5V22H3V3ZM5 5V13H17.3955L14.9955 9L17.3955 5H5Z" />
    </svg>
  );
}

export function CloseIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z" />
    </svg>
  );
}

export function InfoIcon({ className = 'w-4 h-4' }: IconProps) {
  // Кружок с «i» — для информеров рядом с заголовками графиков и метрик.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 11v5M12 8.5v.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
