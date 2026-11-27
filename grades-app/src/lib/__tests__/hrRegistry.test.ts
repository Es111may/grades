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

// Латинское имя у каждой учётки своё: по нему тоже ищем тёзок (27.11.2026),
// а одинаковое у всех склеило бы людей, которых тест различает по-русски.
// Ушедший в HR — учётка в архиве (признак ухода — архив, 27.11.2026): с
// наступившей датой увольнения архив по умолчанию стоит; вернувшихся (не в
// архиве, но с датой) тесты задают явно — isArchive: 0.
const hrRow = (over: Partial<HrPerson> & { id: string; email: string | null }): HrPerson => {
  const dismissed = normalizeHrDate(over.dismissedAt);
  return {
    firstNameRu: 'Тест',
    lastNameRu: 'Тестов',
    firstName: 'Test',
    lastName: `Testov-${over.id}`,
    positionId: 9,
    department: 'Create',
    hiredAt: '2023-03-01',
    dismissedAt: '1970-01-01',
    isArchive: dismissed && dismissed <= TODAY ? 1 : 0,
    isHourly: 0,
    ...over,
  };
};

const user = (over: Partial<GradesUser> & { id: number; email: string }): GradesUser => ({
  fullName: 'Кто-то Другой',
  active: true,
  role: 'designer',
  employmentType: 'staff',
  hiredAt: '2023-03-01T00:00:00.000Z',
  dismissedAt: null,
  ...over,
});

const plan = (hr: HrPerson[], users: GradesUser[] = [], excluded: string[] = []) =>
  planRegistrySync({ hr, users, excluded, options: { today: TODAY } });
