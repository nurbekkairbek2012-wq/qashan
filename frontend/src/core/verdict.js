/**
 * Вердикт по сценарию «а что если взять ещё одну».
 *
 * Живёт в ядре, а не в компоненте: это чистая функция от результата симуляции,
 * без React и без состояния. Так её можно тестировать напрямую — а ветвление
 * здесь смысловое, и ошибка в нём даст пользователю неверный совет о деньгах.
 */

import { formatMonth, plural } from './format.js';

/**
 * @param {{before: Object, after: Object, monthsLost: number|null}} scenario
 * @returns {{tone: 'safe'|'warn'|'danger', title: string, detail: string}}
 */
export function verdictOf({ before, after, monthsLost }) {
  // Дефицита не будет вовсе
  if (after.firstDeficitMonth === null) {
    return {
      tone: 'safe',
      title: 'Эту потянешь',
      detail: 'Даже с новой рассрочкой платежи не перевесят доход в ближайший год.',
    };
  }

  // Самый важный случай: справлялся — и перестанет. Качественный перелом,
  // а не сдвиг на сколько-то месяцев.
  if (before.firstDeficitMonth === null) {
    return {
      tone: 'danger',
      title: `С ней платежи перевесят доход в ${formatMonth(after.firstDeficitMonth)}`,
      detail: 'Сейчас ты справляешься. Эта покупка ломает баланс — до неё дефицита не было.',
    };
  }

  // Дефицит был и приблизился
  if (monthsLost > 0) {
    return {
      tone: 'danger',
      title: `Дефицит придёт на ${monthsLost} ${plural(monthsLost, 'месяц', 'месяца', 'месяцев')} раньше`,
      detail: `Было ${formatMonth(before.firstDeficitMonth)}, станет ${formatMonth(after.firstDeficitMonth)}.`,
    };
  }

  // Дефицит был и не сдвинулся — пугать нечем, врать не будем
  return {
    tone: 'warn',
    title: `Дефицит и так наступит в ${formatMonth(after.firstDeficitMonth)}`,
    detail: 'Эта покупка его не приближает, но и легче не делает.',
  };
}
