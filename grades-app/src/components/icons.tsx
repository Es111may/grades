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

export function PencilIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.728 9.686L14.314 8.272L5 17.586V19H6.414L15.728 9.686ZM17.142 8.272L18.556 6.858L17.142 5.444L15.728 6.858L17.142 8.272ZM7.242 21H3V16.757L16.435 3.322C16.826 2.932 17.459 2.932 17.85 3.322L20.678 6.151C21.068 6.541 21.068 7.175 20.678 7.565L7.243 21H7.242Z" />
    </svg>
  );
}

export function TrashIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 6H22V8H20V21C20 21.552 19.552 22 19 22H5C4.448 22 4 21.552 4 21V8H2V6H7V3C7 2.448 7.448 2 8 2H16C16.552 2 17 2.448 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z" />
    </svg>
  );
}

export function MenuIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 4H21V6H3V4ZM3 11H21V13H3V11ZM3 18H21V20H3V18Z" />
    </svg>
  );
}

export function SearchIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.031 16.6168L22.3137 20.8995L20.8995 22.3137L16.6168 18.031C15.0769 19.263 13.124 20 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20 13.124 19.263 15.0769 18.031 16.6168ZM16.0247 15.8748C17.2475 14.6146 18 12.8956 18 11C18 7.1325 14.8675 4 11 4C7.1325 4 4 7.1325 4 11C4 14.8675 7.1325 18 11 18C12.8956 18 14.6146 17.2475 15.8748 16.0247L16.0247 15.8748Z" />
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

export function TimerIcon({ className = 'w-4 h-4' }: IconProps) {
  // Таймер — «идёт отсчёт до события». Используется как признак
  // запланированного грейдирования в списке команды.
  // Stroke-стиль (как InfoIcon): на 14px читается лучше залитого.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13.5" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 10v3.5l2.5 1.5M9.5 2.5h5M12 2.5V6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoinsIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix Icon coins-fill (Apache-2.0)
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14.0049 2.00281C18.4232 2.00281 22.0049 5.58453 22.0049 10.0028C22.0049 13.2474 20.0733 16.0409 17.2973 17.296C16.0422 20.0718 13.249 22.0028 10.0049 22.0028C5.5866 22.0028 2.00488 18.4211 2.00488 14.0028C2.00488 10.7587 3.9359 7.96554 6.71122 6.71012C7.96681 3.93438 10.7603 2.00281 14.0049 2.00281ZM11.0049 9.00281H9.00488V10.0028C7.62417 10.0028 6.50488 11.1221 6.50488 12.5028C6.50488 13.8283 7.53642 14.9128 8.84051 14.9975L9.00488 15.0028H11.0049L11.0948 15.0109C11.328 15.0532 11.5049 15.2573 11.5049 15.5028C11.5049 15.7483 11.328 15.9524 11.0948 15.9948L11.0049 16.0028H7.00488V18.0028H9.00488V19.0028H11.0049V18.0028C12.3856 18.0028 13.5049 16.8835 13.5049 15.5028C13.5049 14.1773 12.4733 13.0928 11.1693 13.0081L11.0049 13.0028H9.00488L8.91501 12.9948C8.68176 12.9524 8.50488 12.7483 8.50488 12.5028C8.50488 12.2573 8.68176 12.0532 8.91501 12.0109L9.00488 12.0028H13.0049V10.0028H11.0049V9.00281ZM14.0049 4.00281C12.2214 4.00281 10.6196 4.78097 9.52064 6.01629C9.68133 6.00764 9.84254 6.00281 10.0049 6.00281C14.4232 6.00281 18.0049 9.58453 18.0049 14.0028C18.0049 14.1655 18 14.327 17.9905 14.4873C19.2265 13.3885 20.0049 11.7866 20.0049 10.0028C20.0049 6.6891 17.3186 4.00281 14.0049 4.00281Z" />
    </svg>
  );
}

export function StarIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix Icon star-fill (Apache-2.0)
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.0006 18.26L4.94715 22.2082L6.52248 14.2799L0.587891 8.7918L8.61493 7.84006L12.0006 0.5L15.3862 7.84006L23.4132 8.7918L17.4787 14.2799L19.054 22.2082L12.0006 18.26Z" />
    </svg>
  );
}

export function EyeIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3C17.392 3 21.878 6.88 22.819 12C21.879 17.12 17.392 21 12 21C6.60803 21 2.12215 17.12 1.18164 12C2.12119 6.88 6.60803 3 12 3ZM12 19C16.2359 19 19.8603 16.052 20.7777 12C19.8603 7.948 16.2359 5 12 5C7.76412 5 4.13965 7.948 3.22227 12C4.13965 16.052 7.76412 19 12 19ZM12 16.5C9.51472 16.5 7.5 14.4853 7.5 12C7.5 9.51472 9.51472 7.5 12 7.5C14.4853 7.5 16.5 9.51472 16.5 12C16.5 14.4853 14.4853 16.5 12 16.5ZM12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5Z" />
    </svg>
  );
}

