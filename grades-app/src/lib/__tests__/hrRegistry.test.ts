import { describe, expect, it } from 'vitest';
import {
  HR_DESIGN_POSITION_IDS,
  HR_REGISTRY_POSITION_IDS,
  REGISTRY_DEPARTED_SINCE,
  fixLatinLookalikes,
  hrFullName,
  isDesignContour,
  isLiteDepartment,
  mapHrDepartment,
  nameKey,
  normalizeHrDate,
  pickHrRecord,
  planRegistrySync,
  roleForPosition,
  type GradesUser,
  type HrPerson,
} from '../hrRegistry';

// Все люди и адреса выдуманы.
const TODAY = '2026-10-01';

const hrRow = (over: Partial<HrPerson> & { id: string; email: string | null }): HrPerson => ({
  firstNameRu: 'Тест',
  lastNameRu: 'Тестов',
  firstName: 'Test',
  lastName: 'Testov',
  positionId: 9,
  department: 'Create',
  hiredAt: '2023-03-01',
  dismissedAt: '1970-01-01',
  isArchive: 0,
  isHourly: 0,
  ...over,
});

const user = (over: Partial<GradesUser> & { id: number; email: string }): GradesUser => ({
  fullName: 'Кто-то Другой',
  active: true,
  role: 'designer',
  employmentType: 'staff',
  hiredAt: '2023-03-01T00:00:00.000Z',
  dismissedAt: null,
  ...over,
});

const plan = (hr: HrPerson[], users: GradesUser[] = [], excluded: string[] = [], include = false) =>
  planRegistrySync({ hr, users, excluded, options: { today: TODAY, includeActiveMissing: include } });

describe('roleForPosition', () => {
  it('Lead Designer — лид, Design — дизайнер', () => {
    expect(roleForPosition(20)).toBe('lead');
    expect(roleForPosition(9)).toBe('designer');
    expect(roleForPosition('9')).toBe('designer');
  });
  it('Дизайн-инженер (29) — не дизайн', () => {
    expect(roleForPosition(29)).toBeNull();
    expect(roleForPosition('29')).toBeNull();
  });
  it('прочие позиции — не дизайн', () => {
    expect(roleForPosition(3)).toBeNull();
    expect(roleForPosition(null)).toBeNull();
    expect(roleForPosition('abc')).toBeNull();
  });
});

describe('mapHrDepartment', () => {
  it('нынешние отделы — кириллица и билд', () => {
    expect(mapHrDepartment('Improve')).toEqual({ department: 'Импрув', buildCode: 'navigator' });
    expect(mapHrDepartment(' create ')).toEqual({ department: 'Криэйт', buildCode: 'visioner' });
    expect(mapHrDepartment('design.inhouse')).toEqual({ department: 'Инхаус', buildCode: 'creator' });
  });
  it('прошлые отделы — название как есть, без билда', () => {
    expect(mapHrDepartment('Lite')).toEqual({ department: 'Lite', buildCode: null });
    expect(mapHrDepartment('Самолет')).toEqual({ department: 'Самолет', buildCode: null });
    expect(mapHrDepartment('Ида.Бид')).toEqual({ department: 'Ида.Бид', buildCode: null });
  });
  it('пусто — без отдела', () => {
    expect(mapHrDepartment('')).toEqual({ department: null, buildCode: null });
    expect(mapHrDepartment(null)).toEqual({ department: null, buildCode: null });
  });
});

describe('hrFullName', () => {
  it('«Имя Фамилия» по-русски, лишние пробелы убраны', () => {
    expect(hrFullName({ firstNameRu: ' Анна ', lastNameRu: 'Пример  ', firstName: 'Anna', lastName: 'Primer' })).toBe(
      'Анна Пример',
    );
  });
  it('нет русской фамилии — латиница целиком', () => {
    expect(hrFullName({ firstNameRu: 'Анна', lastNameRu: '', firstName: 'Anna', lastName: 'Primer' })).toBe(
      'Anna Primer',
    );
  });
  it('неполно везде — что есть, русское первым', () => {
    expect(hrFullName({ firstNameRu: 'Анна', firstName: 'Anna' })).toBe('Анна');
    expect(hrFullName({ lastName: 'Primer' })).toBe('Primer');
  });
  it('пусто — null', () => {
    expect(hrFullName({ firstNameRu: ' ', lastNameRu: null })).toBeNull();
  });
  it('латинские двойники в кириллическом имени — кириллицей', () => {
    // «Aлeкcaндpa Тeкcтoвa»: латинские A, e, c, a, p, o внутри кириллицы
    const name = hrFullName({ firstNameRu: 'Aлeкcaндpa', lastNameRu: 'Тeкcтoвa' });
    expect(name).toBe('Александра Текстова');
    expect(name).not.toMatch(/[a-z]/i);
  });
});

