/**
 * Цепочка распознавания с самопроверкой и повторным проходом.
 *
 * ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ ОБЁРТКИ НАД API. Обёртка — это «отправил картинку,
 * показал ответ». Здесь ответ модели проходит арифметическую проверку, и если
 * он ей противоречит, код САМ формулирует, что именно не сходится, и отправляет
 * модель перечитать конкретные поля. Решение о повторе, текст замечания и выбор
 * итогового результата принимает код — модель не знает, что её перепроверяют.
 *
 * ПОЧЕМУ ЭТО НУЖНО ИМЕННО ЗДЕСЬ. Vision-модель уверенно путает соседние числа
 * на экране рассрочки: платёж с общей суммой, срок с номером договора. Ошибка
 * молчаливая — JSON приходит валидный, поля заполнены, всё выглядит правильно.
 * Ловит её только арифметика: платёж × срок обязан сойтись с суммой к выплате.
 *
 * ГАРАНТИЯ, КОТОРУЮ ДАЁМ. Второй проход не может ухудшить результат: из двух
 * попыток выбирается лучшая по объективной шкале, при равенстве остаётся первая.
 * Это проверено тестом — иначе «починка» могла бы испортить то, что уже работало.
 *
 * ПОТОЛОК — ДВА ПРОХОДА. Не цикл до победного: каждый проход стоит денег и
 * секунд, а если модель ошиблась дважды, третий раз её переубеждать бесполезно —
 * дешевле показать человеку и дать исправить руками.
 */

import { normalizeExtract } from './normalize.js';
import { validateInstallment } from './schedule.js';
import { formatTenge } from './format.js';

/** Поля, без которых рассрочку не посчитать. Остальные — косметика. */
const KEY_FIELDS = ['priceInstallment', 'termMonths', 'monthlyPayment', 'firstDueDate'];

/** Арифметику можно проверить только когда есть все три слагаемых. */
function canValidate(data) {
  return (
    data.priceInstallment != null && data.termMonths != null && data.monthlyPayment != null
  );
}

/**
 * Проверка инварианта «платёж × срок ≈ сумма к выплате».
 * Возвращает null, если данных для проверки не хватает — это НЕ то же самое,
 * что «проверка провалена», и путать их нельзя.
 *
 * @returns {{ok: boolean, expected: number, actual: number, diff: number}|null}
 */
export function checkArithmetic(data) {
  if (!canValidate(data)) return null;
  return validateInstallment(data);
}

/**
 * Объективная оценка качества распознавания.
 *
 * Сошедшаяся арифметика весит больше, чем любое отдельное поле: набор
 * заполненных, но противоречащих друг другу чисел хуже, чем на одно поле
 * меньше при сходящемся остатке. Именно поэтому вес 10, а не 1 — чтобы
 * заполненность не могла перевесить непротиворечивость.
 *
 * @param {Object} data нормализованный черновик
 * @returns {number}
 */
export function scoreExtraction(data) {
  const filled = KEY_FIELDS.filter((field) => data[field] != null).length;
  const check = checkArithmetic(data);
  return filled + (check?.ok ? 10 : 0);
}

/**
 * Нужен ли второй проход — и что именно попросить перечитать.
 *
 * Два повода: не хватает ключевого поля либо арифметика не сходится.
 * Замечание формулируем КОНКРЕТНО, с числами: «перечитай внимательнее» модель
 * проигнорирует, а «20 000 × 24 = 480 000, но сумма указана 360 000» даёт ей
 * опору, чтобы найти, где именно она ошиблась.
 *
 * @param {Object} data нормализованный результат первого прохода
 * @returns {{needed: boolean, hint: string|null, reason: string|null}}
 */
