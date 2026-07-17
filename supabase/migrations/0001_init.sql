-- ============================================================================
-- Qaryz — начальная схема
-- Хакатон Tech Vision 2026, зона 11 (Финтех)
--
-- Применить: Supabase Dashboard → SQL Editor → вставить целиком → Run
--
-- Мы храним долги живых людей. Здесь всё под RLS: без политики строка
-- недоступна вообще, поэтому забыть политику безопаснее, чем ошибиться в ней.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — доход пользователя, база для симуляции
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  monthly_income numeric(12, 2) not null default 0 check (monthly_income >= 0),
  income_day    smallint check (income_day between 1 and 28),
  region        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- income_day ограничен 28-м осознанно: 29–31 есть не в каждом месяце,
-- и «зарплата 31-го» породила бы месяцы без зачисления.

comment on table public.profiles is 'Доход пользователя. Один профиль на аккаунт.';

-- ---------------------------------------------------------------------------
-- installments — рассрочки
-- ---------------------------------------------------------------------------
create table if not exists public.installments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  merchant          text not null default '',
  item_name         text not null default '',
  price_installment numeric(12, 2) not null check (price_installment > 0),
  price_cash        numeric(12, 2) check (price_cash > 0),
  down_payment      numeric(12, 2) not null default 0 check (down_payment >= 0),
  term_months       smallint not null check (term_months between 1 and 60),
  monthly_payment   numeric(12, 2) not null check (monthly_payment > 0),
  first_due_date    date not null,
  status            text not null default 'active' check (status in ('active', 'closed')),
  source            text not null default 'manual' check (source in ('manual', 'screenshot')),
  raw_extract       jsonb,
  created_at        timestamptz not null default now(),

  -- Взнос не может превышать цену товара
  constraint down_payment_within_price check (down_payment <= price_installment)
);

-- price_cash NULL — это НЕ ошибка: студент часто не знает цену за наличные.
-- Тогда эффективную ставку просто не считаем и пишем «нет данных».
-- Подставлять сюда price_installment было бы выдумыванием данных.
comment on column public.installments.price_cash is
  'Цена за наличные. NULL = неизвестна, ставку не считаем. Не заполнять догадкой.';

comment on column public.installments.raw_extract is
  'Сырой JSON от vision-парсера. Хранится для отладки и разбора ошибок распознавания.';

create index if not exists installments_user_id_idx on public.installments (user_id);

-- ---------------------------------------------------------------------------
-- payments — развёрнутый график платежей
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments (id) on delete cascade,
  seq            smallint not null check (seq > 0),
  due_date       date not null,
  amount         numeric(12, 2) not null check (amount > 0),
  is_paid        boolean not null default false,
  paid_at        timestamptz,

  unique (installment_id, seq)
);

create index if not exists payments_installment_id_idx on public.payments (installment_id);
create index if not exists payments_due_date_idx on public.payments (due_date) where not is_paid;

-- ---------------------------------------------------------------------------
-- scenarios — сохранённые сценарии «а что если взять ещё одну»
-- ---------------------------------------------------------------------------
create table if not exists public.scenarios (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  label             text not null default '',
  draft_installment jsonb not null,
  created_at        timestamptz not null default now()
);

-- draft_installment живёт в jsonb, а не в installments: черновик — это ещё не
-- взятая рассрочка. Смешивать их значило бы показывать в дашборде долги,
-- которых у человека нет.

create index if not exists scenarios_user_id_idx on public.scenarios (user_id);

-- ---------------------------------------------------------------------------
-- price_observations — ИССЛЕДОВАТЕЛЬСКАЯ таблица
-- Реальные пары «цена за наличные / цена в рассрочку», собранные вручную.
-- Проверяет гипотезу о скрытой наценке. Персональных данных здесь нет.
-- ---------------------------------------------------------------------------
create table if not exists public.price_observations (
  id                uuid primary key default gen_random_uuid(),
  product_name      text not null,
  category          text,
  price_cash        numeric(12, 2) not null check (price_cash > 0),
  price_installment numeric(12, 2) not null check (price_installment > 0),
  term_months       smallint check (term_months between 1 and 60),
  source            text not null,
  observed_at       date not null default current_date,
  note              text,
  created_at        timestamptz not null default now()
);

