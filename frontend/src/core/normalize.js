/**
 * Нормализация распознанных данных.
 *
 * ЗАЧЕМ ЭТО ОТДЕЛЬНЫЙ СЛОЙ. Модель читает скриншот и отдаёт то, что видит:
 * «15 000 ₸», «15000₸», «15 тыс», «15к», «10.08.2026», «10 августа 2026».
 * Превратить это в число и дату — работа кода, а не модели.
 *
 * Принцип всего проекта: LLM извлекает, код считает. Языковая модель ошибается
 * в арифметике, и доверять ей деньги нельзя. Здесь же всё детерминировано:
 * одна и та же строка всегда даёт один и тот же результат, и это проверяемо
 * тестами — в отличие от ответа модели.
 *
 * Не разобрали строку — возвращаем null. Никаких догадок: пустое поле честнее
 * выдуманного числа.
 */

/**
 * Множители: «15к» → 15 000, «1,5 млн» → 1 500 000.
 *
 * Односимвольный суффикс «к»/«k» ловим якорем конца строки, а НЕ через `\b`.
 * В JS граница слова считается по ASCII: кириллическая «к» для `\b` не буква,
 * поэтому /к\b/ на строке «15к» не срабатывает вообще — а /k\b/ на «15k»
 * срабатывает. Молчаливое расхождение: латиница работала, кириллица теряла
 * множитель, и «15к» превращалось в 15 тенге вместо 15 000.
 */
const MULTIPLIERS = [
  { pattern: /(?:млн|миллион[а-яё]*)/i, factor: 1_000_000 },
  { pattern: /(?:тыс\.?|тысяч[а-яё]*)|\d\s*[кk]\s*$/i, factor: 1_000 },
];

/**
 * Единицы, которые нужно вычистить перед разбором числа.
 *
 * Окончания перечисляем как [а-яё]*, а не \w* — по той же причине, что и выше:
 * \w в JS покрывает только ASCII, поэтому «миллион\w*» не съедает «а»
 * в «2 миллиона», остаётся «2а», и разбор молча возвращает null.
 *
 * Порядок альтернатив значим: чередование берёт ПЕРВОЕ совпадение, а не самое
 * длинное. «тыс\.?» перед «тысяч…» откусило бы от «тысяча» только «тыс»,
 * оставив «яча». Длинные варианты идут первыми.
 */
const UNIT_WORDS = /(?:миллион[а-яё]*|млн|тысяч[а-яё]*|тыс\.?|тенге|тг)/gi;

const MONTHS_GENITIVE = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн',
  'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
];

/**
 * Строка с суммой → число в тенге.
 *
 *   «15 000 ₸» → 15000      (обычный пробел)
 *   «15 000 ₸» → 15000      (неразрывный пробел U+00A0 — его вставляет Kaspi)
 *   «15 000 тг» → 15000
 *   «15к»      → 15000
 *   «1,5 млн»  → 1500000
 *   «мусор»    → null
 *
 * @param {string|number|null|undefined} raw
 * @returns {number|null} целые тенге, либо null если распознать не удалось
 */
export function parseMoney(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;

  const text = raw.trim();
  if (!text) return null;

  // Множитель ищем до чистки: «к» в «15к» надо увидеть, пока строка цела
  let factor = 1;
  for (const { pattern, factor: value } of MULTIPLIERS) {
    if (pattern.test(text)) {
      factor = value;
      break;
    }
  }

  // Оставляем только цифры и разделитель дробной части.
  // \s не ловит неразрывный пробел U+00A0 — а именно его подставляют банки
  // в суммах, чтобы «15 000 ₸» не разрывалось переносом. Убираем явно.
  const digits = text
    .replace(/[\s  ]/g, '')
    .replace(/₸/g, '')
    .replace(UNIT_WORDS, '')
    .replace(/[кk]$/i, '')
    .replace(',', '.');

  if (!/^-?\d+(?:\.\d+)?$/.test(digits)) return null;

  const value = Number(digits) * factor;
  if (!Number.isFinite(value)) return null;

  return Math.round(value);
}

/** Двузначный год → четырёхзначный: 26 → 2026. */
function expandYear(year) {
  return year < 100 ? 2000 + year : year;
}

/** Собирает ISO-дату, проверяя что она существует (31 февраля не пройдёт). */
function toISO(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC молча переполняет: 31 февраля станет 3 марта. Сверяем обратно.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date.toISOString().slice(0, 10);
}

/**
 * Строка с датой → 'YYYY-MM-DD'.
 *
 *   «2026-08-10»       → '2026-08-10'  (уже ISO)
 *   «10.08.2026»       → '2026-08-10'
 *   «10.08.26»         → '2026-08-10'
 *   «10/08/2026»       → '2026-08-10'
 *   «10 августа 2026»  → '2026-08-10'
 *   «10 августа»       → null — года нет, а угадывать нельзя
 *   «31.02.2026»       → null — такой даты не существует
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function parseDate(raw) {
  if (typeof raw !== 'string') return null;

  const text = raw.trim().toLowerCase();
  if (!text) return null;

  // Уже ISO
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return toISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // 10.08.2026 · 10/08/26 · 10-08-2026 — день первый, как принято в РК
  const numeric = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numeric) {
    return toISO(expandYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));
  }

  // 10 августа 2026
  const verbal = text.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/);
  if (verbal) {
    const monthName = verbal[2];
    const index = MONTHS_GENITIVE.findIndex((stem) => monthName.startsWith(stem));
    if (index === -1) return null;
    return toISO(Number(verbal[3]), index + 1, Number(verbal[1]));
  }

  // Года нет — не угадываем. Пусть человек подтвердит.
  return null;
}

/** Строка со сроком → число месяцев. «12 мес» → 12, «на 24 месяца» → 24. */
export function parseTerm(raw) {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 && raw <= 60 ? raw : null;
  }
  if (typeof raw !== 'string') return null;

  const match = raw.match(/(\d{1,2})/);
  if (!match) return null;

  const months = Number(match[1]);
  // 60 месяцев — потолок здравого смысла для рассрочки. Больше — распознали мусор.
  return months > 0 && months <= 60 ? months : null;
}

/**
 * Приводит сырой ответ модели к структуре рассрочки.
 *
 * Модель возвращает то, что увидела; здесь это становится числами и датами.
 * Всё, что не распозналось, остаётся null — форма попросит человека дозаполнить.
 *
 * @param {Object} raw сырой JSON от модели
 * @returns {Object} черновик рассрочки с полями нашей схемы
 */
export function normalizeExtract(raw) {
  if (!raw || typeof raw !== 'object') {
    return { merchant: '', itemName: '', priceInstallment: null, priceCash: null,
      downPayment: 0, termMonths: null, monthlyPayment: null, firstDueDate: null };
  }

  return {
    merchant: typeof raw.merchant === 'string' ? raw.merchant.trim() : '',
    itemName: typeof raw.item_name === 'string' ? raw.item_name.trim() : '',
    priceInstallment: parseMoney(raw.price_installment),
    priceCash: parseMoney(raw.price_cash),
    downPayment: parseMoney(raw.down_payment) ?? 0,
    termMonths: parseTerm(raw.term_months),
    monthlyPayment: parseMoney(raw.monthly_payment),
    firstDueDate: parseDate(raw.first_due_date),
  };
}
