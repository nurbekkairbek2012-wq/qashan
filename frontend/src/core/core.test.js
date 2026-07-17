import { describe, it, expect } from 'vitest';

import { addMonthsAnchored, fromISODate, toISODate } from './dates.js';
import { buildSchedule, scheduleTotal, validateInstallment } from './schedule.js';
import { npv, irr, effectiveRate } from './irr.js';
import { simulateCashFlow, simulateWithDraft, burdenLevel } from './simulate.js';

describe('addMonthsAnchored — график не съезжает', () => {
  it('держит день месяца', () => {
    const d = fromISODate('2026-01-15');
    expect(toISODate(addMonthsAnchored(d, 1))).toBe('2026-02-15');
    expect(toISODate(addMonthsAnchored(d, 6))).toBe('2026-07-15');
  });

  it('31 января + 1 месяц = 28 февраля (в феврале нет 31-го)', () => {
    const d = fromISODate('2026-01-31');
    expect(toISODate(addMonthsAnchored(d, 1))).toBe('2026-02-28');
  });

  it('КЛЮЧЕВОЕ: после короткого месяца график возвращается на 31-е, а не съезжает', () => {
    // Наивная реализация («прибавить месяц к предыдущей дате») дала бы здесь
    // 28 марта: она посчитала бы от 28 февраля. Мы считаем от якоря — 31-го.
    const anchor = fromISODate('2026-01-31');
    expect(toISODate(addMonthsAnchored(anchor, 2))).toBe('2026-03-31');
    expect(toISODate(addMonthsAnchored(anchor, 3))).toBe('2026-04-30');
    expect(toISODate(addMonthsAnchored(anchor, 4))).toBe('2026-05-31');
  });

  it('переходит через год', () => {
    const d = fromISODate('2026-11-10');
    expect(toISODate(addMonthsAnchored(d, 3))).toBe('2027-02-10');
  });

  it('високосный февраль', () => {
    const d = fromISODate('2028-01-31'); // 2028 — високосный
    expect(toISODate(addMonthsAnchored(d, 1))).toBe('2028-02-29');
  });
});

describe('buildSchedule — график платежей', () => {
  const installment = {
    firstDueDate: '2026-08-10',
    termMonths: 12,
    priceInstallment: 460000,
    downPayment: 0,
    monthlyPayment: 38333,
  };

  it('строит платежи по числу месяцев', () => {
    const schedule = buildSchedule(installment);
    expect(schedule).toHaveLength(12);
    expect(schedule[0].dueDate).toBe('2026-08-10');
    expect(schedule[11].dueDate).toBe('2027-07-10');
  });

  it('ИНВАРИАНТ: сумма графика в точности равна сумме к выплате', () => {
    // 460000 / 12 не делится нацело. Копейки не размазываем по всем месяцам —
    // остаток добирает последний платёж, как это делают банки.
    const schedule = buildSchedule(installment);
    expect(scheduleTotal(schedule)).toBe(460000);
  });

  it('последний платёж добирает остаток округления', () => {
    const schedule = buildSchedule(installment);
    expect(schedule[0].amount).toBe(38333);
    expect(schedule[11].amount).toBe(460000 - 38333 * 11);
  });

  it('учитывает первоначальный взнос', () => {
    const schedule = buildSchedule({ ...installment, downPayment: 100000, monthlyPayment: 30000 });
    expect(scheduleTotal(schedule)).toBe(360000);
  });

  it('выводит платёж сам, если он не задан', () => {
    const { monthlyPayment: _omitted, ...withoutPayment } = installment;
    expect(scheduleTotal(buildSchedule(withoutPayment))).toBe(460000);
  });

  it('отвергает бессмысленный срок', () => {
    expect(() => buildSchedule({ ...installment, termMonths: 0 })).toThrow();
  });

  it('отвергает взнос больше цены', () => {
    expect(() => buildSchedule({ ...installment, downPayment: 999999 })).toThrow();
  });
});

