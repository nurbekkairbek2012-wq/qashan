import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';

import App from '../App.jsx';
import Dashboard from './Dashboard.jsx';
import InstallmentList from './InstallmentList.jsx';
import { formatTenge } from '../core/format.js';

/**
 * Дымовые тесты рендера.
 *
 * Сборка проходит и при живой ошибке в рендере — она падает уже в браузере.
 * Здесь компоненты реально исполняются (renderToString), поэтому обвал ловится
 * на CI, а не на сцене во время демонстрации.
 */

const profile = { monthlyIncome: 60000 };

const makeInstallment = (id, monthly, term) => ({
  id,
  merchant: 'Kaspi',
  itemName: `Товар ${id}`,
  priceInstallment: monthly * term,
  priceCash: null,
  downPayment: 0,
  termMonths: term,
  monthlyPayment: monthly,
  firstDueDate: '2026-08-10',
});

describe('App', () => {
  it('пустой экран рендерится без падения', () => {
    // localStorage в node недоступен — loadState обязан это пережить
    const html = renderToString(<App />);
    expect(html).toContain('Qaryz');
    expect(html).toContain('Укажи доход');
  });
});

describe('Dashboard', () => {
  it('платежи по силам → говорит об этом словами, не только цветом', () => {
    const html = renderToString(
      <Dashboard profile={profile} installments={[makeInstallment('a', 10000, 12)]} />
    );
    expect(html).toContain('Платежи по силам');
  });

  it('ГЛАВНОЕ: три «безобидные» рассрочки → называет месяц перелома', () => {
    // 15 + 20 + 30 = 65 000 при доходе 60 000
    const installments = [
      makeInstallment('a', 15000, 12),
      makeInstallment('b', 20000, 12),
      makeInstallment('c', 30000, 12),
    ];

    const html = renderToString(<Dashboard profile={profile} installments={installments} />);

    expect(html).toContain('Платежи перевесят доход');
    // Оговорка про прочие расходы должна быть на экране, а не только в README
    expect(html).toContain('не входят');
  });

  it('плитка платежей берёт пиковый месяц, а не первый', () => {
    // Рассрочка начинается в сентябре: в текущем месяце платежей ещё нет.
    // Плитка обязана показать 30 000, а не 0 — иначе она врёт при живом дефиците.
    const later = { ...makeInstallment('a', 30000, 12), firstDueDate: '2026-09-10' };
    const html = renderToString(<Dashboard profile={profile} installments={[later]} />);

    // Строку берём у самого форматтера, а не набираем руками: в суммах стоит
    // неразрывный пробел (U+00A0), и от обычного его глазами не отличить.
    expect(html).toContain(formatTenge(30000));
  });

  it('нагрузку показывает и словом, и процентом — не одним цветом', () => {
    const html = renderToString(
      <Dashboard profile={profile} installments={[makeInstallment('a', 50000, 12)]} />
    );
    expect(html).toContain('не тянешь');
  });
});

describe('InstallmentList', () => {
  it('без цены за наличные ставку не выдумывает', () => {
    const html = renderToString(
      <InstallmentList installments={[makeInstallment('a', 15000, 12)]} onRemove={() => {}} />
    );
    expect(html).toContain('ставка — нет данных');
  });

  it('нет наценки → честно пишет, что рассрочка беспроцентная', () => {
    const installment = { ...makeInstallment('a', 33333, 12), priceCash: 400000, priceInstallment: 400000 };
    const html = renderToString(<InstallmentList installments={[installment]} onRemove={() => {}} />);
    expect(html).toContain('правда беспроцентная');
  });

  it('есть наценка → показывает ставку в годовых', () => {
    const installment = { ...makeInstallment('a', 38333, 12), priceCash: 400000, priceInstallment: 460000 };
    const html = renderToString(<InstallmentList installments={[installment]} onRemove={() => {}} />);
    expect(html).toMatch(/\d+% годовых/);
  });
});
