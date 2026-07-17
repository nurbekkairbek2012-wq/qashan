import { effectiveRate } from '../core/irr.js';
import { formatTenge, formatPercent, formatMonthsCount } from '../core/format.js';

/**
 * Список рассрочек с реальной ставкой по каждой.
 *
 * Ставку показываем ТОЛЬКО там, где известна цена за наличные. Где неизвестна —
 * пишем «нет данных» вместо числа. Соблазн подставить допущение здесь велик,
 * но одна выдуманная ставка обесценивает все настоящие.
 */

function RateBadge({ installment }) {
  const rate = effectiveRate(installment);

  if (!rate.ok) {
    return (
      <span className="text-xs text-muted" title={rate.reason}>
        ставка — нет данных
      </span>
    );
  }

  // Ставка около нуля: рассрочка правда беспроцентная. Так и говорим —
  // модель не обязана всюду находить скрытый процент.
  if (Math.abs(rate.annualRate) < 0.005) {
    return (
      <span
        className="rounded px-1.5 py-0.5 text-xs font-medium"
        style={{ color: 'var(--color-safe)', background: 'var(--color-safe-soft)' }}
      >
        0% — правда беспроцентная
      </span>
    );
  }

  const isCost = rate.annualRate > 0;

  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        color: isCost ? 'var(--color-danger)' : 'var(--color-safe)',
        background: isCost ? 'var(--color-danger-soft)' : 'var(--color-safe-soft)',
      }}
      title={`Переплата ${formatTenge(rate.overpay)} сверх цены за наличные`}
    >
      {isCost ? `${formatPercent(rate.annualRate)} годовых` : 'дешевле наличных'}
    </span>
  );
}

export default function InstallmentList({ installments, onRemove }) {
  if (!installments.length) {
    return (
      <div className="rounded-xl border border-dashed border-line p-8 text-center">
        <p className="text-ink-soft">Пока ни одной рассрочки.</p>
        <p className="mt-1 text-sm text-muted">
          Добавь свои — увидишь, когда перестанет хватать.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {installments.map((installment) => (
        <li
          key={installment.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">
                {installment.itemName || installment.merchant}
              </span>
              <RateBadge installment={installment} />
            </div>
            <div className="tabular mt-1 text-sm text-muted">
              {formatTenge(installment.monthlyPayment)} × {formatMonthsCount(installment.termMonths)}
              {' · '}
              {installment.merchant}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRemove(installment.id)}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-danger hover:text-danger"
          >
            Удалить
          </button>
        </li>
      ))}
    </ul>
  );
}
