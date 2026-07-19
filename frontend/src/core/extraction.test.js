import { describe, it, expect } from 'vitest';

import {
  checkArithmetic,
  scoreExtraction,
  planRepair,
  chooseBetter,
  extractWithRepair,
} from './extraction.js';
import { normalizeExtract } from './normalize.js';
import { formatTenge } from './format.js';

// Суммы в замечании форматируются через formatTenge, а он ставит НЕРАЗРЫВНЫЙ
// пробел (U+00A0) — «360 000 ₸» с обычным пробелом здесь не совпадёт.
// Поэтому ожидание строим тем же форматтером, а не литералом с невидимым
// символом, который никто потом не разглядит в диффе.
const MONEY_360K = formatTenge(360000);

/** Сырой ответ модели — как он приходит от Gemini: строки, а не числа. */
const GOOD_RAW = {
  merchant: 'Sulpak',
  item_name: 'Ноутбук',
  price_installment: '360 000 ₸',
  price_cash: null,
  down_payment: '0',
  term_months: '24 мес',
  monthly_payment: '15 000 ₸',
  first_due_date: '10.08.2026',
};

/** Классическая ошибка vision: платёж перепутан с общей суммой. */
const BROKEN_RAW = { ...GOOD_RAW, monthly_payment: '360 000 ₸' };

/** Подставная модель: отдаёт заготовленные ответы по очереди. */
function fakeModel(...responses) {
  const calls = [];
  const invoke = async (body) => {
    calls.push(body);
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return next;
  };
  return { invoke, calls };
}

describe('checkArithmetic — проверка платёж × срок ≈ сумма', () => {
  it('сходится → ok', () => {
    const check = checkArithmetic(normalizeExtract(GOOD_RAW));
    expect(check.ok).toBe(true);
  });

  it('не сходится → показывает расхождение', () => {
    const check = checkArithmetic(normalizeExtract(BROKEN_RAW));
    expect(check.ok).toBe(false);
    // 360 000 × 24 = 8 640 000 против 360 000
    expect(Math.abs(check.diff)).toBeGreaterThan(0);
  });

  it('КЛЮЧЕВОЕ: не хватает данных → null, а не «проверка провалена»', () => {
    // Путать «не смогли проверить» и «проверка не прошла» нельзя:
    // во втором случае мы бы обвинили модель в ошибке, которой не было
    const partial = normalizeExtract({ ...GOOD_RAW, monthly_payment: null });
    expect(checkArithmetic(partial)).toBeNull();
  });
});

describe('scoreExtraction — оценка качества', () => {
  it('сходящаяся арифметика перевешивает лишнее заполненное поле', () => {
    const consistent = normalizeExtract({ ...GOOD_RAW, first_due_date: null });
    const contradictory = normalizeExtract(BROKEN_RAW);

    // У второго заполнено больше полей, но числа противоречат друг другу
    expect(scoreExtraction(consistent)).toBeGreaterThan(scoreExtraction(contradictory));
  });

  it('пустой результат — ноль', () => {
    expect(scoreExtraction(normalizeExtract({}))).toBe(0);
  });
});

describe('planRepair — решение о втором проходе', () => {
  it('всё сошлось → второй проход не нужен', () => {
    expect(planRepair(normalizeExtract(GOOD_RAW)).needed).toBe(false);
  });

  it('арифметика не сошлась → просим перечитать, с конкретными числами', () => {
    const plan = planRepair(normalizeExtract(BROKEN_RAW));

    expect(plan.needed).toBe(true);
    expect(plan.reason).toBe('arithmetic');
    // Замечание должно содержать сами числа, иначе модели не за что зацепиться
    expect(plan.hint).toContain(MONEY_360K);
    expect(plan.hint).toContain('24');
    expect(plan.hint).toMatch(/не подгоняй/i);
  });

  it('пропущено ключевое поле → просим найти именно его', () => {
    const plan = planRepair(normalizeExtract({ ...GOOD_RAW, first_due_date: null }));

    expect(plan.needed).toBe(true);
    expect(plan.reason).toBe('missing');
    expect(plan.hint).toContain('firstDueDate');
  });

  it('противоречие приоритетнее пропуска: неверное число опаснее пустого', () => {
    const plan = planRepair(normalizeExtract({ ...BROKEN_RAW, first_due_date: null }));
    expect(plan.reason).toBe('arithmetic');
  });
});

