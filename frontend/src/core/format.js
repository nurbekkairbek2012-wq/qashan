/**
 * Форматирование для интерфейса. Отделено от расчётов: ядро оперирует числами,
 * представление живёт здесь.
 */

const MONTHS_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const MONTHS_RU_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/** 60000 → «60 000 ₸». Неразрывный пробел, чтобы сумма не переносилась. */
export function formatTenge(amount) {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '−' : '';
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${digits} ₸`;
}

/** '2027-02' → «февраль 2027». */
export function formatMonth(key) {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS_RU[month - 1]} ${year}`;
}

/** '2027-02' → «фев», для подписей оси. */
export function formatMonthShort(key) {
  const [, month] = key.split('-').map(Number);
  return MONTHS_RU_SHORT[month - 1];
}

/** 0.34 → «34%». */
export function formatPercent(ratio, digits = 0) {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/**
 * Склонение существительного после числительного.
 * 1 месяц · 2 месяца · 5 месяцев
 */
export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/** 5 → «5 месяцев». */
export function formatMonthsCount(n) {
  return `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`;
}
