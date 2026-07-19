import { simulateCashFlow, burdenLevel } from '../core/simulate.js';
import { portfolioSummary } from '../core/portfolio.js';
import { formatTenge, formatMonth, formatPercent, formatMonthsCount } from '../core/format.js';
import CashflowChart from './CashflowChart.jsx';
import DebtCompositionChart from './DebtCompositionChart.jsx';

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
    <div className="h-full rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div
        className="tabular mt-2 text-2xl font-bold tracking-tight"
        style={{ color: style?.color ?? 'var(--color-ink)' }}
      >
        {value}
      </div>
      {(hint || style) && (
        <div className="mt-1.5 text-xs text-muted">
          {style && (
            <span
              className="mr-1.5 rounded-md px-1.5 py-0.5 font-semibold"
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

  const summary = portfolioSummary(installments, profile);

  return (
    <section className="space-y-5">
      {/* ГЛАВНЫЙ ОТВЕТ. Крупно, словами — за ним и пришли. Ключ ставим на
          firstDeficitMonth, чтобы анимация проигрывалась заново, когда ответ
          меняется (добавили рассрочку → месяц перелома сдвинулся). */}
      {firstDeficitMonth ? (
        <div
          key={firstDeficitMonth}
          className="animate-pop relative overflow-hidden rounded-3xl p-7 text-white shadow-card"
          style={{
            background:
              'linear-gradient(135deg, var(--color-danger) 0%, var(--color-danger-deep) 100%)',
          }}
        >
          {/* Декоративное свечение в углу — глубина панели */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
            style={{ background: 'rgba(255,255,255,0.10)' }}
          />
          <p className="relative text-sm font-medium uppercase tracking-wide text-white/80">
            Платежи перевесят доход в
          </p>
          <p className="relative mt-1 text-5xl font-bold leading-none tracking-tight sm:text-6xl">
            {formatMonth(firstDeficitMonth)}
          </p>
          <p className="relative mt-4 max-w-xl text-sm leading-relaxed text-white/85">
            В этом месяце на рассрочки уйдёт больше, чем ты получишь. Накопления
            это отсрочат, но не отменят. Считаем только платежи — еда и проезд сюда
            не входят, значит на деле будет тяжелее.
          </p>
        </div>
      ) : (
        <div
          className="animate-pop rounded-3xl border p-7 shadow-card"
          style={{ borderColor: 'transparent', background: 'var(--color-safe-soft)' }}
        >
          <p className="text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--color-safe)' }}>
            На горизонте 12 месяцев
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight" style={{ color: 'var(--color-safe)' }}>
            Платежи по силам
          </p>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">
            Ни в одном месяце платежи не превышают доход. Но это расчёт только
            по рассрочкам, без прочих расходов — запас меньше, чем кажется.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="animate-rise delay-1">
          <StatTile label="Доход в месяц" value={formatTenge(profile.monthlyIncome)} />
        </div>
        <div className="animate-rise delay-2">
          <StatTile
            label="Платежи в пиковый месяц"
            value={formatTenge(peakMonth.due)}
            hint={`по ${installments.length} рассрочкам`}
          />
        </div>
        <div className="animate-rise delay-3">
          <StatTile
            label="Пиковая нагрузка"
            value={formatPercent(peakBurden)}
            level={level}
            hint="доля дохода"
          />
        </div>
      </div>

      {/* СОВОКУПНАЯ КАРТИНА — то, чего не показывает ни одно банковское
          приложение, потому что каждое видит только свою рассрочку.

          Ведущая цифра здесь — долг, выраженный В МЕСЯЦАХ ДОХОДА. «287 000 ₸»
          для человека абстрактно; «4,8 месяца твоего дохода целиком» — тот же
          факт в единицах, которыми он живёт. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="animate-rise delay-3">
          <StatTile
            label="Отдать осталось"
            value={formatTenge(summary.totalRemaining)}
            hint={
              Number.isFinite(summary.incomeMonths)
                ? `это ${formatMonthsCount(Math.round(summary.incomeMonths))} твоего дохода целиком`
                : undefined
            }
          />
        </div>
        <div className="animate-rise delay-3">
          <StatTile
            label="Свободен от рассрочек"
            value={summary.lastPaymentMonth ? formatMonth(summary.lastPaymentMonth) : '—'}
            hint="месяц последнего платежа"
          />
        </div>
        <div className="animate-rise delay-3">
          {/* Переплату показываем ТОЛЬКО там, где известна цена за наличные.
              Где неизвестна — не пишем ноль (это читалось бы как «наценки нет»),
              а прямо говорим, что данных не хватает. Это и есть непроверенная
              гипотеза проекта: мы её не подтверждаем задним числом. */}
          <StatTile
            label="Переплата"
            value={summary.knownOverpay > 0 ? formatTenge(summary.knownOverpay) : '—'}
            hint={
              summary.unknownCashPrice > 0
                ? `у ${summary.unknownCashPrice} из ${summary.count} нет цены за наличные — там не считали`
                : 'сверх цены за наличные'
            }
          />
        </div>
      </div>

      <div className="animate-rise delay-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <CashflowChart months={months} highlightMonth={firstDeficitMonth} />
      </div>

      {/* Разбивка по рассрочкам нужна только когда их несколько: при одной
          составной график вырождается в обычный и ничего не добавляет. */}
      {installments.length > 1 && (
        <div className="animate-rise delay-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <DebtCompositionChart
            installments={installments}
            monthKeys={months.map((m) => m.key)}
            income={profile.monthlyIncome}
          />
        </div>
      )}
    </section>
  );
}
