import { describe, it, expect } from 'vitest';
import {
  DRAG_THRESHOLD,
  absFrom,
  attrSelector,
  classifyGesture,
  commentHash,
  commentPath,
  containsRect,
  initials,
  intersectRects,
  isPopupAnchor,
  isStableId,
  missingLabel,
  normalizeRect,
  nthPath,
  pageLabel,
  parseCommentHash,
  placeCaption,
  plural,
  pointInRect,
  popupLabel,
  rectFromAbs,
  rectFromRel,
  relWithin,
  relativeTime,
  threadHint,
  trimSnippet,
  type CommentAnchor,
} from '../commentAnchor';

describe('жест: точка или рамка', () => {
  it('сдвиг меньше порога — точка, от порога — рамка', () => {
    expect(classifyGesture({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe('point');
    expect(classifyGesture({ x: 10, y: 10 }, { x: 13, y: 7 })).toBe('point');
    expect(classifyGesture({ x: 10, y: 10 }, { x: 10 + DRAG_THRESHOLD, y: 10 })).toBe('rect');
    expect(classifyGesture({ x: 10, y: 10 }, { x: 10, y: 4 })).toBe('rect');
  });

  it('рамку можно тянуть в любую сторону', () => {
    expect(normalizeRect({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({
      left: 10,
      top: 20,
      width: 40,
      height: 60,
    });
  });
});

describe('геометрия якоря', () => {
  const box = { left: 100, top: 200, width: 400, height: 100 };

  it('точка — доли внутри бокса, без w/h', () => {
    expect(relWithin(box, { left: 200, top: 250, width: 0, height: 0 })).toEqual({ x: 0.25, y: 0.5 });
  });

  it('рамка — с долями ширины и высоты', () => {
    expect(relWithin(box, { left: 100, top: 200, width: 200, height: 25 })).toEqual({
      x: 0,
      y: 0,
      w: 0.5,
      h: 0.25,
    });
  });

  it('вылезшее за бокс прижимается к краю, дроби — до 4 знаков', () => {
    const r = relWithin(box, { left: 99.6, top: 333.3333, width: 0, height: 0 });
    expect(r).toEqual({ x: 0, y: 1 });
    expect(relWithin(box, { left: 233.33333, top: 200, width: 0, height: 0 }).x).toBe(0.3333);
  });

  it('туда и обратно — то же место, и при другом размере бокса масштабируется', () => {
    const target = { left: 180, top: 230, width: 120, height: 40 };
    const rel = relWithin(box, target);
    expect(rectFromRel(box, rel)).toEqual(target);
    const wider = { left: 0, top: 0, width: 800, height: 100 };
    expect(rectFromRel(wider, rel)).toEqual({ left: 160, top: 30, width: 240, height: 40 });
  });

  it('abs: x от левого края main, y от верха документа — и обратно', () => {
    const target = { left: 420.4, top: 120, width: 0, height: 0 };
    const abs = absFrom(target, 100, 900);
    expect(abs).toEqual({ x: 320, y: 1020 });
    // Окно шире — main сдвинулся вправо, страница прокручена иначе
    expect(rectFromAbs(abs, 300, 1000)).toEqual({ left: 620, top: 20, width: 0, height: 0 });
  });

  it('abs у рамки — с размерами', () => {
    expect(absFrom({ left: 10, top: 10, width: 50.6, height: 20.2 }, 0, 0)).toEqual({
      x: 10,
      y: 10,
      w: 51,
      h: 20,
    });
  });

  it('пересечение, попадание точки, вложенность', () => {
    const a = { left: 0, top: 0, width: 100, height: 100 };
    expect(intersectRects(a, { left: 50, top: 80, width: 100, height: 100 })).toEqual({
      left: 50,
      top: 80,
      width: 50,
      height: 20,
    });
    expect(intersectRects(a, { left: 200, top: 0, width: 10, height: 10 })).toBeNull();
    expect(pointInRect({ x: 100, y: 0 }, a)).toBe(true);
    expect(pointInRect({ x: 101, y: 0 }, a)).toBe(false);
    expect(containsRect(a, { left: -0.5, top: 10, width: 100.4, height: 10 })).toBe(true);
    expect(containsRect(a, { left: -5, top: 10, width: 10, height: 10 })).toBe(false);
  });
});

describe('селекторы', () => {
  it('стабильные id: без «:» (useId), служебных и странных', () => {
    expect(isStableId('ipr')).toBe(true);
    expect(isStableId('performance-block')).toBe(true);
    expect(isStableId(':r3:')).toBe(false);
    expect(isStableId('__next')).toBe(false);
    expect(isStableId('1st')).toBe(false);
    expect(isStableId('')).toBe(false);
    expect(isStableId(null)).toBe(false);
  });

  it('значение атрибута экранируется', () => {
    expect(attrSelector('data-comment-anchor', 'team-bento')).toBe('[data-comment-anchor="team-bento"]');
    expect(attrSelector('data-x', 'a"b\\c')).toBe('[data-x="a\\"b\\\\c"]');
  });

  it('путь nth-of-type', () => {
    expect(
      nthPath([
        { tag: 'DIV', index: 2 },
        { tag: 'section', index: 1 },
      ]),
    ).toBe('div:nth-of-type(2) > section:nth-of-type(1)');
    expect(nthPath([])).toBe('');
  });

  it('snippet: пробелы схлопнуты, длинный обрезан с многоточием', () => {
    expect(trimSnippet('  Команда \n\n Лид   Иван ')).toBe('Команда Лид Иван');
    expect(trimSnippet('   ')).toBeUndefined();
    expect(trimSnippet(null)).toBeUndefined();
    const long = trimSnippet('а'.repeat(300));
    expect(long).toHaveLength(120);
    expect(long!.endsWith('…')).toBe(true);
  });
});

describe('ссылка и путь', () => {
  it('hash треда туда и обратно', () => {
    expect(commentHash(12)).toBe('#comment-12');
    expect(parseCommentHash('#comment-12')).toBe(12);
    expect(parseCommentHash('#ipr')).toBeNull();
    expect(parseCommentHash('#comment-12x')).toBeNull();
    expect(parseCommentHash('')).toBeNull();
  });

  it('путь страницы — pathname + search, без пустого «?»', () => {
    expect(commentPath('/admin/users', '')).toBe('/admin/users');
    expect(commentPath('/lead/portrait', 'userId=5')).toBe('/lead/portrait?userId=5');
    expect(commentPath('/lead/portrait', '?userId=5')).toBe('/lead/portrait?userId=5');
    expect(commentPath('/admin/users', null)).toBe('/admin/users');
  });

  it('подпись страницы по пути', () => {
    expect(pageLabel('/admin/users')).toBe('Команда');
    expect(pageLabel('/lead/portrait?userId=5')).toBe('Портрет');
    expect(pageLabel('/lead/assessments')).toBe('Оценки');
    expect(pageLabel('/lead/assess?userId=5')).toBe('Оценка');
    expect(pageLabel('/admin/lead-reviews/12')).toBe('Портрет лида');
    expect(pageLabel('/admin/lead-reviews/new')).toBe('Загрузка 360-опроса');
    expect(pageLabel('/admin/userslist')).toBe('/admin/userslist');
  });
});

describe('поп-апы', () => {
  const at = (selector?: string, label?: string): CommentAnchor => ({
    kind: 'point',
    abs: { x: 1, y: 2 },
    viewportW: 1440,
    ...(selector ? { selector } : {}),
    ...(label ? { context: { label } } : {}),
  });

  it('подпись поп-апа — по заголовку, в пределе длины', () => {
    expect(popupLabel('  Саша\n Тимкина ')).toBe('Поп-ап: Саша Тимкина');
    expect(popupLabel('')).toBeUndefined();
    expect(popupLabel(null)).toBeUndefined();
    expect(popupLabel('я'.repeat(300))!.length).toBeLessThanOrEqual(120);
  });

  it('место в поп-апе — по подписи или по опоре поп-апа', () => {
    expect(isPopupAnchor(at('[data-comment-anchor="popup-360"]'))).toBe(true);
    expect(isPopupAnchor(at('[data-comment-anchor="popup-360-salary"] > div:nth-of-type(2)'))).toBe(true);
    expect(isPopupAnchor(at('[data-comment-anchor="user-modal"]'))).toBe(true);
    expect(isPopupAnchor(at('[role="dialog"] > div:nth-of-type(1)'))).toBe(true);
    expect(isPopupAnchor(at(undefined, 'Поп-ап: Зарплата'))).toBe(true);
    expect(isPopupAnchor(at('[data-comment-anchor="team-bento"]'))).toBe(false);
    expect(isPopupAnchor(at('[data-comment-anchor="user-modal-x"]'))).toBe(false);
    expect(isPopupAnchor(at())).toBe(false);
    expect(isPopupAnchor(null)).toBe(false);
  });

  it('подпись треда из другого места страницы', () => {
    const label = 'Поп-ап: Саша Тимкина';
    expect(placeCaption({ path: '/admin/users?person=5', anchor: at('[data-comment-anchor="popup-360"]', label) })).toBe(
      'В поп-апе: Саша Тимкина',
    );
    expect(placeCaption({ path: '/admin/users?person=5', anchor: at('[data-comment-anchor="popup-360"]') })).toBe('В поп-апе');
    expect(placeCaption({ path: '/admin/users?person=5', anchor: at(undefined, 'Карточка') })).toBe('Карточка');
    expect(placeCaption({ path: '/admin/users', anchor: at('[data-comment-anchor="team-bento"]') })).toBe('На странице');
  });

  it('что сказать, если метки не видно', () => {
    const popup = at('[data-comment-anchor="popup-360"]', 'Поп-ап: Саша Тимкина');
    const page = at('[data-comment-anchor="team-bento"]');
    // Метка на экране — пояснять нечего
    expect(threadHint({ here: true, missing: false, path: '/admin/users', anchor: page })).toBeNull();
    // Поп-ап другого человека или закрыт
    expect(threadHint({ here: false, missing: false, path: '/admin/users?person=5', anchor: popup })).toBe(
      'В поп-апе: Саша Тимкина. Откройте его, чтобы увидеть метку.',
    );
    // Тред самой страницы, а открыт поп-ап
    expect(threadHint({ here: false, missing: false, path: '/admin/users', anchor: page })).toMatch(/Закройте поп-ап/);
    // Старый тред из поп-апа без человека в пути (до 0.75.2)
    const legacy = at('[data-comment-anchor="popup-360"]');
    expect(threadHint({ here: true, missing: true, path: '/admin/users', anchor: legacy })).toBe(
      'Откройте поп-ап, чтобы увидеть место.',
    );
    expect(missingLabel(legacy)).toBe('Откройте поп-ап, чтобы увидеть место');
    expect(threadHint({ here: true, missing: true, path: '/admin/users', anchor: page })).toMatch(/^Место не найдено/);
    expect(missingLabel(page)).toBe('Место не найдено');
  });
});

describe('подписи', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;

  it('относительная дата', () => {
    expect(relativeTime(ago(20_000), now)).toBe('только что');
    expect(relativeTime(ago(5 * MIN), now)).toBe('5 мин назад');
    expect(relativeTime(ago(2 * H + 5 * MIN), now)).toBe('2 ч назад');
    expect(relativeTime(ago(30 * H), now)).toBe('вчера');
    expect(relativeTime(ago(3 * D), now)).toBe('3 дня назад');
    expect(relativeTime(ago(5 * D), now)).toBe('5 дней назад');
    // Старше недели — дата; другой год — с годом и без «г.»
    expect(relativeTime('2026-09-18T12:00:00Z', now)).toMatch(/^18 сент/);
    expect(relativeTime('2025-09-18T12:00:00Z', now)).toMatch(/^18 сент.* 2025$/);
    // Часы чуть впереди сервера — не «через», а «только что»
    expect(relativeTime(new Date(now.getTime() + 30_000).toISOString(), now)).toBe('только что');
    expect(relativeTime('не дата', now)).toBe('');
  });

  it('склонение и инициалы', () => {
    expect(plural(1, ['ответ', 'ответа', 'ответов'])).toBe('ответ');
    expect(plural(3, ['ответ', 'ответа', 'ответов'])).toBe('ответа');
    expect(plural(11, ['ответ', 'ответа', 'ответов'])).toBe('ответов');
    expect(plural(21, ['ответ', 'ответа', 'ответов'])).toBe('ответ');
    expect(initials('Мира Соколова')).toBe('МС');
    expect(initials('  Кирилл  ')).toBe('К');
  });
});
