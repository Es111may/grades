import { describe, it, expect } from 'vitest';
import {
  FEATURE_AREAS,
  SECTIONS,
  UPDATES,
  addressedTo,
  areaCounts,
  filterSections,
  filterUpdates,
  forRole,
  sectionsFor,
  updatesFor,
  type FeatureRole,
  type FeatureSection,
  type FeatureUpdate,
} from '../features';

const ALL: FeatureRole[] = ['admin', 'lead', 'stardiz'];
const AL: FeatureRole[] = ['admin', 'lead'];

function u(
  id: string,
  area: FeatureUpdate['area'],
  roles: FeatureRole[],
  details: FeatureUpdate['details'] = [{ text: 'для всех' }],
): FeatureUpdate {
  return { id, area, date: '2026-01-01', title: id, summary: '', roles, details };
}

// Выдуманный журнал: по записи на область, внутри — пункты для разных ролей
const UPD: FeatureUpdate[] = [
  u('pay', 'salary', AL, [
    { text: 'для всех' },
    { text: 'только админу', roles: ['admin'] },
    { text: 'только лиду', roles: ['lead'] },
  ]),
  u('crew', 'team', ALL, [{ text: 'для всех' }, { text: 'лиду и стардизу', roles: ['lead', 'stardiz'] }]),
  u('crew-2', 'team', ALL),
  u('login-as', 'access', ['admin']),
  u('mine', 'grading', ['lead', 'stardiz']),
];

const SEC: FeatureSection[] = [
  {
    id: 'desk',
    area: 'team',
    title: 'Стол',
    summary: '',
    roles: ALL,
    items: [
      { title: 'Общее', text: '' },
      { title: 'Админу', text: '', roles: ['admin'] },
      { title: 'Стардизу', text: '', roles: ['stardiz'] },
    ],
  },
  { id: 'money', area: 'salary', title: 'Деньги', summary: '', roles: AL, items: [] },
  { id: 'self', area: 'grading', title: 'Портрет', summary: '', roles: ['lead', 'stardiz'], items: [] },
];

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('addressedTo', () => {
  it('без ролей — для всех, с ролями — только своим', () => {
    expect(addressedTo(UPD[0].details, 'lead').map((d) => d.text)).toEqual(['для всех', 'только лиду']);
  });

  it('для админа тоже строго, в отличие от forRole', () => {
    expect(ids(forRole(UPD, 'admin'))).toEqual(ids(UPD));
    expect(ids(addressedTo(UPD, 'admin'))).toEqual(['pay', 'crew', 'crew-2', 'login-as']);
  });
});

describe('filterUpdates', () => {
  it('без фильтров отдаёт список как есть', () => {
    expect(filterUpdates({ updates: UPD })).toBe(UPD);
  });

  it('по области', () => {
    expect(ids(filterUpdates({ updates: UPD, area: 'team' }))).toEqual(['crew', 'crew-2']);
  });

  it('по роли — и записи, и пункты внутри', () => {
    const lead = filterUpdates({ updates: UPD, role: 'lead' });
    expect(ids(lead)).toEqual(['pay', 'crew', 'crew-2', 'mine']);
    expect(lead[0].details.map((d) => d.text)).toEqual(['для всех', 'только лиду']);

    const admin = filterUpdates({ updates: UPD, role: 'admin' });
    expect(admin[0].details.map((d) => d.text)).toEqual(['для всех', 'только админу']);
    expect(admin[1].details.map((d) => d.text)).toEqual(['для всех']);
  });

  it('область и роль вместе', () => {
    expect(ids(filterUpdates({ updates: UPD, area: 'salary', role: 'stardiz' }))).toEqual([]);
    expect(ids(filterUpdates({ updates: UPD, area: 'grading', role: 'stardiz' }))).toEqual(['mine']);
  });

  it('не мутирует исходные записи', () => {
    filterUpdates({ updates: UPD, role: 'lead' });
    expect(UPD[0].details).toHaveLength(3);
  });
});

describe('filterSections', () => {
  it('по роли — разделы и пункты', () => {
    const stardiz = filterSections({ sections: SEC, role: 'stardiz' });
    expect(ids(stardiz)).toEqual(['desk', 'self']);
    expect(stardiz[0].items.map((i) => i.title)).toEqual(['Общее', 'Стардизу']);
  });

  it('по области', () => {
    expect(ids(filterSections({ sections: SEC, area: 'salary' }))).toEqual(['money']);
  });
});

describe('areaCounts', () => {
  it('только присутствующие области, в порядке FEATURE_AREAS', () => {
    expect(areaCounts(UPD)).toEqual([
      { area: 'salary', label: 'Зарплата', count: 1 },
      { area: 'team', label: 'Команда', count: 2 },
      { area: 'grading', label: 'Грейдирование и оценки', count: 1 },
      { area: 'access', label: 'Доступ и роли', count: 1 },
    ]);
  });

  it('пустой список — пустой ответ', () => {
    expect(areaCounts([])).toEqual([]);
  });
});

// Инварианты на настоящих данных: фильтр «Роль» у админа показывает ровно
// то, что увидит лид или стардиз, — то же, что отдаёт им сервер.
describe('данные страницы', () => {
  it.each(['lead', 'stardiz'] as FeatureRole[])('фильтр «Роль: %s» = то, что видит роль', (role) => {
    expect(filterUpdates({ updates: updatesFor('admin'), role })).toEqual(updatesFor(role));
    expect(filterSections({ sections: sectionsFor('admin'), role })).toEqual(sectionsFor(role));
  });

  it('у каждой записи — известная область', () => {
    const known = new Set(FEATURE_AREAS.map((a) => a.id));
    for (const x of [...UPDATES, ...SECTIONS]) expect(known.has(x.area), x.id).toBe(true);
  });

  it('id записей уникальны', () => {
    expect(new Set(ids(UPDATES)).size).toBe(UPDATES.length);
    expect(new Set(ids(SECTIONS)).size).toBe(SECTIONS.length);
  });

  it('«Что нового» — сверху новое, даты YYYY-MM-DD', () => {
    for (const x of UPDATES) expect(x.date, x.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = UPDATES.map((x) => x.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('пункт адресован только тем, кому видна сама запись', () => {
    // Иначе пункт для роли, которой запись не показывается, не увидит никто,
    // кроме админа
    for (const x of UPDATES) {
      for (const d of x.details) {
        for (const r of d.roles ?? []) expect(x.roles.includes(r), `${x.id}: ${d.text}`).toBe(true);
      }
    }
    for (const s of SECTIONS) {
      for (const i of s.items) {
        for (const r of i.roles ?? []) expect(s.roles.includes(r), `${s.id}: ${i.title}`).toBe(true);
      }
    }
  });
});