describe('validateInstallment — ловит кривое распознавание', () => {
  it('пропускает согласованные данные', () => {
    const result = validateInstallment({
      termMonths: 12,
      priceInstallment: 460000,
      monthlyPayment: 38333,
    });
    expect(result.ok).toBe(true);
  });

  it('ловит расхождение: платёж × срок не сходится с суммой', () => {
    // Модель распознала платёж как 3833 вместо 38333 — потеряла цифру
    const result = validateInstallment({
      termMonths: 12,
      priceInstallment: 460000,
      monthlyPayment: 3833,
    });
    expect(result.ok).toBe(false);
    expect(result.diff).toBeLessThan(0);
  });
});

describe('npv', () => {
  it('при ставке 0 — просто сумма потока', () => {
    expect(npv(0, [100, -50, -50])).toBe(0);
    expect(npv(0, [100, -30, -30])).toBe(40);
  });

  it('будущие платежи дешевеют с ростом ставки', () => {
    expect(npv(0.05, [100, -50, -50])).toBeGreaterThan(0);
  });
});

describe('irr — эффективная ставка', () => {
  it('КОНТРОЛЬНЫЙ ТЕСТ: нет наценки → ставка ровно 0', () => {
    // Товар в рассрочку стоит столько же, сколько за наличные.
    // Рассрочка действительно беспроцентная, и модель обязана это показать.
    // Если этот тест когда-нибудь покажет процент — значит, математика
    // подкручена, и находке проекта грош цена.
    const result = effectiveRate({
      firstDueDate: '2026-08-10',
      termMonths: 12,
      priceInstallment: 400000,
      priceCash: 400000,
      downPayment: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.monthlyRate).toBeCloseTo(0, 8);
    expect(result.annualRate).toBeCloseTo(0, 8);
    expect(result.overpay).toBe(0);
  });

  it('есть наценка → ставка положительная', () => {
    // Цена за наличные 400 000, в рассрочку 460 000. Переплата 60 000 за год.
    const result = effectiveRate({
      firstDueDate: '2026-08-10',
      termMonths: 12,
      priceInstallment: 460000,
      priceCash: 400000,
      downPayment: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.monthlyRate).toBeGreaterThan(0);
    expect(result.overpay).toBe(60000);
    // Годовая ощутимо выше «беспроцентной»: наценка 15% за год — это ~30% годовых,
    // потому что долг гасится равномерно и в среднем ты пользуешься половиной суммы.
    expect(result.annualRate).toBeGreaterThan(0.25);
    expect(result.annualRate).toBeLessThan(0.35);
  });

  it('СВОЙСТВО: NPV при найденной ставке равен нулю (определение IRR)', () => {
    // Проверяем не конкретное число, а само определение IRR — это устойчивее
    // любой константы: тест не сломается от смены метода поиска корня.
    const principal = 400000;
    const cashflows = [principal, ...Array(12).fill(-38333)];
    const rate = irr(cashflows);

    // Сравниваем ОТНОСИТЕЛЬНУЮ погрешность, а не абсолютную. При суммах порядка
    // 400 000 ₸ абсолютный ноль в float64 недостижим: машинная точность даёт
    // остаток ~1e-4 ₸. В долях от суммы это ~1e-10 — ставка найдена точно.
    expect(Math.abs(npv(rate, cashflows)) / principal).toBeLessThan(1e-9);
  });

  it('рассрочка ДЕШЕВЛЕ наличных → ставка отрицательная', () => {
    // Бывает: скидка за рассрочку. Модель не обязана выдавать только плюс.
    const result = effectiveRate({
      firstDueDate: '2026-08-10',
      termMonths: 12,
      priceInstallment: 380000,
      priceCash: 400000,
      downPayment: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.monthlyRate).toBeLessThan(0);
  });

  it('нет цены за наличные → честно отказываемся считать', () => {
    const result = effectiveRate({
      firstDueDate: '2026-08-10',
      termMonths: 12,
      priceInstallment: 460000,
      priceCash: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/наличные/);
  });

  it('поток без смены знака → null, а не выдуманное число', () => {
    expect(irr([100, 50, 50])).toBeNull();
  });
});

describe('burdenLevel', () => {
  it('режет по порогам 30% и 50%', () => {
    expect(burdenLevel(0.1)).toBe('safe');
    expect(burdenLevel(0.35)).toBe('warn');
    expect(burdenLevel(0.8)).toBe('danger');
  });
});

describe('simulateCashFlow — когда уйдёшь в минус', () => {
  const profile = { monthlyIncome: 60000 };
  const start = fromISODate('2026-08-01');

  const makeInstallment = (monthly, term, firstDue) => ({
    firstDueDate: firstDue,
    termMonths: term,
    priceInstallment: monthly * term,
    monthlyPayment: monthly,
  });

  it('нет рассрочек → баланс растёт на доход', () => {
    const { months, firstNegativeMonth } = simulateCashFlow(profile, [], {
      startDate: start,
      horizonMonths: 3,
    });
    expect(months[0].balance).toBe(60000);
    expect(months[2].balance).toBe(180000);
    expect(firstNegativeMonth).toBeNull();
  });

  it('платежи по силам → в минус не уходим', () => {
    const result = simulateCashFlow(profile, [makeInstallment(15000, 12, '2026-08-10')], {
      startDate: start,
      horizonMonths: 12,
    });
    expect(result.firstNegativeMonth).toBeNull();
    expect(result.peakBurden).toBeCloseTo(0.25, 2);
  });

  it('ДЕФИЦИТ vs БАЛАНС: это разные ответы, и путать их нельзя', () => {
    // Платежи 65 000 при доходе 60 000 — структурный дефицит с первого же месяца.
    // Но накопленный баланс уходит в минус НЕ сразу: первый месяц горизонта
    // (июль) платежей ещё не содержит, рассрочки стартуют в августе, и за июль
    // копится целый доход. Эта подушка маскирует дефицит на много месяцев.
    //
    // Поэтому ведущий ответ продукта — firstDeficitMonth: он от накоплений
    // не зависит. Баланс без реальных накоплений человека — условное число.
    const installments = [
      makeInstallment(15000, 12, '2026-08-10'),
      makeInstallment(20000, 12, '2026-08-15'),
      makeInstallment(30000, 12, '2026-08-20'),
    ];

    const result = simulateCashFlow(profile, installments, {
      startDate: start, // 1 августа
      horizonMonths: 12,
    });

    expect(result.firstDeficitMonth).toBe('2026-08');
    expect(result.months[0].net).toBe(-5000);
  });

  it('дефицита нет, пока платежи не начались', () => {
    // Рассрочка стартует в октябре — в августе и сентябре дефицита нет
    const result = simulateCashFlow(profile, [makeInstallment(70000, 6, '2026-10-10')], {
      startDate: start,
      horizonMonths: 12,
    });

    expect(result.months[0].net).toBe(60000);
    expect(result.firstDeficitMonth).toBe('2026-10');
  });

  it('ГЛАВНОЕ: три рассрочки, каждая «безобидная» → находим месяц ухода в минус', () => {
    // Ровно та боль, ради которой проект: 15 + 20 + 30 = 65 000 в месяц
    // при доходе 60 000. По отдельности каждая выглядит подъёмной.
    const installments = [
      makeInstallment(15000, 12, '2026-08-10'),
      makeInstallment(20000, 12, '2026-08-15'),
      makeInstallment(30000, 12, '2026-08-20'),
    ];

    const result = simulateCashFlow(profile, installments, {
      startDate: start,
      horizonMonths: 12,
    });

    expect(result.months[0].due).toBe(65000);
    expect(result.months[0].net).toBe(-5000);
    expect(result.peakBurden).toBeCloseTo(65000 / 60000, 4);
    expect(result.months[0].level).toBe('danger');
    expect(result.firstNegativeMonth).toBe('2026-08');
  });

  it('накопленный запас оттягивает минус, но не отменяет его', () => {
    const installments = [
      makeInstallment(15000, 12, '2026-08-10'),
      makeInstallment(20000, 12, '2026-08-15'),
      makeInstallment(30000, 12, '2026-08-20'),
    ];

    // Минус 5000 в месяц: запаса в 12 000 хватит на два месяца, на третьем провал
    const result = simulateCashFlow(profile, installments, {
      startDate: start,
      startBalance: 12000,
      horizonMonths: 12,
    });

    expect(result.firstNegativeMonth).toBe('2026-10');
  });

  it('оплаченные платежи не давят на будущее', () => {
    const installment = {
      ...makeInstallment(30000, 12, '2026-08-10'),
      payments: [
        { seq: 1, dueDate: '2026-08-10', amount: 30000, isPaid: true },
        { seq: 2, dueDate: '2026-09-10', amount: 30000, isPaid: false },
      ],
    };

    const result = simulateCashFlow(profile, [installment], {
      startDate: start,
      horizonMonths: 2,
    });

    expect(result.months[0].due).toBe(0);
    expect(result.months[1].due).toBe(30000);
  });

  it('нулевой доход не роняет расчёт делением на ноль', () => {
    const result = simulateCashFlow({ monthlyIncome: 0 }, [makeInstallment(10000, 3, '2026-08-10')], {
      startDate: start,
      horizonMonths: 2,
    });
    expect(result.months[0].burden).toBe(Infinity);
    expect(result.months[0].level).toBe('danger');
  });
});

describe('simulateWithDraft — «а что если взять ещё одну»', () => {
  const profile = { monthlyIncome: 60000 };
  const start = fromISODate('2026-08-01');
  const options = { startDate: start, horizonMonths: 12, startBalance: 60000 };

  const existing = [
    {
      firstDueDate: '2026-08-10',
      termMonths: 12,
      priceInstallment: 240000,
      monthlyPayment: 20000,
    },
  ];

  it('черновик не трогает исходный список', () => {
    const draft = {
      firstDueDate: '2026-08-12',
      termMonths: 12,
      priceInstallment: 180000,
      monthlyPayment: 15000,
    };
    simulateWithDraft(profile, existing, draft, options);
    expect(existing).toHaveLength(1);
  });

  it('подъёмная покупка → минус не наступает', () => {
    const draft = {
      firstDueDate: '2026-08-12',
      termMonths: 12,
      priceInstallment: 120000,
      monthlyPayment: 10000,
    };
    const { after, monthsLost } = simulateWithDraft(profile, existing, draft, options);
    expect(after.firstNegativeMonth).toBeNull();
    expect(monthsLost).toBeNull();
  });

  it('ГЛАВНОЕ: неподъёмная покупка → минуса не было, стал', () => {
    // Ценность продукта: этот ответ приходит ДО покупки, а не после
    const draft = {
      firstDueDate: '2026-08-12',
      termMonths: 12,
      priceInstallment: 600000,
      monthlyPayment: 50000,
    };

    const { before, after, monthsLost } = simulateWithDraft(profile, existing, draft, options);

    expect(before.firstNegativeMonth).toBeNull();

    // Считаем руками: платежи 20 000 + 50 000 = 70 000 при доходе 60 000,
    // то есть −10 000 в месяц. Стартовая подушка 60 000 покрывает ровно
    // 6 месяцев (август–январь), провал наступает на седьмом — в феврале.
    // Подушка не отменяет минус, а только отодвигает его.
    expect(after.months[5].balance).toBe(0); // 2027-01, подушка кончилась
    expect(after.firstNegativeMonth).toBe('2027-02');
    expect(monthsLost).toBe(Infinity); // качественный скачок: минуса не было — стал
  });
});
