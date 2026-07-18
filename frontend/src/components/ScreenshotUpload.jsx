import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { normalizeExtract } from '../core/normalize.js';
import { validateInstallment } from '../core/schedule.js';

/**
 * Загрузка скриншота рассрочки → распознавание → предзаполнение формы.
 *
 * ЦЕПОЧКА (не обёртка над API):
 *   1. картинка → Edge Function → Gemini vision → сырые СТРОКИ
 *   2. normalizeExtract → числа и даты (детерминированный код, покрыт тестами)
 *   3. validateInstallment → сходится ли платёж × срок ≈ сумма
 *   4. предзаполняем форму — человек проверяет и подтверждает
 *
 * Модель только распознаёт. Считает и проверяет код. Поэтому результат
 * распознавания не уходит в базу молча — он попадает в форму, где виден
 * человеку. Деньги требуют подтверждения, а не слепого доверия к модели.
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

  // Парсинг требует и подключённой базы, и входа: Edge Function пускает только
  // вошедших, чтобы не жгли квоту. Без этого — молча прячем блок, ручной ввод
  // остаётся основным путём.
  if (!isConfigured || !user) return null;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);

      const { data, error: fnError } = await supabase.functions.invoke('parse-installment', {
        body: { image: base64, mimeType: file.type || 'image/png' },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      // Сырые строки от модели → числа и даты
      const normalized = normalizeExtract(data.extracted);

      // Проверяем инвариант сразу, чтобы предупредить человека ещё до сохранения
      const check = validateInstallment(normalized);

      onParsed(normalized, { ok: check.ok, diff: check.diff, raw: data.extracted });
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
    </div>
  );
}