describe('fixLatinLookalikes', () => {
  it('меняет все двойники из списка, если в слове есть кириллица', () => {
    expect(fixLatinLookalikes('жAaBCcEeHKkMOoPpTXxyY')).toBe('жАаВСсЕеНКкМОоРрТХхуУ');
  });
  it('чисто латинские слова не трогает', () => {
    expect(fixLatinLookalikes('Maxim Petrov')).toBe('Maxim Petrov');
  });
  it('смешанное имя: кириллическое слово правит, латинское оставляет', () => {
    expect(fixLatinLookalikes('Мapия Brown')).toBe('Мария Brown');
  });
  it('недвойники в кириллическом слове не трогает', () => {
    expect(fixLatinLookalikes('Анна-Zоя')).toBe('Анна-Zоя');
  });
});

describe('normalizeHrDate', () => {
  it('1970-01-01 и всё до 2000 — нет даты', () => {
    expect(normalizeHrDate('1970-01-01')).toBeNull();
    expect(normalizeHrDate('1999-12-31')).toBeNull();
  });
  it('дата и дата-время → YYYY-MM-DD', () => {
    expect(normalizeHrDate('2024-05-06')).toBe('2024-05-06');
    expect(normalizeHrDate('2024-05-06 10:00:00')).toBe('2024-05-06');
    expect(normalizeHrDate(new Date('2024-05-06T00:00:00Z'))).toBe('2024-05-06');
  });
  it('пустое и мусор — null', () => {
    expect(normalizeHrDate(null)).toBeNull();
    expect(normalizeHrDate('')).toBeNull();
    expect(normalizeHrDate('вчера')).toBeNull();
  });
});

describe('nameKey', () => {
  it('без регистра, ё = е, порядок слов не важен', () => {
    expect(nameKey('Алёна  Пример')).toBe(nameKey('пример АЛЕНА'));
  });
});

describe('pickHrRecord — дубли учёток', () => {
  it('живая учётка важнее архивной', () => {
    const rows = [
      hrRow({ id: 'old', email: 'x@example.test', hiredAt: '2025-01-01', isArchive: 1 }),
      hrRow({ id: 'live', email: 'x@example.test', hiredAt: '2021-01-01' }),
    ];
    expect(pickHrRecord(rows)?.id).toBe('live');
  });
  it('живых нет — самая поздняя по найму', () => {
    const rows = [
      hrRow({ id: 'a', email: 'x@example.test', hiredAt: '2020-01-01', dismissedAt: '2021-01-01' }),
      hrRow({ id: 'b', email: 'x@example.test', hiredAt: '2022-01-01', dismissedAt: '2023-01-01' }),
    ];
    expect(pickHrRecord(rows)?.id).toBe('b');
  });
});