const active = (p: ReturnType<typeof plan>) => p.create.filter((c) => c.active);

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
    expect(active(p)).toEqual([]);
  });

  it('учётка в архиве — ушедший, даже если дата увольнения в будущем', () => {
    const p = plan([hrRow({ id: 'hr-2', email: 'arch@example.test', isArchive: 1, dismissedAt: '2026-12-01' })]);
    expect(p.create).toHaveLength(1);
    expect(p.create[0]).toMatchObject({ active: false, departed: true });
  });

  it('работающего в HR без карточки — «Заведём»: активным, роль, отдел и билд из HR (27.11.2026)', () => {
    const hr = [hrRow({ id: 'hr-3', email: 'new@example.test', department: 'Самолет', positionId: 20 })];
    const p = plan(hr);
    expect(p.create).toHaveLength(1);
    expect(p.create[0]).toMatchObject({
      hrId: 'hr-3',
      email: 'new@example.test',
      role: 'lead',
      department: 'Самолет',
      buildCode: null,
      departed: false,
      active: true,
    });
    const q = plan([hrRow({ id: 'hr-3b', email: 'new2@example.test', department: 'design.inhouse' })]);
    expect(q.create[0]).toMatchObject({ active: true, department: 'Инхаус', buildCode: 'creator', role: 'designer' });
  });

  it('увольнение в будущем — ещё работает: заводим активным', () => {
    const p = plan([hrRow({ id: 'hr-4', email: 'leaving@example.test', dismissedAt: '2026-10-15' })]);
    expect(p.create).toMatchObject([{ hrId: 'hr-4', active: true, departed: false }]);
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

    it('работающих граница не касается', () => {
      const p = plan([hrRow({ id: 'act', email: 'act@example.test', hiredAt: '2018-01-01' })]);
      expect(active(p).map((c) => c.hrId)).toEqual(['act']);
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

    it('активного, ушедшего по HR, деактивирует (27.11.2026); дату увольнения ставит деактивация, а не дозаполнение', () => {
      const hr = [hrRow({ id: 'hr-10', email: 'back@example.test', dismissedAt: '2025-05-05' })];
      const p = plan(hr, [user({ id: 3, email: 'back@example.test', fullName: 'Тест Тестов' })]);
      expect(p.update).toEqual([]);
      expect(p.conflicts).toEqual([]);
      expect(p.deactivate).toEqual([
        { userId: 3, hrId: 'hr-10', email: 'back@example.test', fullName: 'Тест Тестов', dismissedAt: '2025-05-05' },
      ]);
    });

    it('почасовщик, выведенный из штата HR, — не расхождение и не деактивация', () => {
      const hr = [hrRow({ id: 'hr-11', email: 'h@example.test', dismissedAt: '2025-05-05' })];
      const p = plan(hr, [user({ id: 4, email: 'h@example.test', employmentType: 'hourly' })]);
      expect(p.conflicts).toEqual([]);
      expect(p.deactivate).toEqual([]);
      expect(p.stats.keptHourly).toBe(1);
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
    );
    expect(p.create).toEqual([]);
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
    );
    expect(p.create).toEqual([]);
    expect(p.stats).toMatchObject({ skippedEngineer: 2, skippedLite: 1 });
  });

  it('совпавшему с Грейдами из Lite дат не дозаполняет и справок не даёт; ушёл из компании — деактивируем', () => {
    const p = plan(
      [hrRow({ id: 'lite-cur', email: 'lite.cur@example.test', department: 'Lite', dismissedAt: '2025-05-05' })],
      [user({ id: 1, email: 'lite.cur@example.test', hiredAt: null })],
    );
    expect(p.update).toEqual([]);
    expect(p.conflicts).toEqual([]);
    expect(p.stats.matched).toBe(0);
    // Уход — по любым учёткам с этим email, контур тут ни при чём
    expect(p.deactivate.map((d) => d.userId)).toEqual([1]);
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
    expect(p.create.map((x) => [x.hrId, x.active])).toEqual([['from-new', true]]);
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
  it('работающая в декрете — не заводим, пока в декрете', () => {
    const p = plan([
      hrRow({ id: 'mat', email: 'mat@example.test', firstNameRu: 'Декрет', maternityLeave: 1 }),
      hrRow({ id: 'mat-s', email: 'mat.s@example.test', firstNameRu: 'Декретстрока', maternityLeave: '1' }),
      hrRow({ id: 'work', email: 'work@example.test', firstNameRu: 'Работает', maternityLeave: 0 }),
    ]);
    // Порядок — по email: «mat.s@» раньше «mat@»
    expect(p.onMaternity.map((x) => x.hrId)).toEqual(['mat-s', 'mat']);
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

describe('правила 27.11.2026 — не дублировать', () => {
  it('дубль по email: без регистра и пробелов, среди неактивных — карточку не создаём', () => {
    const p = plan(
      [
        hrRow({ id: 'a', email: ' Anna.Primer@Example.test ', firstNameRu: 'Анна', lastNameRu: 'Пример' }),
        hrRow({ id: 'b', email: 'GONE@example.test', firstNameRu: 'Борис', lastNameRu: 'Пример', dismissedAt: '2025-06-01' }),
      ],
      [
        user({ id: 1, email: 'anna.primer@example.test', fullName: 'Аня' }),
        user({ id: 2, email: 'gone@example.test ', fullName: 'Боря', active: false, dismissedAt: '2025-06-01T00:00:00.000Z' }),
      ],
    );
    expect(p.create).toEqual([]);
    expect(p.stats.matched).toBe(2);
  });

  it('ExcludedEmail — не создаём ни работающего, ни ушедшего, без регистра', () => {
    const p = plan(
      [
        hrRow({ id: 'x', email: 'X@example.test', firstNameRu: 'Икс' }),
        hrRow({ id: 'y', email: 'y@example.test', firstNameRu: 'Игрек', dismissedAt: '2025-06-01' }),
      ],
      [],
      [' x@EXAMPLE.test', 'y@example.test'],
    );
    expect(p.create).toEqual([]);
    expect(p.skipExcluded.map((s) => s.hrId)).toEqual(['x', 'y']);
  });

  it('дубль по имени: ru, без регистра, ё = е, порядок слов — «Похоже, уже есть», не создаём', () => {
    const p = plan(
      [hrRow({ id: 'h', email: 'new.mail@example.test', firstNameRu: 'Алёна', lastNameRu: 'Образцова', hiredAt: '2024-05-06' })],
      [user({ id: 5, email: 'old.mail@example.test', fullName: 'ОБРАЗЦОВА алена', hiredAt: null })],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts).toEqual([{ kind: 'name_matches_user', hrId: 'h', email: 'new.mail@example.test', userId: 5 }]);
    // Однозначно и своей учётки HR по email у человека нет — пустую дату найма дозаполняем
    expect(p.update).toEqual([{ userId: 5, hrId: 'h', set: { hiredAt: '2024-05-06' }, byName: true }]);
  });

  it('дубль по латинскому имени (в Грейдах имя латиницей)', () => {
    const p = plan(
      [hrRow({ id: 'h', email: 'mark@example.test', firstNameRu: 'Марк', lastNameRu: 'Образец', firstName: 'Mark', lastName: 'Obrazets' })],
      [user({ id: 6, email: 'm.obrazets@example.test', fullName: 'Obrazets Mark' })],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts.map((c) => [c.kind, c.userId])).toEqual([['name_matches_user', 6]]);
    // Дата найма в Грейдах уже есть — не трогаем
    expect(p.update).toEqual([]);
  });

  it('латинские двойники в имени из Грейдов — тоже совпадение', () => {
    const p = plan(
      [hrRow({ id: 'h', email: 'h@example.test', firstNameRu: 'Анна', lastNameRu: 'Текстова' })],
      // «Aнна Тeкстовa» — латинские A, e, a
      [user({ id: 7, email: 'other@example.test', fullName: 'Aнна Тeкстовa' })],
    );
    expect(p.conflicts.map((c) => c.kind)).toEqual(['name_matches_user']);
  });

  it('неоднозначно: двое тёзок в Грейдах — только отчёт, дат не трогаем', () => {
    const p = plan(
      [hrRow({ id: 'h', email: 'h@example.test', firstNameRu: 'Иван', lastNameRu: 'Тёзкин' })],
      [
        user({ id: 8, email: 'ivan1@example.test', fullName: 'Иван Тезкин', hiredAt: null }),
        user({ id: 9, email: 'ivan2@example.test', fullName: 'Тёзкин Иван', hiredAt: null }),
      ],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts).toEqual([
      { kind: 'name_matches_user', hrId: 'h', email: 'h@example.test', userIds: [8, 9], ambiguous: true },
    ]);
    expect(p.update).toEqual([]);
  });

  it('неоднозначно: на одного человека претендуют две учётки HR — только отчёт', () => {
    const p = plan(
      [
        hrRow({ id: 'h1', email: 'h1@example.test', firstNameRu: 'Ольга', lastNameRu: 'Двойная', firstName: 'Olga', lastName: 'Dvoinaya' }),
        hrRow({ id: 'h2', email: 'h2@example.test', firstNameRu: 'Ольга', lastNameRu: 'Двойная', firstName: 'Olga', lastName: 'Dvoinaya', dismissedAt: '2025-03-01' }),
      ],
      [user({ id: 10, email: 'olga@example.test', fullName: 'Ольга Двойная', hiredAt: null })],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts.map((c) => [c.hrId, c.userId, c.ambiguous])).toEqual([
      ['h1', 10, true],
      ['h2', 10, true],
    ]);
    expect(p.update).toEqual([]);
  });

  it('однозначно, но у человека своя учётка HR по email — даты из неё, тёзку не трогаем', () => {
    const p = plan(
      [
        hrRow({ id: 'own', email: 'cur@example.test', firstNameRu: 'Пётр', lastNameRu: 'Свой', positionId: 4 }),
        hrRow({ id: 'twin', email: 'twin@example.test', firstNameRu: 'Пётр', lastNameRu: 'Свой', hiredAt: '2020-01-01' }),
      ],
      [user({ id: 11, email: 'cur@example.test', fullName: 'Петр Свой', hiredAt: null })],
    );
    expect(p.conflicts.map((c) => [c.kind, c.hrId, c.userId, c.ambiguous])).toEqual([
      ['name_matches_user', 'twin', 11, undefined],
    ]);
    expect(p.update).toEqual([]);
  });
});

describe('правила 27.11.2026 — не дублировать: фамилия и дата найма', () => {
  it('уменьшительное имя, другая почта, тот же найм — «Похоже, уже есть», карточку не создаём (неактивный в Грейдах)', () => {
    const p = plan(
      [
        hrRow({
          id: 'hr-vl',
          email: 'v.primerov@example.test',
          firstNameRu: 'Владимир',
          lastNameRu: 'Примеров',
          firstName: 'Vladimir',
          lastName: 'Primerov',
          department: 'Improve',
          hiredAt: '2026-10-08',
          dismissedAt: '2026-10-16',
        }),
      ],
      [
        user({
          id: 40,
          email: 'vl.primerov@example.test',
          fullName: 'Вова Примеров',
          active: false,
          hiredAt: '2026-10-08T00:00:00.000Z',
          dismissedAt: '2026-10-15T00:00:00.000Z',
        }),
      ],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts).toEqual([
      { kind: 'name_matches_user', hrId: 'hr-vl', email: 'v.primerov@example.test', userId: 40, bySurnameAndHire: true },
    ]);
    // Найм уже стоит — дозаполнять нечего
    expect(p.update).toEqual([]);
  });

  it('то же для активного в Грейдах; фамилия латиницей, «ё» = «е»', () => {
    const p = plan(
      [
        hrRow({ id: 'hr-a', email: 'alexander@example.test', firstNameRu: 'Александр', lastNameRu: 'Семёнов', hiredAt: '2024-02-01' }),
        hrRow({ id: 'hr-b', email: 'kate@example.test', firstNameRu: 'Екатерина', lastNameRu: 'Ершова', firstName: 'Ekaterina', lastName: 'Ershova', hiredAt: '2025-05-12' }),
      ],
      [
        user({ id: 41, email: 'sasha@example.test', fullName: 'Саша Семенов', hiredAt: '2024-02-01T00:00:00.000Z' }),
        user({ id: 42, email: 'katya@example.test', fullName: 'Katya Ershova', hiredAt: '2025-05-12T00:00:00.000Z' }),
      ],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts.map((c) => [c.hrId, c.userId, c.bySurnameAndHire])).toEqual([
      ['hr-a', 41, true],
      ['hr-b', 42, true],
    ]);
  });

  it('та же фамилия, другой найм, другое имя — не дубль: заводим', () => {
    const p = plan(
      [hrRow({ id: 'hr-p', email: 'petr.primerov@example.test', firstNameRu: 'Пётр', lastNameRu: 'Примеров', hiredAt: '2025-03-01', dismissedAt: '2025-09-01' })],
      [user({ id: 43, email: 'ivan.primerov@example.test', fullName: 'Иван Примеров', hiredAt: '2021-01-01T00:00:00.000Z' })],
    );
    expect(p.conflicts).toEqual([]);
    expect(p.create.map((c) => [c.hrId, c.active])).toEqual([['hr-p', false]]);
  });

  it('тот же найм, другая фамилия — не дубль', () => {
    const p = plan(
      [hrRow({ id: 'hr-q', email: 'q@example.test', firstNameRu: 'Вова', lastNameRu: 'Другов', hiredAt: '2026-10-08' })],
      [user({ id: 44, email: 'vova@example.test', fullName: 'Вова Примеров', hiredAt: '2026-10-08T00:00:00.000Z' })],
    );
    expect(p.conflicts).toEqual([]);
    expect(p.create.map((c) => c.hrId)).toEqual(['hr-q']);
  });

  it('фамилия и найм совпали у двоих в Грейдах — неоднозначно, только отчёт', () => {
    const p = plan(
      [hrRow({ id: 'hr-t', email: 't@example.test', firstNameRu: 'Тимофей', lastNameRu: 'Близнецов', hiredAt: '2024-09-02' })],
      [
        user({ id: 45, email: 'tim@example.test', fullName: 'Тима Близнецов', hiredAt: '2024-09-02T00:00:00.000Z' }),
        user({ id: 46, email: 'tolya@example.test', fullName: 'Толя Близнецов', hiredAt: '2024-09-02T00:00:00.000Z' }),
      ],
    );
    expect(p.create).toEqual([]);
    expect(p.conflicts).toEqual([
      { kind: 'name_matches_user', hrId: 'hr-t', email: 't@example.test', userIds: [45, 46], ambiguous: true, bySurnameAndHire: true },
    ]);
  });
});

describe('правила 27.11.2026 — ушедшие', () => {
  const working = (over: Partial<HrPerson> & { id: string; email: string }) => hrRow(over);
  const gone = (over: Partial<HrPerson> & { id: string; email: string }) =>
    hrRow({ dismissedAt: '2025-08-01', isArchive: 1, ...over });

  it('нет ни одной живой учётки — «Деактивируем», дата увольнения — самой поздней по найму', () => {
    const p = plan(
      [
        gone({ id: 'old', email: 'leaver@example.test', hiredAt: '2019-01-01', dismissedAt: '2020-01-01' }),
        gone({ id: 'last', email: 'LEAVER@example.test', hiredAt: '2021-01-01', dismissedAt: '2025-08-01' }),
      ],
      [user({ id: 20, email: 'leaver@example.test', fullName: 'Ушёл Тестов' })],
    );
    expect(p.deactivate).toEqual([
      { userId: 20, hrId: 'last', email: 'leaver@example.test', fullName: 'Ушёл Тестов', dismissedAt: '2025-08-01' },
    ]);
  });

  it('архивный дубль при живой записи — работает, не трогаем', () => {
    const p = plan(
      [
        gone({ id: 'arch', email: 'dup@example.test', hiredAt: '2019-01-01' }),
        working({ id: 'live', email: 'dup@example.test', hiredAt: '2025-09-01' }),
      ],
      [user({ id: 21, email: 'dup@example.test' })],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.manualCheck).toEqual([]);
  });

  it('живая учётка на другой позиции (перевёлся) — работает, не трогаем', () => {
    const p = plan(
      [gone({ id: 'design', email: 'moved@example.test' }), working({ id: 'pm', email: 'moved@example.test', positionId: 4 })],
      [user({ id: 22, email: 'moved@example.test' })],
    );
    expect(p.deactivate).toEqual([]);
  });

  it('увольнение в будущем — ещё работает', () => {
    const p = plan(
      [working({ id: 'soon', email: 'soon@example.test', dismissedAt: '2026-12-31' })],
      [user({ id: 23, email: 'soon@example.test' })],
    );
    expect(p.deactivate).toEqual([]);
  });

  it('админа не деактивируем — строка «Проверьте вручную»', () => {
    const p = plan(
      [gone({ id: 'adm', email: 'admin@example.test', positionId: 4 })],
      [user({ id: 24, email: 'admin@example.test', role: 'admin', fullName: 'Админ Тестов' })],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.manualCheck).toEqual([
      { userId: 24, hrId: 'adm', email: 'admin@example.test', fullName: 'Админ Тестов', reason: 'admin' },
    ]);
  });

  it('в декрете — не увольнение, не деактивируем', () => {
    const p = plan(
      [gone({ id: 'mat', email: 'mat@example.test', maternityLeave: 1 })],
      [user({ id: 25, email: 'mat@example.test' })],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.stats.keptOnLeave).toBe(1);
  });

  it('нет в HR — только число', () => {
    const p = plan([working({ id: 'w', email: 'w@example.test' })], [user({ id: 26, email: 'nohr@example.test' })]);
    expect(p.deactivate).toEqual([]);
    expect(p.stats.notInHr).toBe(1);
  });

  it('неактивного не трогаем и обратно не активируем', () => {
    const p = plan(
      [gone({ id: 'g', email: 'g@example.test' }), working({ id: 'w', email: 'w@example.test' })],
      [
        user({ id: 27, email: 'g@example.test', active: false, dismissedAt: '2025-08-01T00:00:00.000Z' }),
        user({ id: 28, email: 'w@example.test', active: false, dismissedAt: '2025-01-01T00:00:00.000Z' }),
      ],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.create).toEqual([]);
    expect(p.conflicts.map((c) => [c.kind, c.userId])).toEqual([['active_in_hr_inactive_in_grades', 28]]);
  });

  it('повторный прогон после деактивации — делать нечего', () => {
    const hr = [gone({ id: 'g', email: 'g@example.test' })];
    const first = plan(hr, [user({ id: 29, email: 'g@example.test' })]);
    expect(first.deactivate).toHaveLength(1);
    const second = plan(hr, [user({ id: 29, email: 'g@example.test', active: false, dismissedAt: '2025-08-01T00:00:00.000Z' })]);
    expect(second.deactivate).toEqual([]);
    expect(second.update).toEqual([]);
  });
});

describe('признак «ушёл» — архив, а не дата (27.11.2026)', () => {
  it('вернувшийся: не в архиве, старая дата увольнения, есть в Грейдах — «Проверьте вручную», не деактивируем', () => {
    const p = plan(
      [hrRow({ id: 'back', email: 'back@example.test', hiredAt: '2022-01-10', dismissedAt: '2025-03-01', isArchive: 0 })],
      // В Грейдах уже новая дата найма — после той даты увольнения
      [user({ id: 50, email: 'back@example.test', fullName: 'Вернулся Тестов', hiredAt: '2025-06-02T00:00:00.000Z' })],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.manualCheck).toEqual([
      { userId: 50, hrId: 'back', email: 'back@example.test', fullName: 'Вернулся Тестов', reason: 'returned' },
    ]);
    expect(p.update).toEqual([]);
  });

  it('вернувшийся, которого нет в Грейдах, — «Проверьте вручную», не заводим ни активным, ни неактивным', () => {
    const p = plan([
      hrRow({ id: 'back1', email: 'back1@example.test', firstNameRu: 'Первый', dismissedAt: '2025-08-01', isArchive: 0 }),
      // Дата до границы 2025 — всё равно не «ушли до 2025»: учётка не в архиве
      hrRow({ id: 'back2', email: 'back2@example.test', firstNameRu: 'Второй', dismissedAt: '2023-05-01', isArchive: '0' }),
    ]);
    expect(p.create).toEqual([]);
    expect(p.skipDepartedBefore).toEqual([]);
    expect(p.manualCheck.map((m) => [m.hrId, m.userId, m.reason])).toEqual([
      ['back1', undefined, 'returned'],
      ['back2', undefined, 'returned'],
    ]);
  });

  it('архивный с датой — деактивируем, как раньше', () => {
    const p = plan(
      [hrRow({ id: 'gone', email: 'gone@example.test', dismissedAt: '2025-03-01', isArchive: 1 })],
      [user({ id: 51, email: 'gone@example.test' })],
    );
    expect(p.deactivate.map((d) => [d.userId, d.hrId, d.dismissedAt])).toEqual([[51, 'gone', '2025-03-01']]);
    expect(p.manualCheck).toEqual([]);
  });

  it('две учётки: архивная и не в архиве с датой — «Проверьте вручную» по той, что не в архиве', () => {
    const p = plan(
      [
        hrRow({ id: 'arch', email: 'mix@example.test', hiredAt: '2019-01-01', dismissedAt: '2021-01-01', isArchive: 1 }),
        hrRow({ id: 'open', email: 'mix@example.test', hiredAt: '2022-01-01', dismissedAt: '2025-02-01', isArchive: 0 }),
      ],
      [user({ id: 52, email: 'mix@example.test' })],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.manualCheck.map((m) => [m.userId, m.hrId, m.reason])).toEqual([[52, 'open', 'returned']]);
  });

  it('архивные, которых нет в Грейдах, — как раньше: с границы неактивными, до неё и без даты — пропуск', () => {
    const p = plan([
      hrRow({ id: 'g25', email: 'g25@example.test', firstNameRu: 'Летняя', dismissedAt: '2025-07-01', isArchive: 1 }),
      hrRow({ id: 'g23', email: 'g23@example.test', firstNameRu: 'Давняя', dismissedAt: '2023-07-01', isArchive: 1 }),
      hrRow({ id: 'gnd', email: 'gnd@example.test', firstNameRu: 'Бездатная', isArchive: 1 }),
    ]);
    expect(p.create.map((c) => [c.hrId, c.active])).toEqual([['g25', false]]);
    expect(p.skipDepartedBefore.map((x) => x.hrId)).toEqual(['g23']);
    expect(p.skipDepartedUndated.map((x) => x.hrId)).toEqual(['gnd']);
    expect(p.manualCheck).toEqual([]);
  });

  it('админ, почасовщик и декрет — как раньше, даже если учётка не в архиве', () => {
    const open = (id: string, over: Partial<HrPerson> = {}) =>
      hrRow({ id, email: `${id}@example.test`, dismissedAt: '2025-03-01', isArchive: 0, positionId: 4, ...over });
    const p = plan(
      [open('adm'), open('hour'), open('mat', { maternityLeave: 1 })],
      [
        user({ id: 53, email: 'adm@example.test', role: 'admin' }),
        user({ id: 54, email: 'hour@example.test', employmentType: 'hourly' }),
        user({ id: 55, email: 'mat@example.test' }),
      ],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.manualCheck.map((m) => [m.userId, m.reason])).toEqual([[53, 'admin']]);
    expect(p.stats).toMatchObject({ keptHourly: 1, keptOnLeave: 1 });
  });

  it('увольнение в будущем и не в архиве — ещё работает, не «вернулся»', () => {
    const p = plan(
      [hrRow({ id: 'soon', email: 'soon@example.test', dismissedAt: '2026-12-31', isArchive: 0 })],
      [user({ id: 56, email: 'soon@example.test' })],
    );
    expect(p.deactivate).toEqual([]);
    expect(p.manualCheck).toEqual([]);
  });
});

describe('skipHrIds / skipUserIds — не трогать', () => {
  const opts = (skipHrIds: string[] = [], skipUserIds: number[] = []) => ({ today: TODAY, skipHrIds, skipUserIds });

  it('учётка HR: не заводим, не дозаполняем, не деактивируем по ней', () => {
    const hr = [
      hrRow({ id: 'new', email: 'new@example.test', firstNameRu: 'Новая' }),
      hrRow({ id: 'cur', email: 'cur@example.test', firstNameRu: 'Есть' }),
      hrRow({ id: 'gone', email: 'gone@example.test', firstNameRu: 'Ушла', dismissedAt: '2025-08-01', isArchive: 1 }),
    ];
    const users = [
      user({ id: 1, email: 'cur@example.test', fullName: 'Есть Тестов', hiredAt: null }),
      user({ id: 2, email: 'gone@example.test', fullName: 'Ушла Тестова' }),
    ];
    const all = planRegistrySync({ hr, users, excluded: [], options: opts() });
    expect([all.create.length, all.update.length, all.deactivate.length]).toEqual([1, 1, 1]);
    const p = planRegistrySync({ hr, users, excluded: [], options: opts(['NEW', 'cur', 'gone']) });
    expect([p.create, p.update, p.deactivate]).toEqual([[], [], []]);
    expect(p.skipped).toEqual({ hrIds: ['cur', 'gone', 'new'], userIds: [] });
    expect(p.skipErrors).toEqual({ hrIds: [], userIds: [] });
  });

  it('человек Грейдов: ни дат, ни деактивации', () => {
    const hr = [hrRow({ id: 'gone', email: 'gone@example.test', dismissedAt: '2025-08-01', isArchive: 1 })];
    const p = planRegistrySync({
      hr,
      users: [user({ id: 2, email: 'gone@example.test', hiredAt: null })],
      excluded: [],
      options: opts([], [2]),
    });
    expect(p.update).toEqual([]);
    expect(p.deactivate).toEqual([]);
    expect(p.skipped.userIds).toEqual([2]);
  });

  it('id, которого нет ни в HR, ни в Грейдах, — ошибка (скорее опечатка)', () => {
    const p = planRegistrySync({
      hr: [hrRow({ id: 'a', email: 'a@example.test' })],
      users: [user({ id: 1, email: 'b@example.test' })],
      excluded: [],
      options: opts(['a', 'nope'], [1, 404]),
    });
    expect(p.skipErrors).toEqual({ hrIds: ['nope'], userIds: [404] });
  });
});
