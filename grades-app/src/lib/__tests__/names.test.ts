import { describe, it, expect } from 'vitest';
import { firstName, genitiveFirstName } from '../names';

describe('firstName', () => {
  it('берёт первое слово из ФИО', () => {
    expect(firstName('Никита Хахай')).toBe('Никита');
    expect(firstName('Полина Филькова')).toBe('Полина');
  });
});

describe('genitiveFirstName', () => {
  // Ровно те подписи, которые просил Pavel для селектора команд.
  it('даёт формы из запроса Pavel', () => {
    expect(genitiveFirstName('Никита Хахай')).toBe('Никиты');
    expect(genitiveFirstName('Саша Лучшев')).toBe('Саши');
    expect(genitiveFirstName('Артуш Манукян')).toBe('Артуша');
    expect(genitiveFirstName('Полина Филькова')).toBe('Полины');
    expect(genitiveFirstName('Эля Гильмуллина')).toBe('Эли');
  });

  it('«-а» после шипящих и заднеязычных даёт «-и», иначе «-ы»', () => {
    expect(genitiveFirstName('Маша')).toBe('Маши');
    expect(genitiveFirstName('Даша')).toBe('Даши');
    expect(genitiveFirstName('Лера')).toBe('Леры');
    expect(genitiveFirstName('Рита')).toBe('Риты');
    expect(genitiveFirstName('Регина')).toBe('Регины');
  });

  it('«-я» даёт «-и»', () => {
    expect(genitiveFirstName('Юля')).toBe('Юли');
    expect(genitiveFirstName('Женя')).toBe('Жени');
    expect(genitiveFirstName('Соня')).toBe('Сони');
    expect(genitiveFirstName('Катя')).toBe('Кати');
  });

  it('согласная на конце — добавляем «-а»', () => {
    expect(genitiveFirstName('Денис Куликов')).toBe('Дениса');
    expect(genitiveFirstName('Антон')).toBe('Антона');
    expect(genitiveFirstName('Егор')).toBe('Егора');
  });

  it('«-й» и «-ь» дают «-я»', () => {
    expect(genitiveFirstName('Андрей Назаров')).toBe('Андрея');
    expect(genitiveFirstName('Арсений Шуенков')).toBe('Арсения');
    expect(genitiveFirstName('Игорь')).toBe('Игоря');
  });

  it('имена на прочие гласные не склоняем', () => {
    expect(genitiveFirstName('Отто')).toBe('Отто');
    expect(genitiveFirstName('Мери')).toBe('Мери');
  });

  it('не падает на пустом и односимвольном', () => {
    expect(genitiveFirstName('')).toBe('');
    expect(genitiveFirstName('Я')).toBe('Я');
  });
});