describe('planRegistrySync', () => {
  it('ушедшего, которого нет в Грейдах, создаёт неактивным', () => {
    const p = plan([
      hrRow({
        id: 'hr-1',
        email: 'Gone@Example.test',
        firstNameRu: 'Ольга',
        lastNameRu: 'Ушедшая',
        positionId: 20,
        department: 'Improve',
        hiredAt: '2021-02-01',
        dismissedAt: '2025-06-30',
        isHourly: 1,
      }),
    ]);
    expect(p.create).toEqual([
      {
        hrId: 'hr-1',
        email: 'gone@example.test',
        fullName: 'Ольга Ушедшая',
        role: 'lead',
        department: 'Импрув',
        buildCode: 'navigator',
        hiredAt: '2021-02-01',
        dismissedAt: '2025-06-30',
        employmentType: 'hourly',
        departed: true,
        hrRows: 1,
        active: false,
      },
    ]);
    expect(p.activeMissing).toEqual([]);
  });

  it('учётка в архиве — ушедший, даже если дата увольнения в будущем', () => {
    const p = plan([hrRow({ id: 'hr-2', email: 'arch@example.test', isArchive: 1, dismissedAt: '2026-12-01' })]);
    expect(p.create).toHaveLength(1);
    expect(p.create[0]).toMatchObject({ active: false, departed: true });
  });

  it('активного в HR без карточки только перечисляет', () => {
    const hr = [hrRow({ id: 'hr-3', email: 'new@example.test', department: 'Самолет' })];
    const p = plan(hr);
    expect(p.create).toEqual([]);
    expect(p.activeMissing).toHaveLength(1);
    expect(p.activeMissing[0]).toMatchObject({ department: 'Самолет', buildCode: null, departed: false });
    expect(p.includeErrors).toEqual([]);
  });

  it('с includeActiveMissing создаёт активного и оставляет его в списке', () => {
    const p = plan([hrRow({ id: 'hr-3', email: 'new@example.test' })], [], [], true);
    expect(p.create).toHaveLength(1);
    expect(p.create[0]).toMatchObject({ active: true, email: 'new@example.test' });
    expect(p.activeMissing).toHaveLength(1);
  });

  it('увольнение в будущем — ещё работает', () => {
    const p = plan([hrRow({ id: 'hr-4', email: 'leaving@example.test', dismissedAt: '2026-10-15' })]);
    expect(p.create).toEqual([]);
    expect(p.activeMissing[0]?.departed).toBe(false);
  });

  it('исключённых не создаёт, а перечисляет', () => {
    const p = plan(
      [hrRow({ id: 'hr-5', email: 'Deleted@example.test', dismissedAt: '2024-01-01' })],
      [],
      ['deleted@example.test'],
    );
    expect(p.create).toEqual([]);
    expect(p.skipExcluded.map((x) => x.hrId)).toEqual(['hr-5']);
  });

  it('позиции вне дизайна пропускает, без email — расхождение', () => {
    const p = plan([
      hrRow({ id: 'hr-6', email: 'ba@example.test', positionId: 4 }),
      hrRow({ id: 'hr-7', email: null, dismissedAt: '2024-01-01' }),
    ]);
    expect(p.stats.ignoredPositions).toBe(1);
    expect(p.conflicts).toEqual([{ kind: 'no_email', hrId: 'hr-7', email: null }]);
    expect(p.create).toEqual([]);
  });

  it('дубли одного email склеивает в одного человека', () => {
    const p = plan([
      hrRow({ id: 'a', email: 'dup@example.test', hiredAt: '2019-01-01', dismissedAt: '2025-01-15' }),
      hrRow({ id: 'b', email: 'DUP@example.test', hiredAt: '2025-03-01', dismissedAt: '2026-02-01' }),
    ]);
    expect(p.stats).toMatchObject({ hrRows: 2, people: 1, mergedDuplicates: 1 });
    expect(p.create).toHaveLength(1);
    expect(p.create[0]).toMatchObject({ hrId: 'b', hrRows: 2, hiredAt: '2025-03-01' });
  });

  describe('граница ушедших — с начала 2025 года', () => {
    it('по умолчанию граница — 2025-01-01', () => {
      expect(REGISTRY_DEPARTED_SINCE).toBe('2025-01-01');
    });

    it('ушедших раньше не создаёт, а считает; сам день границы — создаёт', () => {
      const p = plan([
        hrRow({ id: 'before', email: 'before@example.test', firstNameRu: 'Раньше', dismissedAt: '2024-12-31' }),
        hrRow({ id: 'edge', email: 'edge@example.test', firstNameRu: 'Граница', dismissedAt: '2025-01-01' }),
      ]);
      expect(p.create.map((c) => c.hrId)).toEqual(['edge']);
      expect(p.skipDepartedBefore.map((c) => c.hrId)).toEqual(['before']);
      expect(p.conflicts).toEqual([]);
    });

    it('ушедших без даты увольнения не создаёт — когда ушли, неизвестно', () => {
      const p = plan([hrRow({ id: 'undated', email: 'undated@example.test', isArchive: 1 })]);
      expect(p.create).toEqual([]);
      expect(p.skipDepartedUndated.map((c) => c.hrId)).toEqual(['undated']);
      expect(p.skipDepartedBefore).toEqual([]);
    });

    it('граница меняется опцией', () => {
      const hr = [hrRow({ id: 'old', email: 'old@example.test', hiredAt: '2019-01-01', dismissedAt: '2021-06-01' })];
      const p = planRegistrySync({
        hr,
        users: [],
        excluded: [],
        options: { today: TODAY, departedSince: '2020-01-01' },
      });
      expect(p.create.map((c) => c.hrId)).toEqual(['old']);
      expect(p.skipDepartedBefore).toEqual([]);
    });

    it('активных граница не касается', () => {
      const p = plan([hrRow({ id: 'act', email: 'act@example.test', hiredAt: '2018-01-01' })]);
      expect(p.activeMissing.map((c) => c.hrId)).toEqual(['act']);
    });

    it('существующему неактивному, ушедшему до границы, дату всё равно дозаполняет', () => {
      const hr = [hrRow({ id: 'x', email: 'gone2022@example.test', hiredAt: '2020-01-01', dismissedAt: '2022-03-01' })];
      const p = plan(hr, [user({ id: 9, email: 'gone2022@example.test', active: false, hiredAt: null })]);
      expect(p.update).toEqual([{ userId: 9, hrId: 'x', set: { hiredAt: '2020-01-01', dismissedAt: '2022-03-01' } }]);
      expect(p.skipDepartedBefore).toEqual([]);
    });

    it('старая учётка до границы не блокирует свежую тёзку', () => {
      const p = plan([
        hrRow({ id: 'old', email: 'old@example.test', isArchive: 1, hiredAt: '2019-01-01', dismissedAt: '2023-01-01' }),
        hrRow({ id: 'fresh', email: 'fresh@example.test', dismissedAt: '2025-08-01' }),
      ]);
      expect(p.conflicts).toEqual([]);
      expect(p.create.map((c) => c.hrId)).toEqual(['fresh']);
      expect(p.skipDepartedBefore.map((c) => c.hrId)).toEqual(['old']);
    });
  });

  describe('существующие люди', () => {
    it('поля не перетирает, дату найма дозаполняет только пустую', () => {
      const hr = [hrRow({ id: 'hr-8', email: 'cur@example.test', department: 'Improve', positionId: 20 })];
      expect(plan(hr, [user({ id: 1, email: 'cur@example.test' })]).update).toEqual([]);
      const p = plan(hr, [user({ id: 1, email: 'CUR@example.test', hiredAt: null })]);
      expect(p.update).toEqual([{ userId: 1, hrId: 'hr-8', set: { hiredAt: '2023-03-01' } }]);
      expect(p.create).toEqual([]);
      expect(p.stats.matched).toBe(1);
    });

    it('неактивному без даты увольнения ставит дату из HR', () => {
      const hr = [hrRow({ id: 'hr-9', email: 'off@example.test', dismissedAt: '2025-05-05' })];
      const p = plan(hr, [user({ id: 2, email: 'off@example.test', active: false })]);
      expect(p.update).toEqual([{ userId: 2, hrId: 'hr-9', set: { dismissedAt: '2025-05-05' } }]);
    });

    it('активному дату увольнения не ставит и не деактивирует — только справка', () => {
      const hr = [hrRow({ id: 'hr-10', email: 'back@example.test', dismissedAt: '2025-05-05' })];
      const p = plan(hr, [user({ id: 3, email: 'back@example.test' })]);
      expect(p.update).toEqual([]);
      expect(p.conflicts).toEqual([
        { kind: 'dismissed_in_hr_active_in_grades', hrId: 'hr-10', email: 'back@example.test', userId: 3 },
      ]);
    });

    it('почасовщик, выведенный из штата HR, — не расхождение', () => {
      const hr = [hrRow({ id: 'hr-11', email: 'h@example.test', dismissedAt: '2025-05-05' })];
      const p = plan(hr, [user({ id: 4, email: 'h@example.test', employmentType: 'hourly' })]);
      expect(p.conflicts).toEqual([]);
    });

    it('неактивного, который в HR работает, не активирует — только справка', () => {
      const hr = [hrRow({ id: 'hr-12', email: 'idle@example.test' })];
      const p = plan(hr, [user({ id: 5, email: 'idle@example.test', active: false, dismissedAt: '2025-01-01' })]);
      expect(p.update).toEqual([]);
      expect(p.conflicts.map((c) => c.kind)).toEqual(['active_in_hr_inactive_in_grades']);
    });

    it('увольнение раньше найма в Грейдах не ставит', () => {
      const hr = [hrRow({ id: 'hr-13', email: 'odd@example.test', hiredAt: null, dismissedAt: '2020-01-01' })];
      const p = plan(hr, [user({ id: 6, email: 'odd@example.test', active: false, hiredAt: '2022-01-01T00:00:00.000Z' })]);
      expect(p.update).toEqual([]);
      expect(p.conflicts.map((c) => c.kind)).toEqual(['dismissal_before_hire']);
    });
  });

  describe('тёзки — вторую карточку не заводим', () => {
    it('старая учётка человека, который уже есть в Грейдах', () => {
      const p = plan(
        [
          hrRow({ id: 'new', email: 'new.mail@example.test', firstNameRu: 'Анна', lastNameRu: 'Пример' }),
          hrRow({
            id: 'old',
            email: 'old.mail@example.test',
            firstNameRu: 'Анна',
            lastNameRu: 'Пример',
            isArchive: 1,
            dismissedAt: '2025-02-01',
          }),
        ],
        [user({ id: 7, email: 'new.mail@example.test', fullName: 'Аня П.' })],
      );
      expect(p.create).toEqual([]);
      expect(p.conflicts).toEqual([
        { kind: 'name_matches_user', hrId: 'old', email: 'old.mail@example.test', userId: 7 },
      ]);
    });

    it('сменённый email — совпадение по имени в Грейдах', () => {
      const p = plan(
        [hrRow({ id: 'x', email: 'other@example.test', firstNameRu: 'Пётр', lastNameRu: 'Образец', dismissedAt: '2025-04-01' })],
        [user({ id: 8, email: 'petr@example.test', fullName: 'Петр Образец', active: false })],
      );
      expect(p.create).toEqual([]);
      expect(p.conflicts.map((c) => [c.kind, c.userId])).toEqual([['name_matches_user', 8]]);
    });

    it('две учётки с одним именем в HR — обе в расхождения', () => {
      const p = plan([
        hrRow({ id: 'a', email: 'a@example.test', dismissedAt: '2025-03-01' }),
        hrRow({ id: 'b', email: 'b@example.test', dismissedAt: '2026-01-01' }),
      ]);
      expect(p.create).toEqual([]);
      expect(p.conflicts.map((c) => [c.kind, c.hrId])).toEqual([
        ['duplicate_name_in_hr', 'a'],
        ['duplicate_name_in_hr', 'b'],
      ]);
    });

    it('исключённая старая учётка снимает конфликт тёзок', () => {
      const p = plan(
        [
          hrRow({ id: 'a', email: 'a@example.test', dismissedAt: '2024-01-01' }),
          hrRow({ id: 'b', email: 'b@example.test', dismissedAt: '2025-01-01' }),
        ],
        [],
        ['a@example.test'],
      );
      expect(p.conflicts).toEqual([]);
      expect(p.create.map((c) => c.hrId)).toEqual(['b']);
    });
  });

  it('увольнение раньше найма в самой HR — не создаём', () => {
    const p = plan([hrRow({ id: 'r', email: 'r@example.test', hiredAt: '2025-03-01', dismissedAt: '2024-12-01' })]);
    expect(p.create).toEqual([]);
    expect(p.conflicts.map((c) => c.kind)).toEqual(['dismissal_before_hire']);
  });

  it('повторный прогон после записи — делать нечего', () => {
    const hr = [
      hrRow({ id: 'g1', email: 'g1@example.test', firstNameRu: 'Первый', dismissedAt: '2025-02-01' }),
      hrRow({ id: 'g2', email: 'g2@example.test', firstNameRu: 'Второй', isArchive: 1, dismissedAt: '2025-07-01' }),
      hrRow({ id: 'old', email: 'old@example.test', firstNameRu: 'Давний', hiredAt: '2019-01-01', dismissedAt: '2022-05-01' }),
      hrRow({ id: 'c1', email: 'c1@example.test', firstNameRu: 'Третий' }),
    ];
    const users = [user({ id: 1, email: 'c1@example.test', fullName: 'Третий Тестов', hiredAt: null })];
    const first = plan(hr, users);
    expect(first.create).toHaveLength(2);
    expect(first.update).toHaveLength(1);

    // «Записали»: созданные — пользователями, дата найма — в карточке
    let nextId = 100;
    const after: GradesUser[] = [
      { ...users[0], hiredAt: `${first.update[0].set.hiredAt}T00:00:00.000Z` },
      ...first.create.map((c) => ({
        id: nextId++,
        email: c.email,
        fullName: c.fullName,
        active: c.active,
        role: c.role,
        employmentType: c.employmentType,
        hiredAt: c.hiredAt ? `${c.hiredAt}T00:00:00.000Z` : null,
        dismissedAt: c.dismissedAt ? `${c.dismissedAt}T00:00:00.000Z` : null,
      })),
    ];
    const second = plan(hr, after);
    expect(second.create).toEqual([]);
    expect(second.update).toEqual([]);
    expect(second.conflicts).toEqual([]);
    expect(second.stats.matched).toBe(3);
    // Ушедший до границы так и остаётся пропущенным — стабильно, без создания
    expect(second.skipDepartedBefore.map((x) => x.hrId)).toEqual(['old']);
  });
});

