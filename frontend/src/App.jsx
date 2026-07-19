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
import { DEMO_INCOME, makeDemoInstallments } from './core/demoData.js';

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

  // Заполнить примером — для живого демо и записи видео, чтобы не вводить
  // цифры руками. Данные помечены как пример в самих названиях магазинов
  // и в подписи, никто не примет их за реальные.
  const handleLoadDemo = async () => {
    const demo = makeDemoInstallments();
    setMonthlyIncome(DEMO_INCOME);
    setInstallments(demo);
    // Сохраняем через репозиторий, чтобы пример вёл себя как настоящие данные
    // (в т.ч. синхронизировался, если пользователь вошёл).
    repo.saveIncome(user, DEMO_INCOME, { monthlyIncome: DEMO_INCOME, installments: demo });
    for (const item of demo) {
      await repo.addInstallment(user, item, { monthlyIncome: DEMO_INCOME, installments: demo });
    }
  };

  const handleClear = async () => {
    for (const item of installments) {
      await repo.removeInstallment(user, item.id, currentState);
    }
    setInstallments([]);
    setMonthlyIncome('');
    repo.saveIncome(user, '', { monthlyIncome: '', installments: [] });
  };

  const hasData = installments.length > 0 || income > 0;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))' }}
              aria-hidden="true"
            >
              Q
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-ink">Qaryz</span>
              <span className="hidden text-sm text-muted sm:inline">когда перестанет хватать</span>
            </div>
          </div>
          {hasData ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:text-danger"
            >
              Очистить
            </button>
          ) : (
            <span className="text-xs text-muted">Tech Vision 2026</span>
          )}
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
          <div className="animate-rise overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
            <div className="p-8 sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand">
                Одна рассрочка · вторая · третья
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
                Каждая по отдельности — «всего 15 000 в месяц».
                <br className="hidden sm:block" />
                <span style={{ color: 'var(--color-danger)' }}> Вместе они съедают весь доход.</span>
              </h2>
              <p className="mt-4 max-w-xl text-base text-ink-soft">
                Банк показывает, сколько ты должен. Никто не показывает,
                <strong className="text-ink"> когда ты не потянешь</strong>. Qaryz
                складывает все рассрочки и называет месяц, в котором денег перестанет
                хватать.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-transform hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))' }}
                >
                  Показать на примере →
                </button>
                <span className="text-xs text-muted">
                  три «безобидные» рассрочки на демо-данных
                </span>
              </div>
            </div>
            {/* Мини-иллюстрация: три растущих столбца платежей, переваливающих
                за линию дохода — визуальный эквивалент боли. */}
            <div className="flex items-end gap-2 border-t border-line bg-brand-soft/40 px-8 py-6 sm:px-10">
              {[38, 55, 78, 96].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${h}px`,
                      background:
                        h > 80
                          ? 'linear-gradient(var(--color-danger), var(--color-danger-deep))'
                          : 'linear-gradient(var(--color-brand), var(--color-brand-deep))',
                    }}
                  />
                </div>
              ))}
            </div>
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

        {!hasData && (
          <button
            type="button"
            onClick={handleLoadDemo}
            className="text-sm font-medium text-brand hover:underline"
          >
            или заполнить примером для демонстрации →
          </button>
        )}

        <InstallmentForm onAdd={handleAdd} prefill={prefill} />
      </main>

      <footer className="mx-auto max-w-4xl px-6 pb-10 text-xs text-muted">
        Прогноз считает только платежи по рассрочкам. Еда, проезд и прочие расходы
        в него не входят — в реальности денег перестанет хватать раньше.
      </footer>
    </div>
  );
}
