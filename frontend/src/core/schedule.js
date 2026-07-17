/**
 * Построение графика платежей по рассрочке.
 *
 * Суммы — в целых тенге. Копеек в рассрочках нет, а целые числа избавляют
 * от накопления ошибки округления float на длинном графике.
 */

import { addMonthsAnchored, fromISODate, toISODate } from './dates.js';

/**
 * @typedef {Object} Installment
 * @property {string} firstDueDate  дата первого платежа, 'YYYY-MM-DD'
 * @property {number} termMonths    срок в месяцах
 * @property {number} priceInstallment  цена товара в рассрочку, ₸
 * @property {number} [downPayment] первоначальный взнос, ₸ (по умолчанию 0)
 * @property {number} [monthlyPayment] платёж в месяц, ₸. Если не задан — выводим сами
 */

/**
 * @typedef {Object} Payment
 * @property {number} seq       номер платежа, 1..termMonths
 * @property {string} dueDate   'YYYY-MM-DD'
 * @property {number} amount    сумма платежа, ₸
 */

/**
 * Разворачивает рассрочку в помесячный график.
 *
 * Тонкость с последним платежом: если сумма к выплате не делится на срок нацело,
 * банк не растягивает копейки по всем месяцам — он добирает остаток последним
 * платежом. Мы делаем так же, поэтому сумма графика ВСЕГДА в точности равна
 * сумме к выплате. Это инвариант, он проверяется тестом.
 *
 * @param {Installment} installment
 * @returns {Payment[]}
 */
export function buildSchedule(installment) {
  const {
    firstDueDate,
    termMonths,
    priceInstallment,
    downPayment = 0,
    monthlyPayment,
  } = installment;

  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error(`termMonths должен быть целым ≥ 1, получено: ${termMonths}`);
  }

  const totalToPay = priceInstallment - downPayment;
  if (totalToPay < 0) {
    throw new Error('Первоначальный взнос больше цены товара');
  }

  // Если платёж не задан — выводим из суммы и срока
  const regular =
    monthlyPayment != null ? Math.round(monthlyPayment) : Math.round(totalToPay / termMonths);

  const anchor = fromISODate(firstDueDate);
  const payments = [];

  for (let seq = 1; seq <= termMonths; seq += 1) {
    // Последний платёж добирает остаток — так график сходится копейка в копейку
    const amount = seq < termMonths ? regular : totalToPay - regular * (termMonths - 1);

    payments.push({
      seq,
      dueDate: toISODate(addMonthsAnchored(anchor, seq - 1)),
      amount,
    });
  }

  return payments;
}

/** Сумма всех платежей графика. */
export function scheduleTotal(payments) {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Проверка инварианта: платёж × срок ≈ сумма к выплате.
 *
 * Нужна для данных, распознанных с экрана: модель могла ошибиться в цифре.
 * Расхождение НЕ проглатываем молча — возвращаем его наверх, чтобы спросить
 * пользователя. Это деньги, тихая ошибка здесь недопустима.
 *
 * @param {Installment} installment
 * @param {number} [toleranceRatio] допустимое расхождение, доля от суммы
 * @returns {{ ok: boolean, expected: number, actual: number, diff: number }}
 */
export function validateInstallment(installment, toleranceRatio = 0.02) {
  const { termMonths, priceInstallment, downPayment = 0, monthlyPayment } = installment;

  const expected = priceInstallment - downPayment;
  const actual = (monthlyPayment ?? 0) * termMonths;
  const diff = actual - expected;

  // Последний платёж законно отличается от остальных на остаток округления,
  // поэтому небольшое расхождение — норма, а не ошибка.
  const allowed = Math.max(Math.abs(expected) * toleranceRatio, termMonths);

  return { ok: Math.abs(diff) <= allowed, expected, actual, diff };
}
