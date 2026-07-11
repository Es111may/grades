'use client';

import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import DeleteButton from './DeleteButton';

export type AssessmentRow = {
  id: number;
  designerId: number;
  designerName: string;
  designerEmail: string;
  designerAvatarUrl: string | null;
  buildCode: string | null;
  buildName: string | null;
  department: string | null;
  leadName: string | null;
  publishedAt: string | null;
  effectiveGrade: string | null;
  totalXp: number | null;
};

export type DraftRow = {
  id: number;
  designerId: number;
  designerName: string;
  designerEmail: string;
  designerAvatarUrl: string | null;
  buildCode: string | null;
  buildName: string | null;
  leadName: string | null;
  leadId: number | null;
  updatedAt: string;
  createdAt: string;
};

const GRADE_NAMES: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AssessmentsClient({
  rows,
  drafts,
  meRole,
  meId,
}: {
  rows: AssessmentRow[];
  drafts: DraftRow[];
  meRole: string;
  meId: number | null;
}) {
  const router = useRouter();
  const showLead = meRole === 'admin';

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      <div className="text-center mb-[164px] animate-fade-up">
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          Оценки
        </h1>
      </div>

      {/* Черновики — показываем сверху, если есть. Открытый draft хочется
          видеть и продолжить, а не зарываться в табе. Для лида тут его
          собственные и чужие по подопечным; для стардиза — по подопечным;
          для админа — все. Skoupe строится на сервере (page.tsx). */}
      {drafts.length > 0 && (
        <section className="mb-8 animate-fade-up" style={{ animationDelay: '70ms' }}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-xl font-medium tracking-tight">
              Черновики
              <span className="ml-2 text-sm text-stone font-normal tabular-nums">
                {drafts.length}
              </span>
            </h2>
            <p className="text-xs text-stone">
              Незаконченные оценки — можно продолжить любой
            </p>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-cloud">
                  <th className="label-mono text-left py-2.5 px-4 text-stone">
                    Дизайнер
                  </th>
                  <th className="label-mono text-left py-2.5 px-4 text-stone">
                    Последнее изменение
                  </th>
                  <th className="label-mono text-left py-2.5 px-4 text-stone">
                    Билд
                  </th>
                  <th className="label-mono text-left py-2.5 px-4 text-stone">
                    Автор черновика
                  </th>
                  <th className="label-mono text-right py-2.5 px-4 text-stone w-56">
                    Действие
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {drafts.map((d) => {
                  const isOwnDraft = d.leadId === meId;
                  return (
                    <tr
                      key={d.id}
                      className="hover:bg-canvas/60 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={d.designerName}
                            avatarUrl={d.designerAvatarUrl}
                            size={32}
                          />
                          <div className="min-w-0">
                            <div className="font-medium leading-tight">
                              {d.designerName}
                            </div>
                            <div className="text-xs text-stone leading-tight mt-0.5 truncate">
                              {d.designerEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone tabular-nums whitespace-nowrap">
                        {formatDate(d.updatedAt)}
                      </td>
                      <td className="py-3 px-4">
                        {d.buildCode && d.buildName ? (
                          <span className="chip-build">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: buildColor(d.buildCode) }}
                            />
                            {d.buildName}
                          </span>
                        ) : (
                          <span className="text-ash">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-stone">
                        {isOwnDraft ? (
                          <span className="text-ink font-medium">Я</span>
                        ) : (
                          d.leadName ?? '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <DeleteButton
                            assessmentId={d.id}
                            designerName={d.designerName}
                          />
                          <a
                            href={`/lead/assess?id=${d.designerId}`}
                            className="btn-accent btn-sm"
                          >
                            Продолжить
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="card p-10 text-center animate-fade-up" style={{ animationDelay: '110ms' }}>
          <p className="text-stone">Опубликованных оценок пока нет.</p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-up" style={{ animationDelay: '110ms' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-cloud">
                <th className="label-mono text-left py-2.5 px-4 text-stone">
                  Имя
                </th>
                <th className="label-mono text-left py-2.5 px-4 text-stone">
                  Опубликовано
                </th>
                <th className="label-mono text-left py-2.5 px-4 text-stone">
                  Билд
                </th>
                <th className="label-mono text-left py-2.5 px-4 text-stone">
                  {showLead ? 'Лид' : 'Отдел'}
                </th>
                <th className="label-mono text-right py-2.5 px-4 text-stone">
                  Грейд
                </th>
                <th className="label-mono text-right py-2.5 px-4 text-stone">
                  XP
                </th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/lead/portrait?id=${r.designerId}`)}
                  className="hover:bg-canvas/60 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={r.designerName}
                        avatarUrl={r.designerAvatarUrl}
                        size={32}
                      />
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">
                          {r.designerName}
                        </div>
                        <div className="text-xs text-stone leading-tight mt-0.5 truncate">
                          {r.designerEmail}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-stone tabular-nums whitespace-nowrap">
                    {formatDate(r.publishedAt)}
                  </td>
                  <td className="py-3 px-4">
                    {r.buildCode && r.buildName ? (
                      <span className="chip-build">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: buildColor(r.buildCode) }}
                        />
                        {r.buildName}
                      </span>
                    ) : (
                      <span className="text-ash">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-stone">
                    {showLead ? r.leadName ?? '—' : r.department ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-display text-base font-medium tracking-tight">
                      {GRADE_NAMES[r.effectiveGrade ?? 'junior'] ??
                        r.effectiveGrade ??
                        '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-stone tabular-nums">
                    {r.totalXp ?? 0}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <DeleteButton assessmentId={r.id} designerName={r.designerName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
