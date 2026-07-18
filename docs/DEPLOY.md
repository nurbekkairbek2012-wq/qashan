# Деплой — live-ссылка для демо

Регламент разрешает сдать **видео до 3 минут ИЛИ live-ссылку**. Live выглядит
сильнее: жюри само потыкает. Ниже — самый быстрый путь.

## Вариант A — Vercel (рекомендую, ~5 минут)

1. **vercel.com** → войти через GitHub (аккаунт `nurbekkairbek2012-wq`)
2. **Add New → Project** → выбрать репозиторий `qashan`
3. Настройки сборки:
   | Поле | Значение |
   |---|---|
   | Framework Preset | Vite |
   | **Root Directory** | `frontend` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
4. **Environment Variables** — добавить два:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://hgozapfiondqltsjdaax.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | (из `frontend/.env`) |
5. **Deploy** → через минуту получишь ссылку вида `qashan.vercel.app`

`vercel.json` в репозитории уже настраивает SPA-рероутинг (все пути → index.html),
иначе прямые ссылки давали бы 404.

## Вариант B — Cloudflare Pages

Как в проекте Albus. `frontend/public/_redirects` для SPA уже на месте.

1. **dash.cloudflare.com** → Workers & Pages → Create → Pages → Connect to Git
2. Репозиторий `qashan`
3. Build: root `frontend`, команда `npm run build`, вывод `dist`
4. Те же две переменные окружения
5. Save and Deploy

## После деплоя — обязательно

**Supabase → Authentication → URL Configuration** → добавить прод-URL
(`https://qashan.vercel.app`) в **Redirect URLs**. Иначе подтверждение почты
при регистрации будет уводить на localhost.

## Что проверить на живой ссылке

- [ ] Открывается, виден заголовок и поле дохода
- [ ] Ввёл доход + рассрочку вручную → появился дашборд с месяцем перелома
- [ ] Симулятор «а что если» считает
- [ ] Регистрация → письмо на почту → вход
- [ ] Под входом виден блок «Загрузить скриншот»
- [ ] Загрузка тестовой фикстуры (`frontend/test-fixtures/`) → поля заполнились

Демо можно вести и без входа — расчёты работают на localStorage. Вход
показываем ради синхронизации и разбора скриншотов.
