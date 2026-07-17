/**
 * Генератор тестовой фикстуры для vision-парсера.
 *
 * ЧТО ЭТО. Нарисованный макет экрана рассрочки — не скриншот реального
 * приложения. Намеренно обобщённый: чужую вёрстку и логотипы не копируем,
 * это был бы поддельный экран чужого продукта. Для проверки парсера бренд
 * не важен — важны русские подписи, формат сумм и разделители.
 *
 * ЧЕГО ЭТА ФИКСТУРА НЕ ДОКАЗЫВАЕТ. Макет рисовали мы, парсер писали тоже мы,
 * так что распознавание на нём — почти гарантия. Это проверка «цепочка
 * собрана и работает end-to-end», а не «парсер справится с чем угодно».
 * Настоящую вёрстку он не видел.
 *
 * Что здесь всё-таки не поддавки:
 *   · неразрывные пробелы U+00A0 в суммах — на них парсер уже один раз падал;
 *   · валюта после числа, дата в формате ДД.ММ.ГГГГ, срок словами;
 *   · инвариант платёж × срок = сумма сходится — валидатор должен молчать.
 *
 * Запуск:  node scripts/make-fixture.mjs
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'test-fixtures');

// Неразрывный пробел — именно его подставляют банки, чтобы «15 000 ₸»
// не разрывалось переносом строки. \s его не ловит.
const NB = ' ';

/** Данные макета. Инвариант сходится: 15 000 × 12 = 180 000. */
const DATA = {
  merchant: 'TechnoMart',
  itemName: 'Наушники беспроводные',
  priceInstallment: `180${NB}000${NB}₸`,
  downPayment: `0${NB}₸`,
  termMonths: '12 месяцев',
  monthlyPayment: `15${NB}000${NB}₸`,
  firstDueDate: '10.08.2026',
};

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="390" height="620" viewBox="0 0 390 620">
  <rect width="390" height="620" fill="#f2f2f5"/>

  <!-- Шапка -->
  <rect width="390" height="88" fill="#ffffff"/>
  <text x="24" y="38" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#8a8f98">Рассрочка</text>
  <text x="24" y="64" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600" fill="#12151c">${DATA.merchant}</text>

  <!-- Карточка товара -->
  <rect x="16" y="104" width="358" height="92" rx="14" fill="#ffffff"/>
  <rect x="32" y="120" width="60" height="60" rx="10" fill="#e4e4e0"/>
  <text x="106" y="146" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="500" fill="#12151c">${DATA.itemName}</text>
  <text x="106" y="170" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="600" fill="#12151c">${DATA.priceInstallment}</text>

  <!-- Условия -->
  <rect x="16" y="212" width="358" height="212" rx="14" fill="#ffffff"/>
  <text x="32" y="242" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#8a8f98">Условия рассрочки</text>

  <text x="32"  y="280" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#6b7280">Первоначальный взнос</text>
  <text x="358" y="280" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="500" fill="#12151c" text-anchor="end">${DATA.downPayment}</text>

  <text x="32"  y="318" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#6b7280">Срок</text>
  <text x="358" y="318" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="500" fill="#12151c" text-anchor="end">${DATA.termMonths}</text>

  <text x="32"  y="356" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#6b7280">Ежемесячный платёж</text>
  <text x="358" y="356" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600" fill="#12151c" text-anchor="end">${DATA.monthlyPayment}</text>

  <text x="32"  y="394" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#6b7280">Первый платёж</text>
  <text x="358" y="394" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="500" fill="#12151c" text-anchor="end">${DATA.firstDueDate}</text>

  <!-- Подпись, которую любят рисовать в таких экранах -->
  <rect x="16" y="440" width="358" height="52" rx="14" fill="#e7f4ef"/>
  <text x="32" y="472" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#15795c">0-0-12 · без переплаты</text>

  <!-- Штамп: это макет, а не реальный экран -->
  <text x="195" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#b0b4bb" text-anchor="middle">
    Тестовый макет Qashan · не скриншот реального приложения
  </text>
</svg>
`;

await mkdir(outDir, { recursive: true });

const outPath = join(outDir, 'installment-mockup.png');
await sharp(Buffer.from(svg)).png().toFile(outPath);

console.log('Фикстура собрана:', outPath);
console.log('Ожидаемый разбор:');
console.log('  merchant          TechnoMart');
console.log('  priceInstallment  180000');
console.log('  downPayment       0');
console.log('  termMonths        12');
console.log('  monthlyPayment    15000');
console.log('  firstDueDate      2026-08-10');
console.log('  инвариант         15000 × 12 = 180000 ✓');
