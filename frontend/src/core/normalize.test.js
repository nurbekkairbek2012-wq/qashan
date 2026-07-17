import { describe, it, expect } from 'vitest';
import { parseMoney, parseDate, parseTerm, normalizeExtract } from './normalize.js';

describe('parseMoney', () => {
  it('обычный пробел как разделитель разрядов', () => {
    expect(parseMoney('15 000 ₸')).toBe(15000);
    expect(parseMoney('1 200 000 ₸')).toBe(1200000);
  });

  it('КЛЮЧЕВОЕ: неразрывный пробел U+00A0 — именно его подставляют банки', () => {
    // \s его не ловит. От обычного пробела глазами не отличить, и тест на
    // "15 000" молча зелёный, пока не проверишь оба варианта.
    expect(parseMoney('15 000 ₸')).toBe(15000);
    expect(parseMoney('1 200 000')).toBe(1200000);
  });

  it('без пробелов и с разными обозначениями валюты', () => {
    expect(parseMoney('15000₸')).toBe(15000);
    expect(parseMoney('15000 тг')).toBe(15000);
    expect(parseMoney('15000 тенге')).toBe(15000);
    expect(parseMoney('15000')).toBe(15000);
  });

  it('сокращения', () => {
    expect(parseMoney('15к')).toBe(15000);
    expect(parseMoney('15k')).toBe(15000);
    expect(parseMoney('15 тыс')).toBe(15000);
    expect(parseMoney('15 тыс.')).toBe(15000);
    expect(parseMoney('1,5 млн')).toBe(1500000);
    expect(parseMoney('2 миллиона')).toBe(2000000);
  });

  it('склонения единиц вычищаются целиком, а не по префиксу', () => {
    // Чередование берёт первое совпадение, а не самое длинное: если «тыс»
    // стоит раньше «тысяч», от «тысяча» останется «яча» и разбор даст null
    expect(parseMoney('1 тысяча')).toBe(1000);
    expect(parseMoney('15 тысяч')).toBe(15000);
    expect(parseMoney('3 миллионов')).toBe(3000000);
  });

  it('дробная часть округляется до тенге', () => {
    expect(parseMoney('15000,4')).toBe(15000);
    expect(parseMoney('15000,6')).toBe(15001);
  });

  it('число проходит насквозь', () => {
    expect(parseMoney(15000)).toBe(15000);
  });

  it('мусор → null, а не 0', () => {
    // Ноль здесь был бы враньём: «не смогли прочитать» ≠ «бесплатно»
    expect(parseMoney('бесплатно')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney({})).toBeNull();
    expect(parseMoney('12-15')).toBeNull();
  });
});

describe('parseDate', () => {
  it('ISO проходит насквозь', () => {
    expect(parseDate('2026-08-10')).toBe('2026-08-10');
  });

  it('день первый — как принято в РК', () => {
    // 10.08 — это 10 августа, а не 8 октября
    expect(parseDate('10.08.2026')).toBe('2026-08-10');
    expect(parseDate('10/08/2026')).toBe('2026-08-10');
    expect(parseDate('10-08-2026')).toBe('2026-08-10');
  });

  it('двузначный год', () => {
    expect(parseDate('10.08.26')).toBe('2026-08-10');
  });

  it('словесный месяц', () => {
    expect(parseDate('10 августа 2026')).toBe('2026-08-10');
    expect(parseDate('1 января 2027')).toBe('2027-01-01');
    expect(parseDate('5 мая 2026')).toBe('2026-05-05');
  });

  it('несуществующая дата → null', () => {
    // Date.UTC молча превратил бы 31 февраля в 3 марта
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('32.01.2026')).toBeNull();
    expect(parseDate('10.13.2026')).toBeNull();
  });

  it('ВАЖНО: нет года → null, год не угадываем', () => {
    // Соблазн подставить текущий год велик, но это выдуманные данные:
    // ошибка на год сдвинет весь график платежей
    expect(parseDate('10 августа')).toBeNull();
    expect(parseDate('10.08')).toBeNull();
  });

  it('мусор → null', () => {
    expect(parseDate('завтра')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe('parseTerm', () => {
  it('вытаскивает число месяцев', () => {
    expect(parseTerm('12 мес')).toBe(12);
    expect(parseTerm('на 24 месяца')).toBe(24);
    expect(parseTerm('3')).toBe(3);
    expect(parseTerm(12)).toBe(12);
  });

  it('отсекает бессмыслицу', () => {
    expect(parseTerm('0 мес')).toBeNull();
    expect(parseTerm('99 мес')).toBeNull(); // рассрочек на 8 лет не бывает
    expect(parseTerm('мес')).toBeNull();
    expect(parseTerm(12.5)).toBeNull();
  });
});

describe('normalizeExtract', () => {
  it('сырой ответ модели → структура нашей схемы', () => {
    const result = normalizeExtract({
      merchant: '  Kaspi  ',
      item_name: 'iPhone 15',
      price_installment: '460 000 ₸',
      price_cash: null,
      down_payment: '0',
      term_months: '12 мес',
      monthly_payment: '38 333 ₸',
      first_due_date: '10.08.2026',
    });

    expect(result).toEqual({
      merchant: 'Kaspi',
      itemName: 'iPhone 15',
      priceInstallment: 460000,
      priceCash: null,
      downPayment: 0,
      termMonths: 12,
      monthlyPayment: 38333,
      firstDueDate: '2026-08-10',
    });
  });

  it('нераспознанные поля остаются null — форма попросит дозаполнить', () => {
    const result = normalizeExtract({
      merchant: '技',
      price_installment: 'не видно',
      first_due_date: 'скоро',
    });

    expect(result.priceInstallment).toBeNull();
    expect(result.firstDueDate).toBeNull();
    expect(result.termMonths).toBeNull();
  });

  it('не падает на мусоре вместо объекта', () => {
    expect(normalizeExtract(null).priceInstallment).toBeNull();
    expect(normalizeExtract('строка').termMonths).toBeNull();
    expect(normalizeExtract(undefined).downPayment).toBe(0);
  });
});
