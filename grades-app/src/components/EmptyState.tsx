/**
 * Единое пустое состояние (Phase 27): иконка в мягком круге, заголовок,
 * подсказка и опциональное действие (CTA). Вместо голых «пусто» /
 * «ничего нет» — объясняем, что случилось и что делать дальше.
 */
export default function EmptyState({
  icon,
  title,
  hint,
  action,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center py-14 px-6 ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-ink/5 flex items-center justify-center mx-auto text-stone">
          {icon}
        </div>
      )}
      <div className="font-medium mt-4">{title}</div>
      {hint && <div className="text-sm text-stone mt-1 max-w-[340px] mx-auto">{hint}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
