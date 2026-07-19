/**
 * Демонстрационный пример для быстрого показа продукта.
 *
 * ЧЕСТНОСТЬ. Это НЕ выдуманные данные, поданные как реальные — это явный пример,
 * который в интерфейсе помечен словом «пример». Кнопка нужна, чтобы не вводить
 * цифры руками во время живого демо или записи видео. Реальные данные вводит
 * человек; этот набор существует только для демонстрации механики.
 *
 * ПОДБОР. Пример показывает саму находку продукта: три рассрочки, каждая по
 * отдельности подъёмная (15 000, 20 000, 30 000 в месяц при доходе 60 000),
 * вместе дают 65 000 — и бюджет уходит в минус. Именно это студент и не видит,
 * пока каждая рассрочка живёт в своём приложении.
 *
 * Даты привязаны к «сегодня», чтобы график всегда начинался от текущего месяца
 * и демо не устаревало.
 */

/** Дата через n месяцев от сегодня, 10-е число, в формате 'YYYY-MM-DD'. */
function dueInMonths(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  d.setDate(10);
  return d.toISOString().slice(0, 10);
}

export const DEMO_INCOME = '60000';

export function makeDemoInstallments() {
  return [
    {
      id: crypto.randomUUID(),
      merchant: 'Пример · магазин техники',
      itemName: 'Телефон',
      priceInstallment: 360000,
      priceCash: 330000, // известна цена за наличные → покажем реальную ставку
      downPayment: 0,
      termMonths: 24,
      monthlyPayment: 15000,
      firstDueDate: dueInMonths(1),
      source: 'manual',
    },
    {
      id: crypto.randomUUID(),
      merchant: 'Пример · маркетплейс',
      itemName: 'Ноутбук',
      priceInstallment: 240000,
      priceCash: null, // цена за наличные неизвестна → ставку не выдумываем
      downPayment: 0,
      termMonths: 12,
      monthlyPayment: 20000,
      firstDueDate: dueInMonths(1),
      source: 'manual',
    },
    {
      id: crypto.randomUUID(),
      merchant: 'Пример · мебель',
      itemName: 'Диван',
      priceInstallment: 180000,
      priceCash: null,
      downPayment: 0,
      termMonths: 6,
      monthlyPayment: 30000,
      firstDueDate: dueInMonths(1),
      source: 'manual',
    },
  ];
}