describe('контур дизайна — без Lite и дизайн-инженеров (Pavel, 01.10.2026)', () => {
  it('справочники: дизайн — 9 и 20; сверка выбирает и 29, чтобы посчитать', () => {
    const asc = (xs: readonly number[]) => [...xs].sort((x, y) => x - y);
    expect(asc(HR_DESIGN_POSITION_IDS)).toEqual([9, 20]);
    expect(asc(HR_REGISTRY_POSITION_IDS)).toEqual([9, 20, 29]);
  });

  it('isLiteDepartment и isDesignContour', () => {
    expect(isLiteDepartment('Lite')).toBe(true);
    expect(isLiteDepartment(' lite ')).toBe(true);
    expect(isLiteDepartment('Create')).toBe(false);
    expect(isLiteDepartment(null)).toBe(false);
    expect(isDesignContour({ positionId: 9, department: 'Create' })).toBe(true);
    expect(isDesignContour({ positionId: '20', department: null })).toBe(true);
    expect(isDesignContour({ positionId: 9, department: 'Lite' })).toBe(false);
    expect(isDesignContour({ positionId: 29, department: 'Create' })).toBe(false);
    expect(isDesignContour({ positionId: 4 })).toBe(false);
  });

  it('Lite — ни создания, ни «нет в Грейдах», только счётчик', () => {
    const p = plan(
      [
        hrRow({ id: 'lite-act', email: 'lite.act@example.test', firstNameRu: 'Лайт', department: 'Lite' }),
        hrRow({ id: 'lite-gone', email: 'lite.gone@example.test', firstNameRu: 'Лайтушёл', department: 'Lite', dismissedAt: '2025-05-01' }),
        hrRow({ id: 'lite-lead', email: 'lite.lead@example.test', firstNameRu: 'Лайтлид', department: 'lite', positionId: 20 }),
      ],
      [],
      [],
      true,
    );
    expect(p.create).toEqual([]);
    expect(p.activeMissing).toEqual([]);
    expect(p.conflicts).toEqual([]);
    expect(p.stats).toMatchObject({ people: 3, skippedLite: 3, skippedEngineer: 0, ignoredPositions: 0 });
  });

  it('позиция 29 — счётчик дизайн-инженеров; 29 из Lite — в счётчике Lite', () => {
    const p = plan(
      [
        hrRow({ id: 'eng', email: 'eng@example.test', firstNameRu: 'Инженер', positionId: 29 }),
        hrRow({ id: 'eng-gone', email: 'eng.gone@example.test', firstNameRu: 'Инженерушёл', positionId: '29', dismissedAt: '2025-03-01' }),
        hrRow({ id: 'eng-lite', email: 'eng.lite@example.test', firstNameRu: 'Инженерлайт', positionId: 29, department: 'Lite' }),
      ],
      [],
      [],
      true,
    );
    expect(p.create).toEqual([]);
    expect(p.activeMissing).toEqual([]);
    expect(p.stats).toMatchObject({ skippedEngineer: 2, skippedLite: 1 });
  });

  it('совпавшего с Грейдами из Lite не трогает: ни дат, ни справок', () => {
    const p = plan(
      [hrRow({ id: 'lite-cur', email: 'lite.cur@example.test', department: 'Lite', dismissedAt: '2025-05-05' })],
      [user({ id: 1, email: 'lite.cur@example.test', hiredAt: null })],
    );
    expect(p.update).toEqual([]);
    expect(p.conflicts).toEqual([]);
    expect(p.stats.matched).toBe(0);
  });

  it('решает живая учётка: перешёл в Lite — вне контура, из Lite в дизайн — в контуре', () => {
    const p = plan([
      // Ушёл из Криэйта, учётку пересоздали в Lite
      hrRow({ id: 'to-old', email: 'to.lite@example.test', firstNameRu: 'Перешёл', isArchive: 1, dismissedAt: '2025-04-01' }),
      hrRow({ id: 'to-new', email: 'to.lite@example.test', firstNameRu: 'Перешёл', department: 'Lite', hiredAt: '2025-04-02' }),
      // Наоборот: архивная учётка в Lite, живая — в Криэйте
      hrRow({ id: 'from-old', email: 'from.lite@example.test', firstNameRu: 'Вернулся', department: 'Lite', isArchive: 1, dismissedAt: '2025-04-01' }),
      hrRow({ id: 'from-new', email: 'from.lite@example.test', firstNameRu: 'Вернулся', hiredAt: '2025-04-02' }),
    ]);
    expect(p.stats).toMatchObject({ people: 2, skippedLite: 1, mergedDuplicates: 2 });
    expect(p.create).toEqual([]);
    expect(p.activeMissing.map((x) => x.hrId)).toEqual(['from-new']);
  });

  it('тёзка из Lite не создаёт конфликт тёзок в HR', () => {
    const p = plan([
      hrRow({ id: 'd', email: 'designer@example.test', dismissedAt: '2025-06-01' }),
      hrRow({ id: 'l', email: 'namesake@example.test', department: 'Lite', dismissedAt: '2025-06-01' }),
    ]);
    expect(p.conflicts).toEqual([]);
    expect(p.create.map((c) => c.hrId)).toEqual(['d']);
  });
});

