import { useState } from 'react';
import { validateInstallment } from '../core/schedule.js';
import { formatTenge } from '../core/format.js';

/**
 * Ручной ввод рассрочки.
 *
 * Пока это единственный способ добавить данные — и это осознанно: реальные
 * цифры вводит живой человек. Распознавание скриншота придёт позже и будет
 * заполнять ровно эти же поля, а не отдельный путь.
 *
 * Цена за наличные необязательна: студент её часто не знает. Без неё просто
 * не считаем ставку — подставлять допущение вместо данных нельзя.
 */

const EMPTY = {
  merchant: '',
  itemName: '',
  priceInstallment: '',
  priceCash: '',
  downPayment: '',
  termMonths: '12',
  monthlyPayment: '',
  firstDueDate: new Date().toISOString().slice(0, 10),
};

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-brand';

export default function InstallmentForm({ onAdd }) {
  const [form, setForm] = useState(EMPTY);
  const [warning, setWarning] = useState(null);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const toInstallment = () => ({
    merchant: form.merchant.trim() || 'Без названия',
    itemName: form.itemName.trim(),
    priceInstallment: Number(form.priceInstallment),
    priceCash: form.priceCash === '' ? null : Number(form.priceCash),
    downPayment: Number(form.downPayment) || 0,
    termMonths: Number(form.termMonths),
    monthlyPayment: Number(form.monthlyPayment),
    firstDueDate: form.firstDueDate,
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    const installment = toInstallment();

    // Инвариант: платёж × срок должен сойтись с суммой. Расхождение не глотаем
    // молча — это деньги. Показываем и даём подтвердить осознанно.
    const check = validateInstallment(installment);
    if (!check.ok && warning === null) {
      setWarning(check);
      return;
    }

    onAdd({ ...installment, id: crypto.randomUUID() });
    setForm(EMPTY);
    setWarning(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-base font-medium text-ink">Добавить рассрочку</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Магазин или банк">
          <input className={inputClass} value={form.merchant} onChange={set('merchant')} placeholder="Kaspi" />
        </Field>
        <Field label="Что купил">
          <input className={inputClass} value={form.itemName} onChange={set('itemName')} placeholder="Наушники" />
        </Field>
        <Field label="Цена в рассрочку, ₸">
          <input
            className={inputClass}
            type="number"
            required
            min="1"
            value={form.priceInstallment}
            onChange={set('priceInstallment')}
          />
        </Field>
        <Field label="Цена за наличные, ₸" hint="если знаешь — посчитаем реальную ставку">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={form.priceCash}
            onChange={set('priceCash')}
            placeholder="необязательно"
          />
        </Field>
        <Field label="Первоначальный взнос, ₸">
          <input className={inputClass} type="number" min="0" value={form.downPayment} onChange={set('downPayment')} placeholder="0" />
        </Field>
        <Field label="Срок, месяцев">
          <input className={inputClass} type="number" required min="1" max="60" value={form.termMonths} onChange={set('termMonths')} />
        </Field>
        <Field label="Платёж в месяц, ₸">
          <input
            className={inputClass}
            type="number"
            required
            min="1"
            value={form.monthlyPayment}
            onChange={set('monthlyPayment')}
          />
        </Field>
        <Field label="Дата первого платежа">
          <input className={inputClass} type="date" required value={form.firstDueDate} onChange={set('firstDueDate')} />
        </Field>
      </div>

      {warning && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{ borderColor: 'var(--color-warn)', background: 'var(--color-warn-soft)' }}
        >
          <p className="font-medium" style={{ color: 'var(--color-warn)' }}>
            Цифры не сходятся
          </p>
          <p className="mt-1 text-ink-soft">
            Платёж × срок = {formatTenge(warning.actual)}, а сумма к выплате —{' '}
            {formatTenge(warning.expected)}. Расхождение {formatTenge(Math.abs(warning.diff))}.
            Проверь цифры или нажми ещё раз, чтобы добавить как есть.
          </p>
        </div>
      )}

      <button
        type="submit"
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:opacity-90"
      >
        {warning ? 'Всё равно добавить' : 'Добавить'}
      </button>
    </form>
  );
}
