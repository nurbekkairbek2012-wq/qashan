/**
 * parse-installment — распознавание экрана рассрочки.
 *
 * ЗАЧЕМ ЭТО НА СЕРВЕРЕ. Ключ Gemini секретный. На клиенте он попал бы в бандл,
 * и его вытащил бы любой, кто открыл DevTools — репозиторий у нас публичный.
 * Здесь ключ живёт в секретах Supabase и наружу не выходит.
 *
 * ГРАНИЦА ОТВЕТСТВЕННОСТИ. Функция возвращает СЫРЫЕ строки, как их увидела
 * модель. Ни числа, ни даты, ни расчёты: превращение «180 000 ₸» → 180000
 * делает normalize.js на клиенте, где оно покрыто тестами. Языковая модель
 * ошибается в арифметике, и деньги ей не доверяем.
 *
 * Вызов только для вошедших: иначе любой желающий сожжёт нашу квоту.
 */

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const MODEL = 'gemini-2.5-flash';

/** Максимум для картинки. Скриншот телефона весит ~1 МБ; 6 МБ — с запасом. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Модель ОПИСЫВАЕТ увиденное строками — ровно как на экране.
 * Явный запрет на догадки: пустое поле честнее выдуманного числа.
 */
const PROMPT = `Ты извлекаешь данные из экрана рассрочки.

Верни поля СТРОКАМИ ровно так, как они написаны на изображении — вместе с
пробелами, символом валюты и любыми обозначениями. Ничего не пересчитывай,
не переводи в числа и не приводи к другому формату. Преобразованием займётся код.

Если поля на изображении нет — верни null. Не угадывай и не выводи значение
из других полей.

price_cash — цена за наличные. На экранах рассрочки её обычно НЕТ.
Если не видишь явной цены за наличные — верни null.`;

const SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string', nullable: true },
    item_name: { type: 'string', nullable: true },
    price_installment: { type: 'string', nullable: true },
    price_cash: { type: 'string', nullable: true },
    down_payment: { type: 'string', nullable: true },
    term_months: { type: 'string', nullable: true },
    monthly_payment: { type: 'string', nullable: true },
    first_due_date: { type: 'string', nullable: true },
  },
  required: ['merchant', 'price_installment', 'term_months', 'monthly_payment'],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Проверяем токен Supabase: функция не должна быть открытой дверью к нашей квоте. */
async function isAuthenticated(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY ?? '' },
  });

  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Только POST' }, 405);

  if (!GEMINI_KEY) {
    // Явная ошибка вместо тихого падения: без ключа функция бессмысленна
    return json({ error: 'GEMINI_API_KEY не задан в секретах проекта' }, 500);
  }

  if (!(await isAuthenticated(req.headers.get('Authorization')))) {
    return json({ error: 'Нужно войти' }, 401);
  }

  let payload: { image?: string; mimeType?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Тело запроса — не JSON' }, 400);
  }

  const { image, mimeType = 'image/png' } = payload;

  if (!image) return json({ error: 'Нет поля image (base64)' }, 400);
  if (!ALLOWED_MIME.has(mimeType)) {
    return json({ error: `Формат ${mimeType} не поддерживается` }, 400);
  }

  // base64 раздувает данные примерно на треть — считаем исходный размер
  if (image.length * 0.75 > MAX_IMAGE_BYTES) {
    return json({ error: 'Картинка больше 6 МБ' }, 413);
  }

  let geminiRes: Response;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            // temperature 0: распознавание — не творчество. Один и тот же
            // скриншот должен давать один и тот же ответ.
            temperature: 0,
          },
        }),
      }
    );
  } catch (cause) {
    return json({ error: 'Не удалось связаться с Gemini', detail: String(cause) }, 502);
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    // 429 у бесплатного тарифа — обычное дело, пробрасываем как есть,
    // чтобы клиент показал человеку понятное «попробуй позже»
    return json({ error: 'Gemini вернул ошибку', status: geminiRes.status, detail: detail.slice(0, 300) },
      geminiRes.status === 429 ? 429 : 502);
  }

  const body = await geminiRes.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    return json({ error: 'Модель вернула пустой ответ' }, 502);
  }

  let extracted: unknown;
  try {
    extracted = JSON.parse(text);
  } catch {
    // responseSchema обычно это гарантирует, но полагаться на «обычно»
    // в проде нельзя — деньги
    return json({ error: 'Модель вернула не JSON', raw: text.slice(0, 300) }, 502);
  }

  return json({
    extracted,
    usage: body.usageMetadata ?? null,
    model: MODEL,
  });
});
