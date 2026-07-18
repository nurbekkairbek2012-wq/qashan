import { supabase } from './supabase.js';

/**
 * Слой данных. Одна абстракция над двумя хранилищами:
 *   · вошёл пользователь  → Supabase (синхронизация между устройствами, RLS);
 *   · не вошёл            → localStorage (демо работает без аккаунта).
 *
 * App не знает, откуда данные — вызывает load/save и получает одну структуру.
 * Так вход остаётся необязательным, а код интерфейса не ветвится на «есть база
 * или нет».
 *
 * Формат хранения — camelCase, как в ядре расчётов. На границе с Supabase
 * (snake_case-колонки) поля переименовываются здесь, чтобы схема БД не
 * протекала в компоненты.
 */

const STORAGE_KEY = 'qaryz.state.v1';

// --- localStorage (аноним) --------------------------------------------------

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { monthlyIncome: '', installments: [] };
  } catch {
    // Битый localStorage не должен ронять приложение — начинаем с нуля
    return { monthlyIncome: '', installments: [] };
  }
}

function saveLocal(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Supabase (вошёл) -------------------------------------------------------

/** Строка installments из БД (snake_case) → объект ядра (camelCase). */
function rowToInstallment(row) {
  return {
    id: row.id,
    merchant: row.merchant,
    itemName: row.item_name,
    priceInstallment: Number(row.price_installment),
    priceCash: row.price_cash == null ? null : Number(row.price_cash),
    downPayment: Number(row.down_payment),
    termMonths: row.term_months,
    monthlyPayment: Number(row.monthly_payment),
    firstDueDate: row.first_due_date,
    source: row.source,
  };
}

/** Объект ядра → строка для БД. user_id проставит RLS-политика через auth.uid(). */
function installmentToRow(item, userId) {
  return {
    user_id: userId,
    merchant: item.merchant ?? '',
    item_name: item.itemName ?? '',
    price_installment: item.priceInstallment,
    price_cash: item.priceCash ?? null,
    down_payment: item.downPayment ?? 0,
    term_months: item.termMonths,
    monthly_payment: item.monthlyPayment,
    first_due_date: item.firstDueDate,
    source: item.source ?? 'manual',
  };
}

async function loadRemote(userId) {
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('monthly_income').eq('id', userId).maybeSingle(),
    supabase.from('installments').select('*').eq('user_id', userId).order('created_at'),
  ]);

  return {
    monthlyIncome: profile?.monthly_income ? String(profile.monthly_income) : '',
    installments: (rows ?? []).map(rowToInstallment),
  };
}

// --- Публичный API ----------------------------------------------------------

/**
 * @param {import('@supabase/supabase-js').User|null} user
 * @returns {Promise<{monthlyIncome: string, installments: Array}>}
 */
export async function loadState(user) {
  if (user && supabase) return loadRemote(user.id);
  return loadLocal();
}

/** Сохранить доход. Профиль создан триггером при регистрации — здесь update. */
export async function saveIncome(user, monthlyIncome, currentState) {
  if (user && supabase) {
    await supabase
      .from('profiles')
      .update({ monthly_income: Number(monthlyIncome) || 0, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    return;
  }
  saveLocal({ ...currentState, monthlyIncome });
}

/** Добавить рассрочку. Возвращает её с присвоенным id. */
export async function addInstallment(user, item, currentState) {
  if (user && supabase) {
    const { data, error } = await supabase
      .from('installments')
      .insert(installmentToRow(item, user.id))
      .select()
      .single();
    if (error) throw new Error(error.message);
    return rowToInstallment(data);
  }

  const withId = { ...item, id: crypto.randomUUID() };
  saveLocal({ ...currentState, installments: [...currentState.installments, withId] });
  return withId;
}

/** Удалить рассрочку. В Supabase каскад снесёт и её платежи. */
export async function removeInstallment(user, id, currentState) {
  if (user && supabase) {
    const { error } = await supabase.from('installments').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  saveLocal({
    ...currentState,
    installments: currentState.installments.filter((i) => i.id !== id),
  });
}
