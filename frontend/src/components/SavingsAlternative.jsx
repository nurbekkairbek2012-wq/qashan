import { savingsPlan } from '../core/savings.js';
import { effectiveRate } from '../core/irr.js';
import { formatTenge, formatMonth, formatMonthsCount, formatPercent } from '../core/format.js';

/**
 * Второй путь: не брать рассрочку, а копить.
 *
 * ЗАЧЕМ ЭТО ЗДЕСЬ, А НЕ НА ДАШБОРДЕ. По уже взятым рассрочкам совет копить
 * бесполезен — поезд ушёл. Смысл есть ровно в одной точке: человек стоит у
 * витрины и ещё не подписал. Поэтому блок живёт в симуляторе «а что если».
 *
 * ТОН. Не морализируем. Ожидание — реальная цена, и мы называем её первой
 * строкой, а не прячем в сноску. Человек имеет право взять рассрочку осознанно;
 * наша работа — чтобы он знал обе цифры, а не чтобы он послушался.
 */

export default function SavingsAlternative({ draft }) {
  const plan = savingsPlan(draft);
  if (!plan) return null;

  const rate = effectiveRate(draft);

  return (
    <div className="mt-4 rounded-xl border border-line bg-brand-soft/40 p-4">
      <p className="text-sm font-semibold text-brand">Если не брать</p>

      <p className="mt-1.5 text-lg font-semibold leading-snug text-ink">
        Откладывай {formatTenge(plan.monthlySaving)} в месяц — купишь в{' '}
        {formatMonth(plan.readyMonth)}, без долга
      </p>

      <p className="mt-1 text-sm text-ink-soft">
        Тот же платёж, только себе, а не банку. Цена решения — ждать{' '}
        {formatMonthsCount(plan.monthsToSave)}.
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {plan.verdict === 'saves-money' && (
          <>
            <div>
              <dt className="text-xs text-muted">Сэкономишь</dt>
              <dd className="tabular font-semibold" style={{ color: 'var(--color-safe)' }}>
                {formatTenge(plan.saved)}
              </dd>
            </div>
            {plan.monthsFreeEarlier > 0 && (
              <div>
                <dt className="text-xs text-muted">Освободишься раньше на</dt>
                <dd className="tabular font-semibold text-ink">
                  {formatMonthsCount(plan.monthsFreeEarlier)}
                </dd>
              </div>
            )}
          </>
        )}

        {/* Реальная ставка — только когда есть с чем сравнивать. Это тот самый
            вопрос «а рассрочка правда беспроцентная?», и ответ на него мы берём
            из данных, а не из убеждения. */}
        {rate.ok && rate.annualRate > 0.001 && (
          <div>
            <dt className="text-xs text-muted">Реальная ставка</dt>
            <dd className="tabular font-semibold" style={{ color: 'var(--color-warn)' }}>
              {formatPercent(rate.annualRate)} годовых
            </dd>
          </div>
        )}
      </dl>

      {plan.verdict === 'no-overpay' && (
        <p className="mt-2 text-sm text-ink-soft">
          Наценки в этой рассрочке нет: копить — те же деньги. Тогда вопрос не в
          переплате, а в том, потянешь ли ты платёж каждый месяц.
        </p>
      )}

      {plan.verdict === 'cash-price-unknown' && (
        <p className="mt-2 text-sm text-ink-soft">
          Сколько сэкономишь — не считаем: не знаем цену этого товара за наличные.
          Впиши её выше, и посчитаем переплату и реальную ставку.
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Считаем без инфляции и без процента на вклад: цена товара за это время
        может вырасти. Значит, экономия выше — это верхняя граница, а не обещание.
      </p>
    </div>
  );
}
