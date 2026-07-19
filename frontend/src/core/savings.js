/**
 * Альтернатива рассрочке: копить и купить позже.
 *
 * ЗАЧЕМ. Остальной продукт ставит диагноз: «в ноябре платежи перевесят доход».
 * Диагноз без выхода бесполезен — человек всё равно возьмёт рассрочку, потому
 * что другого пути ему не показали. Здесь считается второй путь: откладывать тот
 * же платёж и купить за наличные через N месяцев.
 *
 * ЧТО ЭТО НЕ ЕСТЬ. Не нравоучение «копить полезно». Это арифметика с честной
 * ценой: за экономию платят ожиданием, и срок ожидания мы называем прямо, а не
 * прячем за советом. Решает человек, наше дело — показать обе стороны.
 *
 * ГРАНИЦА МОДЕЛИ. Мы НЕ учитываем инфляцию и рост цены товара за время
 * накопления, и НЕ начисляем процент на депозит. Оба эффекта существуют, но
 * оценить их можно только допущениями, а допущение, подставленное вместо данных,
 * — это подгонка. Пропуск обоих смещает результат в РАЗНЫЕ стороны и работает
 * против нашего же вывода: инфляция делает ожидание дороже. Значит, экономия,
 * которую мы показываем, — верхняя граница, и об этом сказано в интерфейсе.
 */

import { addMonthsAnchored, monthKey } from './dates.js';
import { buildSchedule, scheduleTotal } from './schedule.js';

/**
 * @typedef {Object} SavingsPlan
 * @property {number} target         сколько нужно накопить, ₸
 * @property {number} monthlySaving  сколько откладывать в месяц, ₸
 * @property {number} monthsToSave   через сколько месяцев хватит
 * @property {string} readyMonth     'YYYY-MM' — месяц покупки
 * @property {number} totalIfInstallment  сколько отдашь по рассрочке всего, ₸
 * @property {number} saved          экономия, ₸ (0, если наценки нет)
 * @property {number} monthsFreeEarlier  на сколько месяцев раньше освободишься
 * @property {boolean} cashPriceKnown    известна ли цена за наличные
 * @property {'saves-money'|'no-overpay'|'cash-price-unknown'} verdict
 */

/**
 * Считает план накопления вместо этой рассрочки.
 *
 * МОДЕЛЬ. Человек откладывает ровно тот платёж, который иначе ушёл бы банку.
 * Первоначальный взнос при отказе от рассрочки остаётся у него на руках, поэтому
 * он идёт в зачёт накоплений, а не теряется.
 *
 *   monthsToSave = ⌈ (цена − взнос) / платёж ⌉
 *
 * Округление ВВЕРХ, а не к ближайшему: на неполный месяц товар не купишь.
 * Ошибка в эту сторону безопасна — мы обещаем срок не короче реального.
 *
 * ЦЕНА-ОРИЕНТИР. Копим на цену за наличные, если она известна. Если нет —
 * копим на цену рассрочки и честно помечаем это флагом: экономия в этом случае
 * не считается (она может быть и нулевой), а смысл плана остаётся — купить
 * без долга.
 *
 * @param {import('./schedule.js').Installment & {priceCash?: number|null}} installment
 * @param {{startDate?: Date}} [options]
 * @returns {SavingsPlan|null} null — если платёж нулевой и копить нечем
 */
export function savingsPlan(installment, options = {}) {
  const { startDate = new Date() } = options;
  const { priceCash, priceInstallment, downPayment = 0, termMonths } = installment;

  const schedule = installment.payments ?? buildSchedule(installment);
  const monthlySaving = schedule[0]?.amount ?? 0;

  // Нечего откладывать — плана нет. Возвращаем null, а не план с Infinity:
  // «копить вечно» это не совет, а мусор на экране.
  if (monthlySaving <= 0) return null;

  const cashPriceKnown = priceCash != null;
  const target = cashPriceKnown ? priceCash : priceInstallment;

  const needToSave = Math.max(0, target - downPayment);
  const monthsToSave = Math.max(1, Math.ceil(needToSave / monthlySaving));

  const firstOfMonth = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
  );

  const totalIfInstallment = downPayment + scheduleTotal(schedule);
  const overpay = totalIfInstallment - target;

  return {
    target,
    monthlySaving,
    monthsToSave,
    readyMonth: monthKey(addMonthsAnchored(firstOfMonth, monthsToSave)),
    totalIfInstallment,
    // Экономию показываем только там, где она доказана ценой за наличные.
    // Без неё «переплата» — это разница с самой собой, то есть ноль по построению.
    saved: cashPriceKnown ? Math.max(0, overpay) : 0,
    // Рассрочка держит тебя termMonths месяцев. Накопление — monthsToSave.
    // Разница положительна, когда в рассрочке есть наценка: за те же деньги
    // ты успеваешь раньше.
    monthsFreeEarlier: termMonths - monthsToSave,
    cashPriceKnown,
    verdict: !cashPriceKnown ? 'cash-price-unknown' : overpay > 0 ? 'saves-money' : 'no-overpay',
  };
}
