/**
 * Сводка по всем рассрочкам сразу.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. simulate.js отвечает на вопрос «когда» — он режет
 * данные по месяцам. Здесь другой срез: «сколько всего» и «кто именно из трёх».
 * Это ровно та совокупная картина, которой нет ни в одном банковском приложении,
 * потому что каждое видит только свою рассрочку.
 */

import { buildSchedule } from './schedule.js';
import { effectiveRate } from './irr.js';

/**
 * Платежи по месяцам В РАЗБИВКЕ по рассрочкам — данные для составного графика.
 *
 * Почему разбивка, а не общая сумма: общая сумма уже есть на графике остатка.
 * Новая информация здесь — ВКЛАД каждой рассрочки. Человек видит не «65 000 в
 * ноябре», а «из них 30 000 — тот самый диван», и понимает, что именно его топит.
 *
 * @param {Array} installments
 * @param {string[]} monthKeys ключи 'YYYY-MM' в порядке отображения
 * @returns {Array<{key: string, total: number, segments: Array<{id: string, amount: number}>}>}
 */
export function stackByMonth(installments, monthKeys) {
  // Индекс «месяц → id рассрочки → сумма». Строим один раз за проход по
  // графикам, а не ищем платежи заново для каждого месяца.
  const index = new Map();

  for (const installment of installments) {
    const schedule = installment.payments ?? buildSchedule(installment);

    for (const payment of schedule) {
      if (payment.isPaid) continue;

      const key = payment.dueDate.slice(0, 7);
      if (!index.has(key)) index.set(key, new Map());

      const row = index.get(key);
      row.set(installment.id, (row.get(installment.id) ?? 0) + payment.amount);
    }
  }

  return monthKeys.map((key) => {
    const row = index.get(key);

    // Порядок сегментов ВСЕГДА как в списке рассрочек, а не по величине.
    // Иначе цвет поедет: сортировка по сумме перекрашивала бы одну и ту же
    // рассрочку из месяца в месяц, и глазу не за что было бы зацепиться.
    const segments = installments
      .map((installment) => ({ id: installment.id, amount: row?.get(installment.id) ?? 0 }))
      .filter((segment) => segment.amount > 0);

    return {
      key,
      total: segments.reduce((sum, segment) => sum + segment.amount, 0),
      segments,
    };
  });
}

/**
 * @typedef {Object} PortfolioSummary
 * @property {number} totalRemaining   сколько ещё отдавать всего, ₸
 * @property {number} incomeMonths     во скольких месяцах дохода это выражается
 * @property {string|null} lastPaymentMonth  'YYYY-MM' последнего платежа
 * @property {number} knownOverpay     доказанная переплата, ₸
 * @property {number} unknownCashPrice  у скольких рассрочек нет цены за наличные
 * @property {number} count
 */

/**
 * Сводка по портфелю рассрочек.
 *
 * ГЛАВНАЯ ЦИФРА — incomeMonths: остаток долга, выраженный в месяцах дохода.
 * «287 000 ₸» абстрактно, «4,8 месяца твоего дохода целиком» — нет. Это тот же
 * факт в единицах, которыми человек живёт.
 *
 * ПЕРЕПЛАТА СЧИТАЕТСЯ НЕ ВЕЗДЕ. Только там, где известна цена за наличные —
 * без неё наценки не видно, и приписывать её нельзя. Поэтому возвращаем ещё и
 * unknownCashPrice: интерфейс обязан сказать, что цифра посчитана НЕ по всем
 * рассрочкам, иначе она читается как полная и врёт занижением.
 *
 * @param {Array} installments
 * @param {{monthlyIncome: number}} profile
 * @returns {PortfolioSummary}
 */
export function portfolioSummary(installments, profile) {
  let totalRemaining = 0;
  let lastPaymentMonth = null;
  let knownOverpay = 0;
  let unknownCashPrice = 0;

  for (const installment of installments) {
    const schedule = installment.payments ?? buildSchedule(installment);

    for (const payment of schedule) {
      if (payment.isPaid) continue;

      totalRemaining += payment.amount;

      const key = payment.dueDate.slice(0, 7);
      // Строки 'YYYY-MM' сравниваются лексикографически в том же порядке, что
      // и даты — нули в месяце это гарантируют. Парсить не нужно.
      if (lastPaymentMonth === null || key > lastPaymentMonth) lastPaymentMonth = key;
    }

    const rate = effectiveRate(installment);
    if (rate.ok) {
      knownOverpay += rate.overpay;
    } else {
      unknownCashPrice += 1;
    }
  }

  const income = profile.monthlyIncome;

  return {
    totalRemaining,
    incomeMonths: income > 0 ? totalRemaining / income : Infinity,
    lastPaymentMonth,
    knownOverpay,
    unknownCashPrice,
    count: installments.length,
  };
}
