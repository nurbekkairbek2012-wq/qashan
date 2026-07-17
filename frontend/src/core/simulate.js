/**
 * Помесячная симуляция денежного потока.
 *
 * Главный ответ продукта: в каком месяце платежи по рассрочкам съедят доход.
 * Банк показывает, СКОЛЬКО ты должен. Здесь считается, КОГДА ты не потянешь.
 */

import { addMonthsAnchored, monthKey } from './dates.js';
import { buildSchedule } from './schedule.js';

/** Пороги долговой нагрузки: доля дохода, уходящая на платежи. */
export const BURDEN_THRESHOLDS = { safe: 0.3, warn: 0.5 };

/**
 * Уровень нагрузки за месяц.
 * Эти же три уровня — цветовая шкала интерфейса (зелёный/жёлтый/красный).
 *
 * @param {number} ratio доля дохода на платежи
 * @returns {'safe'|'warn'|'danger'}
 */
export function burdenLevel(ratio) {
  if (ratio < BURDEN_THRESHOLDS.safe) return 'safe';
  if (ratio <= BURDEN_THRESHOLDS.warn) return 'warn';
  return 'danger';
}

/**
 * Складывает платежи всех рассрочек по месяцам: 'YYYY-MM' → сумма ₸.
 * Уже оплаченные не учитываем — они в прошлом и на будущий баланс не влияют.
 */
function groupPaymentsByMonth(installments) {
  const byMonth = new Map();

  for (const installment of installments) {
    const schedule = installment.payments ?? buildSchedule(installment);

    for (const payment of schedule) {
      if (payment.isPaid) continue;

      const key = payment.dueDate.slice(0, 7); // 'YYYY-MM-DD' → 'YYYY-MM'
      byMonth.set(key, (byMonth.get(key) ?? 0) + payment.amount);
    }
  }

  return byMonth;
}

/**
 * @typedef {Object} MonthState
 * @property {string} key      'YYYY-MM'
 * @property {number} due      платежи месяца, ₸
 * @property {number} income   доход месяца, ₸
 * @property {number} net      доход минус платежи, ₸
 * @property {number} balance  накопленный баланс на конец месяца, ₸
 * @property {number} burden   доля дохода на платежи
 * @property {'safe'|'warn'|'danger'} level
 */

/**
 * Симулирует баланс на horizonMonths вперёд.
 *
 *   balance[m] = balance[m−1] + доход − платежи месяца m
 *
 * Модель осознанно простая: постоянный доход, никаких прочих расходов.
 * Это НЕ бюджет-трекер — вопрос узкий: хватает ли дохода на платежи.
 * Добавлять сюда «расходы на еду» значит расползтись в приложение для всего
 * и потерять правило «один пользователь — одна боль».
 *
 * Следствие, которое важно проговорить на защите: реальный момент нехватки
 * денег наступает РАНЬШЕ нашего прогноза, потому что человек ещё и ест.
 * Мы даём оптимистичную границу, и это честнее, чем выдумывать структуру трат.
 *
 * @param {{monthlyIncome: number}} profile
 * @param {Array} installments
 * @param {{horizonMonths?: number, startDate?: Date, startBalance?: number}} [options]
 * @returns {{months: MonthState[], firstNegativeMonth: string|null, peakBurden: number}}
 */
export function simulateCashFlow(profile, installments, options = {}) {
  const { horizonMonths = 12, startDate = new Date(), startBalance = 0 } = options;
  const income = profile.monthlyIncome;

  const byMonth = groupPaymentsByMonth(installments);

  // Идём от первого числа текущего месяца
  const firstOfMonth = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
  );

  const months = [];
  let balance = startBalance;
  let firstNegativeMonth = null;
  let peakBurden = 0;

  for (let i = 0; i < horizonMonths; i += 1) {
    const key = monthKey(addMonthsAnchored(firstOfMonth, i));
    const due = byMonth.get(key) ?? 0;
    const net = income - due;

    balance += net;

    // Нулевой доход — деление на ноль. Если платежи есть, нагрузка бесконечна,
    // если платежей нет — она нулевая.
    const burden = income > 0 ? due / income : due > 0 ? Infinity : 0;

    if (Number.isFinite(burden) && burden > peakBurden) peakBurden = burden;
    if (balance < 0 && firstNegativeMonth === null) firstNegativeMonth = key;

    months.push({ key, due, income, net, balance, burden, level: burdenLevel(burden) });
  }

  return { months, firstNegativeMonth, peakBurden };
}

/**
 * Сценарий «а что если взять ещё одну рассрочку».
 *
 * Ключевая фича продукта: ответ ДО покупки, а не разбор после. Считаем ту же
 * симуляцию дважды — без черновой рассрочки и с ней — и возвращаем разницу.
 *
 * @param {{monthlyIncome: number}} profile
 * @param {Array} installments существующие рассрочки
 * @param {Object} draft черновая рассрочка (в базу не попадает)
 * @param {Object} [options] те же, что у simulateCashFlow
 * @returns {{before: Object, after: Object, monthsLost: number|null}}
 */
export function simulateWithDraft(profile, installments, draft, options = {}) {
  const before = simulateCashFlow(profile, installments, options);
  const after = simulateCashFlow(profile, [...installments, draft], options);

  return {
    before,
    after,
    // На сколько месяцев приблизился уход в минус. null — если минус
    // не наступает ни в одном из сценариев (либо наступал и до черновика).
    monthsLost: monthsBetween(before.firstNegativeMonth, after.firstNegativeMonth),
  };
}

/**
 * Разница в месяцах между двумя ключами 'YYYY-MM'.
 * Положительное число = во втором сценарии минус наступает раньше.
 */
function monthsBetween(beforeKey, afterKey) {
  if (afterKey === null) return null; // минуса нет и с черновиком — всё хорошо
  if (beforeKey === null) return Infinity; // минуса не было, а стал — качественный скачок

  const [by, bm] = beforeKey.split('-').map(Number);
  const [ay, am] = afterKey.split('-').map(Number);

  return (by * 12 + bm) - (ay * 12 + am);
}
