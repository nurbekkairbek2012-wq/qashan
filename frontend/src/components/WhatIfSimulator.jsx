import { useState } from 'react';
import { simulateWithDraft } from '../core/simulate.js';
import { verdictOf } from '../core/verdict.js';
import { formatTenge, formatMonthsCount } from '../core/format.js';
import SavingsAlternative from './SavingsAlternative.jsx';

/**
 * «А что если взять ещё одну» — ключевая фича продукта.
 *
 * ЗАЧЕМ ОНА ГЛАВНАЯ. Дашборд ставит диагноз задним числом: рассрочки уже взяты,
 * поздно. Здесь ответ приходит ДО покупки — студент стоит в магазине, вбивает
 * цену и видит последствие. Всё остальное в приложении — констатация; ценность
 * тут.
 *
 * Поля ровно те, что человек знает у витрины: цена и срок. Платёж выводим сами,
 * спрашивать его — значит требовать то, чего он ещё не видел.
 */

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-brand';

/**
 * Черновая рассрочка из цены и срока. Первый платёж — через месяц.
 *
 * priceCash необязательна: у витрины человек её часто не знает. Если знает —
 * включается расчёт переплаты и реальной ставки; если нет — null, и мы про
 * ставку молчим, а не подставляем допущение.
 */
function makeDraft(price, termMonths, priceCash) {
  const firstDue = new Date();
  firstDue.setMonth(firstDue.getMonth() + 1);

  return {
    id: '__draft__',
    firstDueDate: firstDue.toISOString().slice(0, 10),
    termMonths,
    priceInstallment: price,
    priceCash: priceCash > 0 ? priceCash : null,
    downPayment: 0,
    monthlyPayment: Math.round(price / termMonths),
  };
}

const TONE = {
  safe: { color: 'var(--color-safe)', bg: 'var(--color-safe-soft)', border: 'var(--color-safe)' },
  warn: { color: 'var(--color-warn)', bg: 'var(--color-warn-soft)', border: 'var(--color-warn)' },
  danger: { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', border: 'var(--color-danger)' },
};

export default function WhatIfSimulator({ profile, installments }) {
  const [price, setPrice] = useState('');
  const [termMonths, setTermMonths] = useState('12');
  const [priceCash, setPriceCash] = useState('');

  const priceNumber = Number(price) || 0;
  const term = Number(termMonths) || 0;
  const cashNumber = Number(priceCash) || 0;
  const ready = priceNumber > 0 && term > 0;

  const draft = ready ? makeDraft(priceNumber, term, cashNumber) : null;
  const scenario = draft ? simulateWithDraft(profile, installments, draft, { horizonMonths: 12 }) : null;
  const verdict = scenario ? verdictOf(scenario) : null;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-base font-medium text-ink">Думаешь взять ещё одну?</h2>
      <p className="mt-1 text-sm text-muted">
        Введи цену до покупки — посмотрим, что будет.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Цена, ₸</span>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="300000"
            className={`${inputClass} tabular mt-1`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">На сколько месяцев</span>
          <input
            type="number"
            min="1"
            max="60"
            value={termMonths}
            onChange={(event) => setTermMonths(event.target.value)}
            className={`${inputClass} tabular mt-1`}
          />
        </label>

        {/* Необязательное поле. Без него всё работает, с ним включается
            проверка главной гипотезы проекта — есть ли в «беспроцентной»
            рассрочке наценка. Спрашиваем, но не требуем. */}
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-ink">Цена за наличные, ₸</span>
          <span className="ml-1.5 text-xs text-muted">
            если знаешь — посчитаем переплату и реальную ставку
          </span>
          <input
            type="number"
            min="0"
            value={priceCash}
            onChange={(event) => setPriceCash(event.target.value)}
            placeholder="необязательно"
            className={`${inputClass} tabular mt-1 sm:max-w-xs`}
          />
        </label>
      </div>

      {ready && (
        <p className="tabular mt-3 text-sm text-muted">
          Это {formatTenge(draft.monthlyPayment)} в месяц на {formatMonthsCount(term)}.
        </p>
      )}

      {verdict && (
        <div
          className="mt-4 rounded-xl border p-4"
          style={{ borderColor: TONE[verdict.tone].border, background: TONE[verdict.tone].bg }}
        >
          <p className="text-lg font-semibold" style={{ color: TONE[verdict.tone].color }}>
            {verdict.title}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{verdict.detail}</p>

          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div>
              <dt className="text-xs text-muted">Сейчас платежи в пик</dt>
              <dd className="tabular font-medium text-ink">
                {formatTenge(Math.max(...scenario.before.months.map((m) => m.due)))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Станет</dt>
              <dd className="tabular font-medium text-ink">
                {formatTenge(Math.max(...scenario.after.months.map((m) => m.due)))}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Выход, а не только диагноз. Показываем всегда, когда есть черновик:
          даже если рассрочка подъёмная, человек вправе увидеть её цену. */}
      {draft && <SavingsAlternative draft={draft} />}
    </section>
  );
}
