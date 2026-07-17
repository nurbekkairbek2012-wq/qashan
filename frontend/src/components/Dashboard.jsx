import { simulateCashFlow, burdenLevel } from '../core/simulate.js';
import { formatTenge, formatMonth, formatPercent } from '../core/format.js';
import CashflowChart from './CashflowChart.jsx';

/**
 * Дашборд: главный ответ продукта + опора под него.
 *
 * Композиция намеренная. Сверху — ОДИН ответ крупно, словами, потому что человек
 * пришёл с одним вопросом. График ПОД ним, а не вместо: он объясняет ответ.
 * Вывалить график и заставить читателя самого искать пересечение нуля — это
 * переложить на него нашу работу.
 *
 * Ведущий ответ — месяц ДЕФИЦИТА (платежи перевесили доход), а не месяц, когда
 * кончатся деньги. Второе зависит от накоплений, которых мы у человека не
 * спрашивали; подставить туда ноль значило бы выдумать ему подушку.
 */

/** Уровень нагрузки → цвет и подпись. Цвет никогда не идёт без слова. */
const LEVEL_STYLE = {
  safe: { color: 'var(--color-safe)', bg: 'var(--color-safe-soft)', label: 'по силам' },
  warn: { color: 'var(--color-warn)', bg: 'var(--color-warn-soft)', label: 'на пределе' },
  danger: { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', label: 'не тянешь' },
};

function StatTile({ label, value, hint, level }) {
  const style = level ? LEVEL_STYLE[level] : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div
        className="tabular mt-1 text-2xl font-semibold"
        style={{ color: style?.color ?? 'var(--color-ink)' }}
      >
        {value}
      </div>
      {(hint || style) && (
        <div className="mt-1 text-xs text-muted">
          {style && (
            <span
              className="mr-1.5 rounded px-1.5 py-0.5 font-medium"
              style={{ color: style.color, background: style.bg }}
            >
              {style.label}
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ profile, installments }) {
  const { months, firstDeficitMonth, peakBurden } = simulateCashFlow(profile, installments, {
    horizonMonths: 12,
  });

  // Пиковый месяц: там нагрузка максимальна. Именно его сумму платежей и
  // показываем — «платежи в месяц» у первого месяца могут быть нулевыми,
  // если рассрочка начинается позже, и тогда плитка врала бы.
  const peakMonth = months.reduce((worst, m) => (m.due > worst.due ? m : worst), months[0]);
  const level = burdenLevel(peakBurden);

  return (
    <section className="space-y-6">
      {/* ГЛАВНЫЙ ОТВЕТ. Крупно, словами, без графика — за ним и пришли. */}
      <div
        className="rounded-2xl border p-6"
        style={{
          borderColor: firstDeficitMonth ? 'var(--color-danger)' : 'var(--color-line)',
          background: firstDeficitMonth ? 'var(--color-danger-soft)' : 'var(--color-safe-soft)',
        }}
      >
        {firstDeficitMonth ? (
          <>
            <p className="text-sm font-medium text-ink-soft">Платежи перевесят доход в</p>
            <p
              className="mt-1 text-4xl font-semibold tracking-tight"
              style={{ color: 'var(--color-danger)' }}
            >
              {formatMonth(firstDeficitMonth)}
            </p>
            <p className="mt-3 max-w-xl text-sm text-ink-soft">
              В этом месяце на рассрочки уйдёт больше, чем ты получишь. Накопления
              это отсрочат, но не отменят. И считаем мы только платежи — еда,
              проезд и всё остальное сюда не входят, значит на деле будет тяжелее.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-soft">На горизонте 12 месяцев</p>
            <p
              className="mt-1 text-4xl font-semibold tracking-tight"
              style={{ color: 'var(--color-safe)' }}
            >
              Платежи по силам
            </p>
            <p className="mt-3 max-w-xl text-sm text-ink-soft">
              Ни в одном месяце платежи не превышают доход. Но это расчёт только
              по рассрочкам, без прочих расходов — запас меньше, чем кажется.
            </p>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Доход в месяц" value={formatTenge(profile.monthlyIncome)} />
        <StatTile
          label="Платежи в пиковый месяц"
          value={formatTenge(peakMonth.due)}
          hint={`по ${installments.length} рассрочкам`}
        />
        <StatTile
          label="Пиковая нагрузка"
          value={formatPercent(peakBurden)}
          level={level}
          hint="доля дохода"
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <CashflowChart months={months} highlightMonth={firstDeficitMonth} />
      </div>
    </section>
  );
}
