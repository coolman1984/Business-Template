# 🏭 مصنع أنظمة الأعمال

منتج أساسي واحد + محركات بقواعد واضحة + وصفات نشاط + إعدادات عميل؛ فينشأ نظام كل عميل من تركيب مُختبر ويظل قابلًا للترقية من نفس المصدر.

- 📘 الخطة الرئيسية: [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)
- 🧪 تقرير المرحلة صفر: [`docs/PHASE_0_REPORT.md`](docs/PHASE_0_REPORT.md)
- 🤖 قواعد الوكيل البرمجي: [`CLAUDE.md`](CLAUDE.md)

**الحالة:** المرحلة صفر مكتملة — عزل الشركات والمعاملات وسجل المراجعة مثبتة باختبارات.

## Developer quick start

```bash
pnpm install
cp .env.example .env            # then edit passwords
pnpm db:bootstrap               # roles + database (superuser, once)
pnpm db:migrate                 # schema (owner role)
pnpm db:seed-demo               # two synthetic companies, prints dev tokens
pnpm start                      # API on :3000 (runtime role only)

TEST_DATABASE_ADMIN_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm test
```

On-premise machine: `cp .env.example .env`, set passwords, then `docker compose up -d`.
