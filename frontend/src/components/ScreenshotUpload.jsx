import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { extractWithRepair } from '../core/extraction.js';

/**
 * Загрузка скриншота рассрочки → распознавание → предзаполнение формы.
 *
 * ЦЕПОЧКА (не обёртка над API):
 *   1. картинка → Edge Function → Gemini vision → сырые СТРОКИ
 *   2. normalizeExtract → числа и даты (детерминированный код, покрыт тестами)
 *   3. проверка инварианта «платёж × срок ≈ сумма»
 *   4. НЕ СОШЛОСЬ → код формулирует расхождение числами и отправляет модель
 *      перечитать конкретные поля; из двух попыток выбирается лучшая
 *   5. предзаполняем форму — человек проверяет и подтверждает
 *
 * Шаг 4 — то, что отличает цепочку от обёртки: решение о повторе, текст
 * замечания и выбор итога принимает код. Сама логика живёт в core/extraction.js
 * и покрыта тестами на подставной модели; здесь остаётся только ввод-вывод.
 *
 * Результат распознавания не уходит в базу молча — он попадает в форму, где
 * виден человеку. Деньги требуют подтверждения, а не доверия к модели.
 */

/** Файл → base64 без префикса data:. */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ScreenshotUpload({ onParsed }) {
  const { user, isConfigured } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Сколько проходов понадобилось. Показываем человеку: если код поймал модель
  // на ошибке, он вправе об этом знать — это его деньги, а не наша кухня.
  const [passes, setPasses] = useState(null);

  // Парсинг требует и подключённой базы, и входа: Edge Function пускает только
  // вошедших, чтобы не жгли квоту. Без этого — молча прячем блок, ручной ввод
  // остаётся основным путём.
  if (!isConfigured || !user) return null;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setPasses(null);

    try {
      const base64 = await fileToBase64(file);

      // Транспорт передаём аргументом — цепочка не знает про Supabase,
      // поэтому её можно прогонять в тестах без сети.
      const invoke = async (body) => {
        const { data, error: fnError } = await supabase.functions.invoke('parse-installment', {
          body,
        });

        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);

        return data.extracted;
      };

      const result = await extractWithRepair(
        { image: base64, mimeType: file.type || 'image/png' },
        { invoke }
      );

      setPasses(result.passes);

      onParsed(result.data, {
        ok: result.check?.ok ?? false,
        diff: result.check?.diff ?? 0,
        raw: result.raw,
        passes: result.passes,
        repaired: result.repaired,
      });
    } catch (cause) {
      setError(String(cause.message ?? cause));
    } finally {
      setBusy(false);
      event.target.value = ''; // позволяем загрузить тот же файл повторно
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-4">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand">
          {busy ? 'Распознаю…' : 'Загрузить скриншот'}
        </span>
        <span className="text-sm text-muted">
          сфоткай экран рассрочки — поля заполнятся сами
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFile}
          disabled={busy}
          className="hidden"
        />
      </label>

      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>
          Не удалось распознать: {error}. Введи данные вручную ниже.
        </p>
      )}

      {/* Показываем, что сработала самопроверка. Не техническая деталь ради
          красоты: человек должен знать, что в цифрах было расхождение —
          значит, проверить их в форме стоит особенно внимательно. */}
      {passes === 2 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-warn)' }}>
          Цифры не сошлись с первого раза — попросили распознать заново.
          Проверь поля перед сохранением.
        </p>
      )}
    </div>
  );
}
