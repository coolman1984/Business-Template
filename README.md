# 🏭 مصنع أنظمة الأعمال

منتج أساسي واحد + محركات بقواعد واضحة + وصفات نشاط + إعدادات عميل؛ فينشأ نظام كل عميل من تركيب مُختبر ويظل قابلًا للترقية من نفس المصدر.

- 📘 الخطة الرئيسية: [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)
- 🧪 تقرير المرحلة صفر: [`docs/PHASE_0_REPORT.md`](docs/PHASE_0_REPORT.md)
- 🔐 تقرير المرحلة الأولى: [`docs/PHASE_1_REPORT.md`](docs/PHASE_1_REPORT.md)
- 🗂️ تقرير المرحلة الثانية: [`docs/PHASE_2_REPORT.md`](docs/PHASE_2_REPORT.md)
- 🤖 قواعد الوكيل البرمجي: [`CLAUDE.md`](CLAUDE.md)

**الحالة:** المرحلة الثانية مكتملة — ملفات بإصدارات وفحص، سلة محذوفات، مهام خلفية، ونسخ احتياطي يُسترجع في بيئة جديدة.

## ▶️ تشغيل بضغطة واحدة
1. ثبّت Node.js (الإصدار 22 أو أحدث) من https://nodejs.org
2. ويندوز: اضغط مرتين على `start-webapp.bat` — ماك: `start-webapp.command`
3. المتصفح يفتح وحده، وأسماء الدخول التجريبية تظهر في النافذة وفي `.local/demo-logins.txt`
4. أي تعديل في `apps/business-web/src` يظهر فورًا في الصفحة. للإيقاف أغلق النافذة.

كل البيانات المحلية في مجلد `.local/`؛ احذفه لتبدأ من جديد.

## Developer quick start

```bash
pnpm install
pnpm local                      # all-in-one local dev (embedded PostgreSQL in .local/, API, live-reload UI)

# Or against your own PostgreSQL:
cp .env.example .env            # then edit passwords
pnpm db:bootstrap               # roles + database (superuser, once)
pnpm db:migrate                 # schema (owner role)
pnpm db:seed-demo               # two synthetic companies, prints demo sign-ins
pnpm build:web                  # Arabic web UI, served by the API
pnpm start                      # everything on :3000 (open PUBLIC_URL in a browser)
# UI development: PUBLIC_URL=http://127.0.0.1:5173 pnpm start  +  pnpm dev:web

TEST_DATABASE_ADMIN_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm test
```

On-premise machine: `cp .env.example .env`, set passwords, then `docker compose up -d`.
