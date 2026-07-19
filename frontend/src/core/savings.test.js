import { describe, it, expect } from 'vitest';

import { savingsPlan } from './savings.js';
import { stackByMonth, portfolioSummary } from './portfolio.js';

/** Рассрочка с наценкой: платишь 360 000, наличными товар стоит 330 000. */
const withMarkup = {
  id: 'a',
  firstDueDate: '2026-08-10',
  termMonths: 24,
  priceInstallment: 360000,
  priceCash: 330000,
  downPayment: 0,
  monthlyPayment: 15000,
};

describe('savingsPlan — копить вместо рассрочки', () => {
  it('копит на цену за наличные, а не на цену рассрочки', () => {
    const plan = savingsPlan(withMarkup, { startDate: new Date(Date.UTC(2026, 6, 1)) });

    expect(plan.target).toBe(330000);
    // 330 000 / 15 000 = ровно 22 месяца
    expect(plan.monthsToSave).toBe(22);
    // Рассрочка держала бы 24 месяца — освобождаешься на 2 раньше
    expect(plan.monthsFreeEarlier).toBe(2);
    expect(plan.saved).toBe(30000);
    expect(plan.verdict).toBe('saves-money');
  });

  it('округляет срок ВВЕРХ: на неполный месяц товар не купишь', () => {
    const plan = savingsPlan(
      { ...withMarkup, priceCash: 331000 },
      { startDate: new Date(Date.UTC(2026, 6, 1)) }
    );

    // 331 000 / 15 000 = 22.07 → 23, а не 22
    expect(plan.monthsToSave).toBe(23);
  });

  it('первоначальный взнос идёт в зачёт: при отказе он остаётся на руках', () => {
    const plan = savingsPlan(
      { ...withMarkup, downPayment: 90000, monthlyPayment: 15000 },
      { startDate: new Date(Date.UTC(2026, 6, 1)) }
    );

    // Копить надо только 330 000 − 90 000 = 240 000 → 16 месяцев
    expect(plan.monthsToSave).toBe(16);
  });

  it('КОНТРОЛЬНЫЙ: без наценки экономии нет — не выдумываем выгоду', () => {
    const honest = { ...withMarkup, priceCash: 360000 };
    const plan = savingsPlan(honest, { startDate: new Date(Date.UTC(2026, 6, 1)) });

    expect(plan.saved).toBe(0);
    expect(plan.verdict).toBe('no-overpay');
    // Копить ровно столько же, сколько платить — ожидание ничего не покупает
    expect(plan.monthsFreeEarlier).toBe(0);
  });

  it('без цены за наличные экономию не считает, но план даёт', () => {
    const plan = savingsPlan(
      { ...withMarkup, priceCash: null },
      { startDate: new Date(Date.UTC(2026, 6, 1)) }
    );

    expect(plan.cashPriceKnown).toBe(false);
    expect(plan.verdict).toBe('cash-price-unknown');
    expect(plan.saved).toBe(0); // не приписываем наценку, которой не видели
    expect(plan.monthsToSave).toBe(24);
  });

  it('считает месяц готовности от текущего месяца', () => {
    const plan = savingsPlan(
      { ...withMarkup, priceCash: 45000 }, // 3 месяца по 15 000
      { startDate: new Date(Date.UTC(2026, 6, 15)) } // июль 2026
    );

    expect(plan.monthsToSave).toBe(3);
    expect(plan.readyMonth).toBe('2026-10');
  });

  it('нулевой платёж — плана нет, а не «копить бесконечно»', () => {
    expect(savingsPlan({ ...withMarkup, priceInstallment: 0, monthlyPayment: 0 })).toBeNull();
  });
});

describe('stackByMonth — вклад каждой рассрочки', () => {
  const phone = { id: 'phone', firstDueDate: '2026-08-10', termMonths: 3, priceInstallment: 45000, monthlyPayment: 15000 };
  const sofa = { id: 'sofa', firstDueDate: '2026-09-10', termMonths: 2, priceInstallment: 60000, monthlyPayment: 30000 };

  it('складывает сегменты и считает итог по месяцу', () => {
    const rows = stackByMonth([phone, sofa], ['2026-08', '2026-09', '2026-10']);

    expect(rows[0].total).toBe(15000);
    expect(rows[0].segments).toHaveLength(1);

    expect(rows[1].total).toBe(45000); // 15 000 + 30 000
    expect(rows[1].segments).toHaveLength(2);
  });

  it('порядок сегментов — как в списке, а не по величине: иначе цвет поедет', () => {
    const rows = stackByMonth([phone, sofa], ['2026-09']);

    // sofa платит больше, но phone идёт первым, потому что первый в списке
    expect(rows[0].segments.map((s) => s.id)).toEqual(['phone', 'sofa']);
  });

  it('месяц без платежей даёт пустой ряд, а не пропуск', () => {
    const rows = stackByMonth([phone], ['2026-07', '2026-08']);

    expect(rows[0].total).toBe(0);
    expect(rows[0].segments).toEqual([]);
    expect(rows).toHaveLength(2);
  });
});

describe('portfolioSummary — совокупная картина', () => {
  const income = { monthlyIncome: 60000 };

  it('остаток долга переводит в месяцы дохода', () => {
    const summary = portfolioSummary([withMarkup], income);

    expect(summary.totalRemaining).toBe(360000);
    expect(summary.incomeMonths).toBe(6); // 360 000 / 60 000
    expect(summary.lastPaymentMonth).toBe('2028-07'); // 24 платежа с августа 2026
  });

  it('переплату считает только там, где известна цена за наличные', () => {
    const noCashPrice = { ...withMarkup, id: 'b', priceCash: null };
    const summary = portfolioSummary([withMarkup, noCashPrice], income);

    expect(summary.knownOverpay).toBe(30000); // только по первой
    expect(summary.unknownCashPrice).toBe(1); // интерфейс обязан это сказать
  });

  it('нулевой доход не роняет расчёт делением на ноль', () => {
    const summary = portfolioSummary([withMarkup], { monthlyIncome: 0 });

    expect(summary.incomeMonths).toBe(Infinity);
    expect(summary.totalRemaining).toBe(360000);
  });

  it('пустой портфель — нули, а не падение', () => {
    const summary = portfolioSummary([], income);

    expect(summary.totalRemaining).toBe(0);
    expect(summary.lastPaymentMonth).toBeNull();
    expect(summary.count).toBe(0);
  });
});
