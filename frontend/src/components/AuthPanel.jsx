import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Вход и регистрация. Намеренно компактно и с оговоркой, что без входа всё
 * работает: аккаунт нужен для синхронизации и разбора скриншотов, а не для
 * основной ценности.
 */

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-brand';

/** Логотип Google — инлайн-SVG, чтобы не тянуть картинку из сети. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function AuthPanel() {
  const { user, isConfigured, signIn, signUp, signInWithGoogle, signOut } = useAuth();

  const [mode, setMode] = useState('signin');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  // База не поднята — вход недоступен, но приложение работает на localStorage.
  // Честно говорим об этом, а не прячем нерабочую кнопку.
  if (!isConfigured) {
    return (
      <p className="text-xs text-muted">
        Синхронизация выключена (нет подключения к базе). Данные сохраняются
        только в этом браузере.
      </p>
    );
  }

  if (user) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{user.email}</span>
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg border border-line px-3 py-1 text-ink-soft hover:border-brand"
        >
          Выйти
        </button>
      </div>
    );
  }

  // Свёрнутое состояние: тонкая строка, чтобы форма входа не отодвигала
  // главный экран вниз. Разворачивается по клику.
  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">
          Расчёты работают без входа. Вход — для синхронизации и разбора скриншотов.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand"
        >
          Войти
        </button>
      </div>
    );
  }

  // Технические ошибки Supabase → человеческий текст. Иначе пользователь видит
  // «Invalid login credentials» и не понимает, что делать.
  const humanize = (raw) => {
    const t = raw.toLowerCase();
    if (t.includes('not confirmed')) {
      return 'Почта не подтверждена. Проверь письмо со ссылкой (загляни в спам). ' +
        'Расчёты работают и без входа.';
    }
    if (t.includes('invalid login')) {
      return 'Неверная почта или пароль. Если только зарегистрировался — сначала ' +
        'подтверди почту по ссылке из письма.';
    }
    if (t.includes('already registered')) return 'Такая почта уже зарегистрирована — войди.';
    if (t.includes('invalid') && t.includes('email')) return 'Проверь формат почты.';
    if (t.includes('password')) return 'Пароль должен быть не короче 6 символов.';
    return raw;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const action = mode === 'signin' ? signIn : signUp;
    const { error } = await action(email, password);

    setBusy(false);

    if (error) {
      setMessage({ type: 'error', text: humanize(error) });
    } else if (mode === 'signup') {
      // Если в проекте отключено подтверждение почты, signUp сразу создаёт
      // сессию и onAuthStateChange нас впустит — сообщение не покажется.
      // Если включено — просим подтвердить.
      setMessage({
        type: 'ok',
        text: 'Готово. Если попросят подтверждение — проверь почту (и спам).',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={mode === 'signin' ? 'font-medium text-ink' : 'text-muted'}
        >
          Вход
        </button>
        <span className="text-line">·</span>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={mode === 'signup' ? 'font-medium text-ink' : 'text-muted'}
        >
          Регистрация
        </button>
      </div>

      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="почта"
        className={inputClass}
      />
      <input
        type="password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="пароль"
        className={inputClass}
      />

      {message && (
        <p
          className="text-xs"
          style={{ color: message.type === 'error' ? 'var(--color-danger)' : 'var(--color-safe)' }}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? '…' : mode === 'signin' ? 'Войти' : 'Зарегистрироваться'}
      </button>

      {/* Разделитель между почтой и OAuth */}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        или
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          // signInWithOAuth уводит на страницу Google; при ошибке настройки
          // редиректа не будет — показываем причину, а не молчим.
          const { error } = await signInWithGoogle();
          if (error) {
            setBusy(false);
            setMessage({ type: 'error', text: humanize(error) });
          }
        }}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-2 font-medium text-ink transition-colors hover:border-brand disabled:opacity-50"
      >
        <GoogleMark />
        Войти через Google
      </button>

      <p className="text-xs text-muted">
        Вход нужен для синхронизации и разбора скриншотов. Расчёты работают и без него.
      </p>
    </form>
  );
}
