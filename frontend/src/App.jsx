import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import InstallmentForm from './components/InstallmentForm.jsx';
import InstallmentList from './components/InstallmentList.jsx';
import WhatIfSimulator from './components/WhatIfSimulator.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import ScreenshotUpload from './components/ScreenshotUpload.jsx';
import { useAuth } from './context/AuthContext.jsx';
import * as repo from './lib/repository.js';
import { formatTenge } from './core/format.js';

/**
 * Qaryz — оболочка приложения.
 *
 * Источник данных выбирает репозиторий: вошёл — Supabase, нет — localStorage.
 * App этого не знает, вызывает repo.* и получает одну структуру. Поэтому вход
 * остаётся необязательным: основная ценность (расчёты, симулятор) работает
 * без аккаунта, а на защите демо не зависит от того, поднята ли база.
 *
 * Данных «для демо» в коде нет: всё на экране ввёл человек. Пустой первый
 * экран честнее выдуманных рассрочек выдуманного студента.
 */

export default function App() {
  const { user, loading } = useAuth();

  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [installments, setInstallments] = useState([]);
  const [prefill, setPrefill] = useState(null);
  const [ready, setReady] = useState(false);

  // При входе/выходе перечитываем из нужного источника. user в зависимостях:
  // сменился аккаунт — сменились данные.
  useEffect(() => {
    if (loading) return;
    let alive = true;
    repo.loadState(user).then((state) => {
      if (!alive) return;
      setMonthlyIncome(state.monthlyIncome);
      setInstallments(state.installments);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [user, loading]);

  const income = Number(monthlyIncome) || 0;
  const canSimulate = income > 0 && installments.length > 0;

  const currentState = { monthlyIncome, installments };

  const handleIncome = (value) => {
    setMonthlyIncome(value);
    repo.saveIncome(user, value, { ...currentState, monthlyIncome: value });
  };

  const handleAdd = async (installment) => {
    const saved = await repo.addInstallment(user, installment, currentState);
    setInstallments((list) => [...list, saved]);
    setPrefill(null);
  };

  const handleRemove = async (id) => {
    await repo.removeInstallment(user, id, currentState);
    setInstallments((list) => list.filter((item) => item.id !== id));
  };

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
        <section className="rounded-xl border border-line bg-surface p-4">
          <AuthPanel />
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <label className="block">
            <span className="text-sm font-medium text-ink">Твой доход в месяц, ₸</span>
            <span className="ml-1.5 text-xs text-muted">стипендия, подработка — всё вместе</span>
            <input
              type="number"
              min="0"
              value={monthlyIncome}
              onChange={(event) => handleIncome(event.target.value)}
              placeholder="60000"
              className="tabular mt-1 w-full max-w-xs rounded-lg border border-line px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </label>
          {income > 0 && (
            <p className="tabular mt-2 text-xs text-muted">{formatTenge(income)} в месяц</p>
          )}
        </section>

        {ready && canSimulate ? (
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

        {/* Симулятор работает и без единой рассрочки: первая покупка тоже
            может не потянуться, и узнать об этом лучше до неё. */}
        {income > 0 && (
          <WhatIfSimulator profile={{ monthlyIncome: income }} installments={installments} />
        )}

        <section className="space-y-4">
          <h2 className="text-base font-medium text-ink">
            Твои рассрочки{installments.length > 0 && ` · ${installments.length}`}
          </h2>
          <InstallmentList installments={installments} onRemove={handleRemove} />
        </section>

        {/* Распознавание скриншота: видно только вошедшим (Edge Function
            пускает по токену). Заполняет форму ниже, а не сохраняет напрямую. */}
        <ScreenshotUpload onParsed={(data) => setPrefill(data)} />

        <InstallmentForm onAdd={handleAdd} prefill={prefill} />
      </main>

      <footer className="mx-auto max-w-4xl px-6 pb-10 text-xs text-muted">
        Прогноз считает только платежи по рассрочкам. Еда, проезд и прочие расходы
        в него не входят — в реальности денег перестанет хватать раньше.
      </footer>
    </div>
  );
}
