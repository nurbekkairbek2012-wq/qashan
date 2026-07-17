/**
 * Работа с датами платежей.
 *
 * Всё считаем в UTC осознанно: график платежей — это календарь, а не момент
 * времени. Если использовать локальное время, при смене часового пояса или
 * переходе на летнее время дата платежа может съехать на день.
 */

/** Сколько дней в месяце. День 0 следующего месяца = последний день текущего. */
export function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Прибавляет n месяцев к дате, удерживая исходный день месяца.
 *
 * Почему «удерживая»: наивная реализация вида «прибавить месяц к предыдущей
 * дате» уводит график. 31 января + 1 месяц = 28 февраля (в феврале нет 31-го),
 * но следующий платёж должен быть 31 марта, а не 28-го. Если считать от 28-го,
 * график съезжает и больше не выправляется.
 *
 * Поэтому каждый платёж считаем от ИСХОДНОЙ даты (якоря), а не от предыдущего.
 * Если в целевом месяце такого дня нет — берём последний день месяца. Так же
 * поступают банки.
 *
 * @param {Date} anchor исходная дата (не мутируется)
 * @param {number} n сколько месяцев прибавить
 * @returns {Date}
 */
export function addMonthsAnchored(anchor, n) {
  const anchorDay = anchor.getUTCDate();

  // Date.UTC сам обрабатывает переполнение месяцев (месяц 13 → январь следующего года)
  const target = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + n, 1)
  );

  const year = target.getUTCFullYear();
  const month = target.getUTCMonth();
  const day = Math.min(anchorDay, daysInMonth(year, month));

  return new Date(Date.UTC(year, month, day));
}

/** Дата → 'YYYY-MM-DD'. */
export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → Date (в UTC, без сдвига по часовому поясу). */
export function fromISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Ключ месяца 'YYYY-MM' — по нему группируем платежи в симуляции. */
export function monthKey(date) {
  return date.toISOString().slice(0, 7);
}
