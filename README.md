# EGP RADAR — Dollar Early Warning & Intelligence System

منصة لمراقبة وتحليل الدولار مقابل الجنيه المصري: رصد حركات البنوك الفعلية، إحصاءات «من يتحرك أولًا ومن يتبع»، توقعات مختبرة تاريخيًا لا تُعرض إلا عند ثبوت أفضليتها، تنبيهات ذكية، ومحلل ذكي يجيب من بيانات المنصة فقط.

📄 **التقرير الكامل (البحث، المصادر، المنهجية، النتائج، خطة التطوير):** [`docs/REPORT.md`](docs/REPORT.md)

## التشغيل المحلي (5 دقائق)

المتطلبات: Node.js 22+، Python 3 (اختياري لملء التاريخ).

```bash
npm install
cp .env.example .env          # كل المفاتيح اختيارية
npm run db:migrate            # SQLite محليًا في data/egp-radar.db
npm run import:history        # يستورد data/daily_fx.csv (972 يومًا حقيقيًا)
npm run backtest              # يشغّل الاختبار التاريخي ويحفظ النتائج
npm run build && npm start    # http://localhost:3000
```

في نافذة ثانية — جامع البيانات (يعمل باستمرار):

```bash
npm run worker
```

- `npm run collect:once` — دورة واحدة (مناسبة لـ cron النظام).
- `npm run backfill:history` — تحديث `data/daily_fx.csv` من أرشيف currency-api ثم `npm run import:history`.
- `npm test` — 15 اختبارًا (التقويم، التحليل، الرادار، منع تسرب البيانات، التنبيهات).

## النشر

**المنشور حاليًا — GitHub Pages + GitHub Actions (مجاني، بلا خادم):** الملف `.github/workflows/pages.yml` يشغّل كل 15 دقيقة خلال أيام العمل (وكل 3 ساعات خارجها): يسترجع قاعدة البيانات من فرع `state` ← يجمع كل المصادر ← يصنّف الأخبار ← يحسب التوقعات والتنبيهات (Telegram/البريد إن أُضيفت الـ Secrets) ← يصدّر JSON ← يبني الموقع وينشره ← يحفظ قاعدة البيانات. الإعدادات في `config/settings.json`. المفاتيح الاختيارية كـ Secrets: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SMTP_*`, `ALERT_EMAIL_FROM/TO`.
قيود هذا الوضع: جدولة GitHub قد تتأخر عدة دقائق، والمحلل الذكي يعمل بوضع القواعد (لا مفاتيح في المتصفح). لدقة أعلى استخدم Docker أدناه.


**الخيار الموصى به — Docker Compose (ويب + جامع دائم + Postgres):**

```bash
cp .env.example .env && docker compose up -d --build
```

**Vercel/Netlify + Supabase:** ضع `DATABASE_URL` و`CRON_SECRET` في متغيرات البيئة. المنصات بلا خوادم لا تشغّل عمليات دائمة، لذا الجمع يتم عبر `GET /api/cron/collect` مع `Authorization: Bearer $CRON_SECRET`:
- `vercel.json` يضم Cron يومي (حد خطة Hobby).
- `.github/workflows/collect.yml` يستدعيه كل 10 دقائق خلال ساعات العمل (أضف `APP_URL` و`CRON_SECRET` كـ secrets). Cron في GitHub قد يتأخر دقائق؛ للدقة استخدم الـ worker على خادم.

## ضبط محوّلات البنوك
كل بنك معرّف في `config/banks.json` (رابط + نمط صف الدولار + ترتيب أعمدة الشراء/البيع). لم يمكن التحقق منها من بيئة البناء (شبكة مقيدة)، لذا:
1. شغّل `npm run collect:once` وافتح **صحة المصادر**.
2. لأي بنك فاشل: افتح صفحته في المتصفح، حدّث الرابط/`rowMatch`/`buyIndex`/`sellIndex`. للصفحات المبنية بـ JavaScript (مثل الأهلي) استخدم رابط طلب JSON الظاهر في تبويب Network.
3. فحص السلامة يرفض أي سعر غير منطقي (شراء > بيع، فرق > 3%، بعيد > 8% عن المرجع) بدل تخزينه.

احترم شروط استخدام كل موقع، واترك `BANK_POLL_SECONDS` عند 300 ثانية أو أكثر، وضع بيانات تواصلك في `COLLECTOR_USER_AGENT`.

## البنية
```
src/lib/sources/   محوّلات المصادر (بنوك، مرجعي، FRED، أخبار) + HTTP مهذب + مرآة npm
src/lib/collector.ts  الجدولة، backoff، كشف التغيرات، منع التكرار، صحة المصادر
src/lib/engine/    radar.ts · daily.ts (walk-forward) · intraday.ts · news.ts · tracker.ts · stats.ts
src/lib/alerts/    القواعد + الحساسية + التهدئة + Telegram/Email
src/lib/snapshot.ts   مصدر الحقيقة الوحيد للواجهة والـ API والمحلل
src/app/           الصفحات + API: snapshot, history, stream(SSE), analyst, settings, health, backtest, cron/collect
workers/           collector.ts (عملية دائمة) · backfill_npm_history.py
config/            banks.json · holidays-eg.json (حدّث العطلات عند إعلان المركزي)
```

## ملاحظات أمان
- لا مفاتيح في الكود أو الواجهة؛ كلها في متغيرات بيئة الخادم.
- `/api/cron/collect` محمي بـ `CRON_SECRET`؛ حفظ الإعدادات محمي بـ `ADMIN_TOKEN` إن ضُبط؛ `/api/analyst` عليه حد معدل.

> هذه المنصة أداة تحليل وليست نصيحة مالية. الأسعار المسحوبة ليست «لحظية» بالمعنى الدقيق؛ دقتها الزمنية = فترة السحب.
