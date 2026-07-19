import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

/**
 * Аутентификация — но приложение работает и БЕЗ неё.
 *
 * Вход нужен для двух вещей: синхронизации между устройствами и парсинга
 * скриншотов (Edge Function пускает только вошедших, чтобы не жгли квоту).
 * Всё остальное — расчёты, симулятор — работает на localStorage без аккаунта.
 *
 * Так демо не зависит от того, поднят ли Supabase: даже с выключенной базой
 * основная ценность показывается. Это осознанная деградация, а не заглушка.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // loading = пока не знаем, есть ли сессия. Без этого флага при перезагрузке
  // на миг мелькает экран «войдите», хотя пользователь уже вошёл.
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    isConfigured: isSupabaseConfigured,

    async signUp(email, password) {
      if (!isSupabaseConfigured) return { error: 'База не подключена' };
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error?.message ?? null };
    },

    async signIn(email, password) {
      if (!isSupabaseConfigured) return { error: 'База не подключена' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },

    async signInWithGoogle() {
      if (!isSupabaseConfigured) return { error: 'База не подключена' };
      // redirectTo — куда Google вернёт после входа. window.location.origin
      // работает и на localhost, и на проде без правки кода. Этот URL должен
      // быть в списке Redirect URLs в Supabase → Authentication → URL Config.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      return { error: error?.message ?? null };
    },

    async signOut() {
      if (isSupabaseConfigured) await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Хук живёт рядом с провайдером намеренно: контекст и доступ к нему — одно
// целое. Линтер предупреждает про fast-refresh (файл экспортирует и компонент,
// и функцию), но для контекста это стандартная и осознанная связка.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider');
  return ctx;
}