describe('декрет — пока в декрете, не заводим', () => {
  it('активная в декрете: не в «нет в Грейдах» и не создаётся даже с includeActiveMissing', () => {
    const p = plan(
      [
        hrRow({ id: 'mat', email: 'mat@example.test', firstNameRu: 'Декрет', maternityLeave: 1 }),
        hrRow({ id: 'mat-s', email: 'mat.s@example.test', firstNameRu: 'Декретстрока', maternityLeave: '1' }),
        hrRow({ id: 'work', email: 'work@example.test', firstNameRu: 'Работает', maternityLeave: 0 }),
      ],
      [],
      [],
      true,
    );
    // Порядок — по email: «mat.s@» раньше «mat@»
    expect(p.onMaternity.map((x) => x.hrId)).toEqual(['mat-s', 'mat']);
    expect(p.activeMissing.map((x) => x.hrId)).toEqual(['work']);
    expect(p.create.map((c) => c.hrId)).toEqual(['work']);
  });

  it('ушедшая с флагом декрета — как все ушедшие: создаётся неактивной', () => {
    const p = plan([hrRow({ id: 'g', email: 'g@example.test', maternityLeave: 1, dismissedAt: '2025-09-01' })]);
    expect(p.onMaternity).toEqual([]);
    expect(p.create).toMatchObject([{ hrId: 'g', active: false }]);
  });

  it('существующую в Грейдах не касается', () => {
    const p = plan(
      [hrRow({ id: 'm', email: 'm@example.test', maternityLeave: true })],
      [user({ id: 3, email: 'm@example.test', hiredAt: null })],
    );
    expect(p.onMaternity).toEqual([]);
    expect(p.update).toEqual([{ userId: 3, hrId: 'm', set: { hiredAt: '2023-03-01' } }]);
  });

  it('исключённая в декрете — в исключённых, не в декрете', () => {
    const p = plan([hrRow({ id: 'x', email: 'x@example.test', maternityLeave: 1 })], [], ['x@example.test']);
    expect(p.skipExcluded.map((x) => x.hrId)).toEqual(['x']);
    expect(p.onMaternity).toEqual([]);
  });

  it('в декрете не блокирует тёзку', () => {
    const p = plan([
      hrRow({ id: 'a', email: 'a@example.test', maternityLeave: 1 }),
      hrRow({ id: 'b', email: 'b@example.test', dismissedAt: '2025-06-01' }),
    ]);
    expect(p.conflicts).toEqual([]);
    expect(p.create.map((c) => c.hrId)).toEqual(['b']);
  });
});

