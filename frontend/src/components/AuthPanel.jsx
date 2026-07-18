import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Вход и регистрация. Намеренно компактно и с оговоркой, что без входа всё
 * работает: аккаунт нужен для синхронизации и разбора скриншотов, а не для
 * основной ценности.
 */

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-brand';

export default function AuthPanel() {
  const { user, isConfigured, signIn, signUp, signOut } = useAuth();

  const [mode, setMode] = useState('signin');
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
      <div className="flex items-center gap-3 text-sm">
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const action = mode === 'signin' ? signIn : signUp;
    const { error } = await action(email, password);

    setBusy(false);

    if (error) {
      setMessage({ type: 'error', text: error });
    } else if (mode === 'signup') {
      // Supabase по умолчанию шлёт письмо-подтверждение
      setMessage({ type: 'ok', text: 'Проверь почту — там ссылка для подтверждения.' });
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

      <p className="text-xs text-muted">
        Вход нужен для синхронизации и разбора скриншотов. Расчёты работают и без него.
      </p>
    </form>
  );
}