comment on table public.price_observations is
  'Ручной сбор реальных пар цен для проверки гипотезы о наценке. Не выдумывать строки.';

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Включаем ВЕЗДЕ. В Postgres при включённом RLS и отсутствии политики строка
-- недоступна — то есть забытая политика ломает функциональность, но не
-- открывает данные. Ошибаться безопаснее в эту сторону.
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.installments       enable row level security;
alter table public.payments           enable row level security;
alter table public.scenarios          enable row level security;
alter table public.price_observations enable row level security;

-- --- profiles ---------------------------------------------------------------
create policy "Свой профиль: чтение"
  on public.profiles for select using ((select auth.uid()) = id);

create policy "Свой профиль: создание"
  on public.profiles for insert with check ((select auth.uid()) = id);

create policy "Свой профиль: изменение"
  on public.profiles for update using ((select auth.uid()) = id)
                       with check ((select auth.uid()) = id);

-- UPDATE требует и USING, и WITH CHECK. USING решает, какие строки видно для
-- изменения; WITH CHECK — какими они станут. Без WITH CHECK пользователь смог
-- бы переписать свой id и подарить профиль чужому аккаунту.

-- --- installments -----------------------------------------------------------
create policy "Свои рассрочки: чтение"
  on public.installments for select using ((select auth.uid()) = user_id);

create policy "Свои рассрочки: создание"
  on public.installments for insert with check ((select auth.uid()) = user_id);

create policy "Свои рассрочки: изменение"
  on public.installments for update using ((select auth.uid()) = user_id)
                           with check ((select auth.uid()) = user_id);

create policy "Свои рассрочки: удаление"
  on public.installments for delete using ((select auth.uid()) = user_id);

-- --- payments ---------------------------------------------------------------
-- У payments нет своего user_id — владелец определяется через рассрочку.
-- Денормализовать user_id сюда значило бы завести второй источник правды,
-- который может разойтись с installments.
create policy "Свои платежи: чтение"
  on public.payments for select using (
    exists (
      select 1 from public.installments i
      where i.id = payments.installment_id and i.user_id = (select auth.uid())
    )
  );

create policy "Свои платежи: создание"
  on public.payments for insert with check (
    exists (
      select 1 from public.installments i
      where i.id = payments.installment_id and i.user_id = (select auth.uid())
    )
  );

create policy "Свои платежи: изменение"
  on public.payments for update using (
    exists (
      select 1 from public.installments i
      where i.id = payments.installment_id and i.user_id = (select auth.uid())
    )
  );

create policy "Свои платежи: удаление"
  on public.payments for delete using (
    exists (
      select 1 from public.installments i
      where i.id = payments.installment_id and i.user_id = (select auth.uid())
    )
  );

-- --- scenarios --------------------------------------------------------------
create policy "Свои сценарии: чтение"
  on public.scenarios for select using ((select auth.uid()) = user_id);

create policy "Свои сценарии: создание"
  on public.scenarios for insert with check ((select auth.uid()) = user_id);

create policy "Свои сценарии: удаление"
  on public.scenarios for delete using ((select auth.uid()) = user_id);

-- --- price_observations -----------------------------------------------------
-- Исследовательские данные: читать может кто угодно, включая анонимов —
-- это открытая часть проекта. Писать — только вошедшие, чтобы таблицу
-- не засорили извне.
create policy "Наблюдения цен: чтение всем"
  on public.price_observations for select using (true);

create policy "Наблюдения цен: запись только вошедшим"
  on public.price_observations for insert to authenticated with check (true);

-- ============================================================================
-- Профиль создаётся автоматически при регистрации.
-- Иначе первый экран после входа падал бы на отсутствующей строке.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- SECURITY DEFINER здесь необходим: триггер пишет в profiles до того, как
-- у сессии появился auth.uid(), и под RLS сам себя бы не пропустил.
-- Поэтому же жёстко задан search_path = '' — иначе функция с правами
-- владельца могла бы быть уведена подменой схемы в search_path.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