export function EyeOffIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 8.6 3.4 9.8 7-.5 1.4-1.3 2.7-2.4 3.8M6.5 6.6C4.4 7.9 2.9 9.8 2.2 12c1.2 3.6 4.8 7 9.8 7 1.6 0 3-.3 4.3-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowUpIcon({ className = 'w-4 h-4' }: IconProps) {
  // Бейдж «планируется пересмотр» на аватарке
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
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

export function GearIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix settings-3-line — настройки «Экономики»
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.34 17a10.02 10.02 0 0 1-.979-2.326 3 3 0 0 0 .003-5.347 9.99 9.99 0 0 1 2.5-4.337 3 3 0 0 0 4.632-2.674 9.99 9.99 0 0 1 5.007.002 3 3 0 0 0 4.632 2.672c.579.59 1.093 1.261 1.525 2.01.433.749.757 1.53.978 2.326a3 3 0 0 0-.002 5.347 9.99 9.99 0 0 1-2.501 4.337 3 3 0 0 0-4.632 2.674 9.99 9.99 0 0 1-5.007-.002 3 3 0 0 0-4.631-2.672A10.02 10.02 0 0 1 3.34 17Zm5.66.196a4.993 4.993 0 0 1 2.25 2.77c.499.047 1 .048 1.499.001A4.993 4.993 0 0 1 15 17.197a4.993 4.993 0 0 1 3.525-.565c.29-.408.54-.843.748-1.298A4.993 4.993 0 0 1 18 12c0-1.26.47-2.437 1.273-3.334a8.126 8.126 0 0 0-.75-1.298A4.993 4.993 0 0 1 15 6.804a4.993 4.993 0 0 1-2.25-2.77c-.499-.047-1-.048-1.499-.001A4.993 4.993 0 0 1 9 6.804a4.993 4.993 0 0 1-3.525.565 7.99 7.99 0 0 0-.748 1.298A4.993 4.993 0 0 1 6 12a4.99 4.99 0 0 1-1.273 3.334 8.126 8.126 0 0 0 .75 1.298A4.993 4.993 0 0 1 9 17.196ZM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    </svg>
  );
}

export function ChatIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix chat-3-line — кнопка комментариев к интерфейсу
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.29117 20.8242L2 22L3.17581 16.7088C2.42544 15.3056 2 13.7025 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.2975 22 8.6944 21.5746 7.29117 20.8242ZM7.58075 18.711L8.23428 19.0605C9.38248 19.6745 10.6655 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 13.3345 4.32549 14.6175 4.93949 15.7657L5.28896 16.4192L4.63416 19.3658L7.58075 18.711Z" />
    </svg>
  );
}

export function ChatFillIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix chat-3-fill — та же кнопка в активном состоянии (поповер открыт)
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.29117 20.8242L2 22L3.17581 16.7088C2.42544 15.3056 2 13.7025 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.2975 22 8.6944 21.5746 7.29117 20.8242Z" />
    </svg>
  );
}

export function LinkIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix link
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.3638 15.5355L16.9496 14.1213L18.3638 12.7071C20.3164 10.7545 20.3164 7.58866 18.3638 5.63604C16.4112 3.68341 13.2453 3.68341 11.2927 5.63604L9.87849 7.05025L8.46428 5.63604L9.87849 4.22182C12.6122 1.48815 17.0443 1.48815 19.778 4.22182C22.5117 6.95549 22.5117 11.3876 19.778 14.1213L18.3638 15.5355ZM15.5353 18.364L14.1211 19.7782C11.3875 22.5118 6.95531 22.5118 4.22164 19.7782C1.48797 17.0445 1.48797 12.6123 4.22164 9.87868L5.63585 8.46446L7.05007 9.87868L5.63585 11.2929C3.68323 13.2455 3.68323 16.4113 5.63585 18.364C7.58847 20.3166 10.7543 20.3166 12.7069 18.364L14.1211 16.9497L15.5353 18.364ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z" />
    </svg>
  );
}

export function CheckCircleIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix checkbox-circle-line — «Решено»
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM17.4571 9.45711L16.0429 8.04289L11 13.0858L8.20711 10.2929L6.79289 11.7071L11 15.9142L17.4571 9.45711Z" />
    </svg>
  );
}

export function ReopenIcon({ className = 'w-4 h-4' }: IconProps) {
  // Remix arrow-go-back-line — «Открыть снова»
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.82843 6.99955L8.36396 9.53509L6.94975 10.9493L2 5.99955L6.94975 1.0498L8.36396 2.46402L5.82843 4.99955H13C17.4183 4.99955 21 8.58127 21 12.9996C21 17.4178 17.4183 20.9996 13 20.9996H4V18.9996H13C16.3137 18.9996 19 16.3133 19 12.9996C19 9.68584 16.3137 6.99955 13 6.99955H5.82843Z" />
    </svg>
  );
}
