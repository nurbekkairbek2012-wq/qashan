import { useState } from 'react';
import { formatTenge, formatMonth, formatMonthShort } from '../core/format.js';

/**
 * Сколько остаётся после платежей — по месяцам.
 *
 * ЧТО ИМЕННО РИСУЕМ: net за месяц (доход − платежи), а НЕ накопленный баланс.
 * Разница принципиальная. Накопленный баланс зависит от того, сколько у человека
 * отложено, а мы этого не знаем: подставив ноль, мы бы дарили ему доход первого
 * месяца (в нём платежей ещё нет) и рисовали ложную подушку. net от накоплений
 * не зависит — это структурный факт: тянет он платежи в этом месяце или нет.
 *
 * ФОРМА. Вопрос «выше или ниже нуля», а не «какая величина» → расходящиеся
 * столбцы вокруг нулевой линии.
 *
 * ЦВЕТ. Синий сверху, красный снизу. Зелёный/красный для денег напрашивается,
 * но проверен и отвергнут: CVD-различимость ΔE 4.1 при норме ≥8 — при
 * дейтеранопии это один цвет. Синий/красный дают 21.6.
 *
 * Серия одна — легенды нет, её называет заголовок. Первый месяц дефицита обведён
 * и подписан жирным: смысл не должен держаться на одном цвете.
 */

const VIEW = { width: 720, height: 260 };
const PAD = { top: 28, right: 16, bottom: 34, left: 64 };

const PLOT = {
  width: VIEW.width - PAD.left - PAD.right,
  height: VIEW.height - PAD.top - PAD.bottom,
};

/**
 * Путь столбца со скруглением ТОЛЬКО на дальнем от нуля конце.
 * У базовой линии угол острый — столбец выходит из оси, а не лежит рядом.
 */
function barPath(x, y, width, height, pointsUp) {
  if (height <= 0) return '';
  const r = Math.min(4, height / 2, width / 2);

  if (pointsUp) {
    const bottom = y + height;
    return `M${x},${bottom} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${bottom} Z`;
  }

  const bottom = y + height;
  return `M${x},${y} L${x},${bottom - r} Q${x},${bottom} ${x + r},${bottom} L${x + width - r},${bottom} Q${x + width},${bottom} ${x + width},${bottom - r} L${x + width},${y} Z`;
}

/** Округляет край шкалы вверх до «круглого» числа, чтобы подписи оси читались. */
function niceCeil(value) {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export default function CashflowChart({ months, highlightMonth }) {
  const [hovered, setHovered] = useState(null);

  if (!months.length) return null;

  const values = months.map((m) => m.net);
  const top = niceCeil(Math.max(0, ...values)) || 1;
  const bottom = -niceCeil(Math.abs(Math.min(0, ...values)));
  const span = top - bottom || 1;

  const yOf = (value) => PAD.top + ((top - value) / span) * PLOT.height;
  const zeroY = yOf(0);

  const step = PLOT.width / months.length;
  const barWidth = Math.min(step * 0.62, 44);
  const hoveredMonth = hovered === null ? null : months[hovered];

  // Ноль показываем всегда: без него «выше/ниже» теряет точку отсчёта
  const ticks = [...new Set([top, 0, bottom])];

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-base font-medium text-ink">
        Сколько остаётся после платежей
      </figcaption>
      <p className="mb-4 text-sm text-muted">
        Доход минус платежи за месяц. Ниже нуля — платежи перевесили доход.
      </p>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="w-full"
          role="img"
          aria-label="Столбцы: остаток после платежей по месяцам относительно нуля"
        >
          {/* Зона опасности: всё, что ниже нуля, тонирована красным. Провал
              столбца в эту область читается сразу, ещё до чтения подписей. */}
          {zeroY < PAD.top + PLOT.height && (
            <rect
              x={PAD.left}
              y={zeroY}
              width={PLOT.width}
              height={PAD.top + PLOT.height - zeroY}
              fill="var(--color-neg)"
              opacity="0.07"
            />
          )}

          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                y1={yOf(value)}
                x2={PAD.left + PLOT.width}
                y2={yOf(value)}
                stroke={value === 0 ? 'var(--color-axis)' : 'var(--color-grid)'}
                strokeWidth={value === 0 ? 1.5 : 1}
              />
              <text
                x={PAD.left - 10}
                y={yOf(value) + 4}
                textAnchor="end"
                className="tabular"
                fill="var(--color-muted)"
                fontSize="11"
              >
                {value === 0 ? '0' : `${Math.round(value / 1000)}к`}
              </text>
            </g>
          ))}

          {months.map((month, i) => {
            const x = PAD.left + i * step + (step - barWidth) / 2;
            const pointsUp = month.net >= 0;
            const y = pointsUp ? yOf(month.net) : zeroY;
            const height = Math.abs(yOf(month.net) - zeroY);
            const isHighlight = month.key === highlightMonth;

            return (
              <g key={month.key}>
                <path
                  d={barPath(x, y, barWidth, height, pointsUp)}
                  fill={pointsUp ? 'var(--color-pos)' : 'var(--color-neg)'}
                  opacity={hovered === null || hovered === i ? 1 : 0.45}
                />

                {isHighlight && (
                  <path
                    d={barPath(x, y, barWidth, height, pointsUp)}
                    fill="none"
                    stroke="var(--color-ink)"
                    strokeWidth="2"
                  />
                )}

                <text
                  x={x + barWidth / 2}
                  y={VIEW.height - 12}
                  textAnchor="middle"
                  fill={isHighlight ? 'var(--color-ink)' : 'var(--color-muted)'}
                  fontWeight={isHighlight ? 600 : 400}
                  fontSize="11"
                >
                  {formatMonthShort(month.key)}
                </text>

                {/* Зона наведения шире столбца — попасть должно быть легко */}
                <rect
                  x={PAD.left + i * step}
                  y={PAD.top}
                  width={step}
                  height={PLOT.height}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}
        </svg>

        {hoveredMonth && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{
              left: `${((PAD.left + hovered * step + step / 2) / VIEW.width) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-medium text-ink">{formatMonth(hoveredMonth.key)}</div>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 text-xs">
              <dt className="text-muted">Доход</dt>
              <dd className="tabular text-right text-ink">{formatTenge(hoveredMonth.income)}</dd>
              <dt className="text-muted">Платежи</dt>
              <dd className="tabular text-right text-ink">{formatTenge(hoveredMonth.due)}</dd>
              <dt className="text-muted">Остаётся</dt>
              <dd
                className="tabular text-right font-medium"
                style={{ color: hoveredMonth.net < 0 ? 'var(--color-neg)' : 'var(--color-ink)' }}
              >
                {formatTenge(hoveredMonth.net)}
              </dd>
            </dl>
          </div>
        )}
      </div>
    </figure>
  );
}
