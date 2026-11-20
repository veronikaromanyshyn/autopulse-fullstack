# AutoPulse — лабораторні №2–6

**Навчальний повностековий вебзастосунок інтернет-магазину автотоварів**, продовження статичного сайту з лабораторної №1.

**Технології:** React 19 + Vite 7, Node.js 22 + Express 5, PostgreSQL, REST API, OpenAPI 3.0.3, Postman, express-session зі сховищем у PostgreSQL, Helmet, express-rate-limit, Render, Groq / Gemini API (Google AI) / OpenAI Responses API.

> Це навчальна демонстрація, а не справжній магазин. Ціни умовні, замовлення не передаються в доставку. Не вводьте реальні персональні дані.

## 1. Що реалізовано в кожній лабораторній

| Робота | Реалізація | Як перевірити |
|---|---|---|
| №2 React, динамічний контент, БД | Каталог з `GET /api/products`, фільтр категорій, стан React | Перемкнути категорію; відкрити `/api/products`; `SELECT * FROM products` |
| №3 Express, REST API, PostgreSQL, OpenAPI, Postman | `/api/health`, `/api/products`, `/api/session`, `POST /api/orders`, `/api/orders/mine`, `/openapi.yaml`, колекція Postman | Postman: GET/POST, 201 і 422, перевірка запису в pgAdmin |
| №4 Форми, localStorage, сесії, валідація, безпека | Форма замовлення, `localStorage` лише для категорії, HttpOnly-cookie + сесії в PostgreSQL, серверна валідація, Helmet, rate limit, перевірка Origin | Заповнити форму, ввести телефон `123`, DevTools → Application/Network |
| №5 Render, ENV, моніторинг | `render.yaml`, змінні `DATABASE_URL`, `SESSION_SECRET`, `METRICS_TOKEN`, маршрути `/api/health` і `/api/metrics` | URL на Render, Logs/Events, health і metrics у Postman |
| №6 AI API | `POST /api/ai/consult` (Gemini або OpenAI), каталог з БД передається моделі, React-чат | Додати ключ, поставити запитання в чаті та в Postman |

Автоматичні тести валідації (8 шт.): `npm test`.

## 2. Встановлення на Windows

### 2.1. Що потрібно встановити
1. **Node.js 22 LTS** — https://nodejs.org/
2. **PostgreSQL** з pgAdmin — https://www.postgresql.org/download/windows/ (запам'ятайте пароль користувача `postgres`).
3. **VS Code** і **Git**. Відкрийте папку `AutoPulse_Labs_2-6` через **File → Open Folder**.

### 2.2. Створення користувача і бази (один раз)
pgAdmin → Servers → PostgreSQL → Databases → postgres → **Query Tool**. Виконайте по черзі (кожну команду окремо), замінивши пароль:
```sql
CREATE USER autopulse_user WITH PASSWORD 'MY_STRONG_PASSWORD';
```
```sql
CREATE DATABASE autopulse OWNER autopulse_user;
```

### 2.3. Файл `.env`
```powershell
Copy-Item .\server\.env.example .\server\.env
notepad .\server\.env
```
Заповніть `DATABASE_URL` своїм паролем, а `SESSION_SECRET` і `METRICS_TOKEN` — довгими випадковими рядками. Згенерувати рядок:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Файл `server/.env` не потрапляє в Git (див. `.gitignore`).

### 2.4. Запуск
У корені проєкту:
```powershell
npm install
npm run db:setup
npm run dev
```
- Сайт React: http://localhost:5173/
- Каталог API: http://localhost:4000/api/products
- Перевірка БД: http://localhost:4000/api/health
- OpenAPI: http://localhost:4000/openapi.yaml

Vite перенаправляє `/api` на Express (порт 4000). Зупинка — `Ctrl + C`.

## 3. Перевірка в pgAdmin
```sql
SELECT id, title, brand, category, price_uah, stock FROM products ORDER BY position;
SELECT reference, product_id, quantity, total_uah, delivery, status, created_at
FROM orders ORDER BY created_at DESC;
SELECT COUNT(*) FROM session;
```

## 4. Postman (ЛР3)
Postman → **Import** → `postman/AutoPulse.postman_collection.json`. Змінна `baseUrl = http://localhost:4000`. Виконайте запити 1–7 по черзі (запит 6 бачить замовлення із запиту 5, бо Postman зберігає cookie). Для запиту 8 впишіть у змінну `metricsToken` значення з `server/.env`, для 9 потрібен AI-ключ.

## 5. Деплой на Render (ЛР5)
1. Створіть **новий** публічний репозиторій `autopulse-fullstack` (репозиторій ЛР1 не змінюйте) і завантажте проєкт:
```powershell
git init
git add .
git commit -m "Labs 2-6: AutoPulse React Express PostgreSQL"
git branch -M main
git remote add origin https://github.com/<ваш-логін>/autopulse-fullstack.git
git push -u origin main
```
2. Render → **New → Postgres**: Name `autopulse-db`, Database `autopulse`, User `autopulse_user`, Region Frankfurt, Plan Free. Скопіюйте **Internal Database URL**.
3. Render → **New → Web Service** → репозиторій `autopulse-fullstack`:
   - Runtime: Node, Branch: main, Region: Frankfurt;
   - Build Command: `npm ci --include=dev && npm run build`;
   - Start Command: `npm run db:setup && npm start`;
   - Health Check Path: `/api/health`.
4. **Environment**: `NODE_ENV=production`, `DATABASE_URL` (Internal URL), `SESSION_SECRET`, `METRICS_TOKEN`, `APP_ORIGIN=https://<сервіс>.onrender.com`, а для ЛР6 — `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
5. Перевірте `https://<сервіс>.onrender.com/api/health` і `/api/metrics` (заголовок `X-Monitor-Token`).

На скриншотах змінних середовища **замаскуйте** секрети.

## 6. AI-консультант (ЛР6)
**Варіант 0 — Groq (безкоштовно, без картки):** https://console.groq.com/keys → **Create API Key**. У `server/.env` і в Render:
```env
AI_PROVIDER=groq
GROQ_API_KEY=ваш_ключ
GROQ_MODEL=llama-3.3-70b-versatile
```
**Варіант A — Gemini (free tier доступний не для всіх проєктів):** https://aistudio.google.com → **Get API key → Create API key**. У `server/.env`:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=ваш_ключ
GEMINI_MODEL=gemini-flash-latest
```
**Варіант B — OpenAI:** `AI_PROVIDER=openai`, `OPENAI_API_KEY=...`, `OPENAI_MODEL=gpt-5-mini`.

Без ключа маршрут чесно повертає **503**. Якщо модель недоступна (404), вкажіть в `GEMINI_MODEL` іншу актуальну модель зі списку в Google AI Studio.

## 7. Структура
```text
AutoPulse_Labs_2-6/
├── client/
│   ├── index.html
│   ├── vite.config.js           Vite + проксі /api → Express
│   ├── public/assets/favicon.svg
│   └── src/
│       ├── main.jsx             React: каталог, фільтр, форма, сесія, AI-чат
│       └── styles.css
├── server/
│   ├── .env.example
│   ├── openapi.yaml             OpenAPI 3.0.3
│   ├── db/schema.sql | seed.sql | setup.js
│   ├── src/index.js             Express + REST API
│   ├── src/validation.js        Серверна валідація
│   ├── src/metrics.js           Метрики продуктивності
│   ├── src/ai.js                Gemini / OpenAI
│   └── tests/validation.test.js
├── postman/AutoPulse.postman_collection.json
├── render.yaml
└── package.json
```
