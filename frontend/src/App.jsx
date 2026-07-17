import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import InstallmentForm from './components/InstallmentForm.jsx';
import InstallmentList from './components/InstallmentList.jsx';
import { formatTenge } from './core/format.js';

/**
 * Qaryz — оболочка приложения.
 *
 * Состояние пока локальное (localStorage), Supabase придёт следующим шагом.
 * Данных «для демо» в коде нет и не будет: всё, что видно на экране, ввёл
 * живой человек. Пустой экран при первом заходе — честнее, чем выдуманные
 * рассрочки выдуманного студента.
 */

const STORAGE_KEY = 'qaryz.state.v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Битый localStorage не должен ронять приложение — просто начинаем с нуля
    return null;
  }
}

export default function App() {
  const saved = loadState();
  const [monthlyIncome, setMonthlyIncome] = useState(saved?.monthlyIncome ?? '');
  const [installments, setInstallments] = useState(saved?.installments ?? []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ monthlyIncome, installments }));
  }, [monthlyIncome, installments]);

  const income = Number(monthlyIncome) || 0;
  const canSimulate = income > 0 && installments.length > 0;

  const addInstallment = (installment) => setInstallments((list) => [...list, installment]);
  const removeInstallment = (id) =>
    setInstallments((list) => list.filter((item) => item.id !== id));

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight text-ink">Qaryz</span>
            <span className="text-sm text-muted">когда перестанет хватать</span>
          </div>
          <span className="text-xs text-muted">Tech Vision 2026</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <section className="rounded-xl border border-line bg-surface p-5">
          <label className="block">
            <span className="text-sm font-medium text-ink">Твой доход в месяц, ₸</span>
            <span className="ml-1.5 text-xs text-muted">стипендия, подработка — всё вместе</span>
            <input
              type="number"
              min="0"
              value={monthlyIncome}
              onChange={(event) => setMonthlyIncome(event.target.value)}
              placeholder="60000"
              className="tabular mt-1 w-full max-w-xs rounded-lg border border-line px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </label>
          {income > 0 && (
            <p className="tabular mt-2 text-xs text-muted">{formatTenge(income)} в месяц</p>
          )}
        </section>

        {canSimulate ? (
          <Dashboard profile={{ monthlyIncome: income }} installments={installments} />
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="text-lg text-ink">Укажи доход и добавь рассрочки</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Каждая рассрочка по отдельности выглядит подъёмной. Qaryz складывает
              их вместе и показывает месяц, в котором денег перестанет хватать.
            </p>
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-base font-medium text-ink">
            Твои рассрочки{installments.length > 0 && ` · ${installments.length}`}
          </h2>
          <InstallmentList installments={installments} onRemove={removeInstallment} />
        </section>

        <InstallmentForm onAdd={addInstallment} />
      </main>

      <footer className="mx-auto max-w-4xl px-6 pb-10 text-xs text-muted">
        Прогноз считает только платежи по рассрочкам. Еда, проезд и прочие расходы
        в него не входят — в реальности денег перестанет хватать раньше.
      </footer>
    </div>
  );
}