describe('includeHrIds — создать только перечисленных активных', () => {
  const planIds = (hr: HrPerson[], ids: string[], users: GradesUser[] = [], excluded: string[] = []) =>
    planRegistrySync({ hr, users, excluded, options: { today: TODAY, includeHrIds: ids } });

  it('создаёт только указанных; остальные — только в списке', () => {
    const p = planIds(
      [
        hrRow({ id: 'pick', email: 'pick@example.test', firstNameRu: 'Нужная', department: 'design.inhouse' }),
        hrRow({ id: 'skip', email: 'skip@example.test', firstNameRu: 'Другая' }),
      ],
      ['PICK'],
    );
    expect(p.activeMissing.map((x) => x.hrId)).toEqual(['pick', 'skip']);
    expect(p.create).toEqual([
      expect.objectContaining({ hrId: 'pick', active: true, department: 'Инхаус', buildCode: 'creator' }),
    ]);
    expect(p.includeErrors).toEqual([]);
  });

  it('ушедших создаёт как обычно — флаг касается только активных', () => {
    const p = planIds(
      [
        hrRow({ id: 'pick', email: 'pick@example.test', firstNameRu: 'Нужная' }),
        hrRow({ id: 'gone', email: 'gone@example.test', firstNameRu: 'Ушедшая', dismissedAt: '2025-06-01' }),
      ],
      ['pick'],
    );
    expect(p.create.map((c) => [c.hrId, c.active])).toEqual([
      ['gone', false],
      ['pick', true],
    ]);
  });

  it('вместе с includeActiveMissing — все активные, без ошибок', () => {
    const p = planRegistrySync({
      hr: [
        hrRow({ id: 'a', email: 'a@example.test', firstNameRu: 'Первая' }),
        hrRow({ id: 'b', email: 'b@example.test', firstNameRu: 'Вторая' }),
      ],
      users: [],
      excluded: [],
      options: { today: TODAY, includeActiveMissing: true, includeHrIds: ['a'] },
    });
    expect(p.create.map((c) => c.hrId)).toEqual(['a', 'b']);
    expect(p.includeErrors).toEqual([]);
  });

  it('id не из «нет в Грейдах» — ошибка с причиной, ничего для него не создаём', () => {
    const p = planIds(
      [
        hrRow({ id: 'cur', email: 'cur@example.test', firstNameRu: 'Есть' }),
        hrRow({ id: 'exc', email: 'exc@example.test', firstNameRu: 'Исключена' }),
        hrRow({ id: 'lite', email: 'lite@example.test', firstNameRu: 'Лайт', department: 'Lite' }),
        hrRow({ id: 'eng', email: 'eng@example.test', firstNameRu: 'Инженер', positionId: 29 }),
        hrRow({ id: 'mat', email: 'mat@example.test', firstNameRu: 'Декрет', maternityLeave: 1 }),
        hrRow({ id: 'gone', email: 'gone@example.test', firstNameRu: 'Ушла', dismissedAt: '2025-06-01' }),
        hrRow({ id: 'old', email: 'old@example.test', firstNameRu: 'Давно', dismissedAt: '2023-06-01' }),
        hrRow({ id: 'twin', email: 'twin@example.test', firstNameRu: 'Тёзка' }),
        hrRow({ id: 'dup-old', email: 'dup@example.test', firstNameRu: 'Дубль', isArchive: 1, dismissedAt: '2024-01-01' }),
        hrRow({ id: 'dup-new', email: 'dup@example.test', firstNameRu: 'Дубль', hiredAt: '2024-02-01' }),
        hrRow({ id: 'ba', email: 'ba@example.test', firstNameRu: 'Аналитик', positionId: 4 }),
      ],
      ['cur', 'exc', 'lite', 'eng', 'mat', 'gone', 'old', 'twin', 'dup-old', 'ba', 'nobody', 'dup-new'],
      [
        user({ id: 1, email: 'cur@example.test', fullName: 'Есть Тестов' }),
        user({ id: 2, email: 'twin.other@example.test', fullName: 'Тёзка Тестов' }),
      ],
      ['exc@example.test'],
    );
    expect(p.includeErrors).toEqual([
      { hrId: 'cur', reason: 'in_grades' },
      { hrId: 'exc', reason: 'excluded' },
      { hrId: 'lite', reason: 'outside_contour' },
      { hrId: 'eng', reason: 'outside_contour' },
      { hrId: 'mat', reason: 'on_maternity' },
      { hrId: 'gone', reason: 'departed' },
      { hrId: 'old', reason: 'departed' },
      { hrId: 'twin', reason: 'conflict' },
      { hrId: 'dup-old', reason: 'merged' },
      { hrId: 'ba', reason: 'not_found' },
      { hrId: 'nobody', reason: 'not_found' },
    ]);
    // Активным создаётся только dup-new; ушедшая — неактивной, как без флага
    expect(p.create.map((c) => [c.hrId, c.active])).toEqual([
      ['dup-new', true],
      ['gone', false],
    ]);
  });

  it('повторный прогон после записи — тот же id уже «в Грейдах»', () => {
    const hr = [hrRow({ id: 'pick', email: 'pick@example.test', firstNameRu: 'Нужная' })];
    const first = planIds(hr, ['pick']);
    expect(first.create).toHaveLength(1);
    const c = first.create[0];
    const second = planIds(hr, ['pick'], [user({ id: 50, email: c.email, fullName: c.fullName, hiredAt: `${c.hiredAt}T00:00:00.000Z` })]);
    expect(second.create).toEqual([]);
    expect(second.update).toEqual([]);
    expect(second.includeErrors).toEqual([{ hrId: 'pick', reason: 'in_grades' }]);
  });
});