describe('chooseBetter — второй проход не может ухудшить', () => {
  it('второй лучше → берём его', () => {
    const choice = chooseBetter(normalizeExtract(BROKEN_RAW), normalizeExtract(GOOD_RAW));
    expect(choice.usedPass).toBe(2);
    expect(choice.improved).toBe(true);
  });

  it('ГАРАНТИЯ: второй хуже → остаётся первый', () => {
    const choice = chooseBetter(normalizeExtract(GOOD_RAW), normalizeExtract(BROKEN_RAW));
    expect(choice.usedPass).toBe(1);
    expect(choice.data.monthlyPayment).toBe(15000);
  });

  it('ничья → остаётся первый, лишней замены не делаем', () => {
    const choice = chooseBetter(normalizeExtract(GOOD_RAW), normalizeExtract(GOOD_RAW));
    expect(choice.usedPass).toBe(1);
    expect(choice.improved).toBe(false);
  });
});

describe('extractWithRepair — цепочка целиком', () => {
  it('с первого раза всё сошлось → к модели обращаемся один раз', async () => {
    const model = fakeModel(GOOD_RAW);
    const result = await extractWithRepair({ image: 'x', mimeType: 'image/png' }, model);

    expect(result.passes).toBe(1);
    expect(result.repaired).toBe(false);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].hint).toBeUndefined(); // первый проход идёт без замечаний
  });

  it('ГЛАВНОЕ: модель ошиблась → код заставил перечитать и данные починились', async () => {
    const model = fakeModel(BROKEN_RAW, GOOD_RAW);
    const result = await extractWithRepair({ image: 'x', mimeType: 'image/png' }, model);

    expect(result.passes).toBe(2);
    expect(result.repaired).toBe(true);
    expect(result.repairReason).toBe('arithmetic');
    expect(result.data.monthlyPayment).toBe(15000); // взято из второго прохода
    expect(result.check.ok).toBe(true);

    // Во второй раз модель получила замечание с числами — это и есть цепочка
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].hint).toContain(MONEY_360K);
  });

  it('модель ошиблась дважды → отдаём лучшее, но честно помечаем', async () => {
    const model = fakeModel(BROKEN_RAW, BROKEN_RAW);
    const result = await extractWithRepair({ image: 'x', mimeType: 'image/png' }, model);

    expect(result.passes).toBe(2);
    expect(result.repaired).toBe(false);
    expect(result.check.ok).toBe(false); // человек увидит предупреждение в форме
  });

  it('второй проход не делает хуже, даже если модель во второй раз сломалась', async () => {
    const model = fakeModel(GOOD_RAW, BROKEN_RAW);
    const result = await extractWithRepair({ image: 'x', mimeType: 'image/png' }, model);

    // Первый проход был хорош → второго вообще не запускаем
    expect(model.calls).toHaveLength(1);
    expect(result.data.monthlyPayment).toBe(15000);
  });

  it('второй проход сорвался (квота/сеть) → отдаём первый, а не падаем', async () => {
    const model = fakeModel(BROKEN_RAW, new Error('429 quota'));
    const result = await extractWithRepair({ image: 'x', mimeType: 'image/png' }, model);

    expect(result.passes).toBe(1);
    expect(result.data.priceInstallment).toBe(360000);
    expect(result.repairReason).toBe('arithmetic'); // видно, что починку пытались
  });

  it('потолок два прохода: третий раз не пробуем даже при ошибке', async () => {
    const model = fakeModel(BROKEN_RAW, BROKEN_RAW, GOOD_RAW);
    await extractWithRepair({ image: 'x', mimeType: 'image/png' }, model);

    expect(model.calls).toHaveLength(2);
  });
});