export function planRepair(data) {
  const missing = KEY_FIELDS.filter((field) => data[field] == null);
  const check = checkArithmetic(data);

  // Арифметика важнее пропусков: противоречие означает, что какое-то ЧИСЛО
  // прочитано неверно, и это опаснее пустого поля. Пустое поле человек увидит
  // в форме, а неверное — примет за правду.
  if (check && !check.ok) {
    return {
      needed: true,
      reason: 'arithmetic',
      hint:
        `При прошлом чтении этого же изображения получилось: ` +
        `цена ${formatTenge(data.priceInstallment)}, ` +
        `первоначальный взнос ${formatTenge(data.downPayment ?? 0)}, ` +
        `срок ${data.termMonths} мес., платёж ${formatTenge(data.monthlyPayment)}.\n\n` +
        `Это противоречиво: ${formatTenge(data.monthlyPayment)} × ${data.termMonths} = ` +
        `${formatTenge(check.actual)}, а цена минус взнос = ${formatTenge(check.expected)}. ` +
        `Расхождение ${formatTenge(Math.abs(check.diff))}.\n\n` +
        `Одно из этих четырёх чисел прочитано неверно. Посмотри на изображение заново ` +
        `и найди, какое именно: часто путают ежемесячный платёж с общей суммой к выплате ` +
        `или срок рассрочки с номером договора. ` +
        `Верни исправленные значения. Если какого-то поля на экране нет — верни null, ` +
        `не подгоняй числа друг под друга.`,
    };
  }

  if (missing.length > 0) {
    return {
      needed: true,
      reason: 'missing',
      hint:
        `При прошлом чтении этого же изображения не удалось найти поля: ` +
        `${missing.join(', ')}.\n\n` +
        `Посмотри внимательно ещё раз — возможно, они записаны непривычно ` +
        `(например, платёж как «15 000 ₸ x 12 мес» или дата как «10 авг»). ` +
        `Если их на изображении действительно нет — верни null. ` +
        `Не выводи значение из других полей и не угадывай.`,
    };
  }

  return { needed: false, hint: null, reason: null };
}

/**
 * Выбирает лучший результат из двух проходов.
 *
 * При равенстве очков остаётся ПЕРВЫЙ: если второй проход ничего не улучшил,
 * менять данные не на что — лишняя замена только добавила бы недетерминизма.
 *
 * @returns {{data: Object, usedPass: 1|2, improved: boolean}}
 */
export function chooseBetter(first, second) {
  const firstScore = scoreExtraction(first);
  const secondScore = scoreExtraction(second);

  if (secondScore > firstScore) {
    return { data: second, usedPass: 2, improved: true };
  }
  return { data: first, usedPass: 1, improved: false };
}

/**
 * @typedef {Object} ExtractionResult
 * @property {Object} data       нормализованный черновик рассрочки
 * @property {number} passes     сколько раз обращались к модели (1 или 2)
 * @property {boolean} repaired  помог ли второй проход
 * @property {string|null} repairReason  из-за чего вообще запускали второй
 * @property {{ok: boolean, diff: number}|null} check итоговая арифметика
 * @property {Object} raw        сырой ответ модели, который в итоге использован
 */

/**
 * Полная цепочка: распознать → проверить → при нужде перечитать → выбрать лучшее.
 *
 * Транспорт передаётся аргументом, а не импортируется. Поэтому цепочку можно
 * прогнать в тестах на подставных ответах модели, без сети и без ключей —
 * логика самопроверки покрыта тестами так же, как арифметика.
 *
 * @param {{image: string, mimeType: string}} input
 * @param {{invoke: (body: Object) => Promise<Object>}} transport
 * @returns {Promise<ExtractionResult>}
 */
export async function extractWithRepair(input, { invoke }) {
  const firstRaw = await invoke({ image: input.image, mimeType: input.mimeType });
  const first = normalizeExtract(firstRaw);

  const plan = planRepair(first);

  if (!plan.needed) {
    return {
      data: first,
      passes: 1,
      repaired: false,
      repairReason: null,
      check: checkArithmetic(first),
      raw: firstRaw,
    };
  }

  let secondRaw;
  try {
    secondRaw = await invoke({ image: input.image, mimeType: input.mimeType, hint: plan.hint });
  } catch {
    // Второй проход — улучшение, а не обязательство. Сорвался (квота, сеть) —
    // отдаём первый результат, а не роняем всё распознавание.
    return {
      data: first,
      passes: 1,
      repaired: false,
      repairReason: plan.reason,
      check: checkArithmetic(first),
      raw: firstRaw,
    };
  }

  const second = normalizeExtract(secondRaw);
  const choice = chooseBetter(first, second);

  return {
    data: choice.data,
    passes: 2,
    repaired: choice.improved,
    repairReason: plan.reason,
    check: checkArithmetic(choice.data),
    raw: choice.usedPass === 2 ? secondRaw : firstRaw,
  };
}
