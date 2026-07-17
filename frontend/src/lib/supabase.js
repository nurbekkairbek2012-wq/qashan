import { createClient } from '@supabase/supabase-js';

/**
 * Клиент Supabase.
 *
 * anon key попадает в браузерный бандл — так и задумано. Доступ к данным
 * закрывает RLS на стороне базы, а не секретность ключа: с anon key чужие
 * строки просто не отдаются. Поэтому RLS у нас включён на ВСЕХ таблицах,
 * и политики — единственная защита долгов пользователя.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Приложение должно работать и без Supabase — состояние живёт в localStorage,
 * это рабочий режим, а не заглушка. Поэтому отсутствие ключей не роняет сборку,
 * а переводит в локальный режим.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    'Supabase не настроен: нет VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY.\n' +
      'Работаем на localStorage. Скопируй .env.example в .env, чтобы подключить базу.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
