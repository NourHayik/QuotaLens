# لوحة حدود استخدام الذكاء الاصطناعي — المتطلبات المرجعية

## 1. رؤية المنتج

بناء لوحة تحكم محلية فقط وأداة سطر أوامر تعرض حدود اشتراكات أدوات البرمجة المعتمدة على الذكاء الاصطناعي في مكان واحد، من خلال الاستفادة من أدوات CLI المثبتة والمسجل الدخول إليها مسبقًا على جهاز المستخدم. يجب ألا تستخدم عملية جمع البيانات أي نموذج ذكاء اصطناعي أثناء التشغيل، وألا تطلب من المستخدم تزويد النظام باسم مستخدم أو كلمة مرور أو API Key أو OAuth Token أو Session Credential منسوخة يدويًا.

يجب أن تعطي النسخة الإنتاجية الأولى الأولوية للاشتراكات الحالية التالية:

1. Kimi Code
2. OpenAI Codex
3. Cursor
4. OpenCode Go
5. Google Antigravity (`agy`) لحدود Gemini

كما يجب أن يوفر المشروع أمرًا ثابتًا وقابلًا للقراءة آليًا مثل:

```bash
ai-limits status --json
```

وذلك لكي يستطيع الـAgent المحلي الموجود لدى المستخدم تنفيذ الأمر وإرجاع النتيجة عبر WhatsApp عندما يكون المستخدم بعيدًا عن الجهاز.

## 2. الأهداف

- تجميع نوافذ الاستخدام، النسبة أو القيمة المتبقية، أوقات إعادة التعيين، بيانات الخطة، وأرصدة الـcredits عندما تكون متاحة محليًا.
- إعادة استخدام تسجيل الدخول الذي تديره أدوات CLI نفسها.
- توفير تحديث يدوي وتحديث تلقائي اختياري.
- اعتماد نموذج بيانات موحد واحد تستخدمه لوحة التحكم والـAPI المحلي والتخزين وخرج CLI بصيغة JSON.
- استمرار النظام بالعمل حتى لو كان بعض المزودين غير متاحين.
- تسهيل إضافة مزودين جدد عبر Adapters مستقلة.
- الحفاظ على سلوك حتمي أثناء التشغيل بدون استهلاك AI credits لغرض قراءة الحدود.

## 3. ما هو خارج النطاق

- لا يوجد استضافة عامة أو Dashboard عن بعد.
- لا يوجد نظام متعدد المستخدمين أو RBAC.
- لا يتم تخزين بيانات دخول المزودين.
- لا يتم استخدام LLM لقراءة أو تفسير خرج CLI.
- لا يتم شراء أو ترقية الخطط أو تعديلها آليًا.
- لا يتم استهلاك reset credits أو تعديل الحصص في الإصدار الأول.
- لا يوجد Browser Scraping في الإصدار الأول.
- لا يوجد تطبيق هاتف في الإصدار الأول.

## 4. القيود والافتراضات الإلزامية

### 4.1 محلي فقط
- يعمل التطبيق على نفس الجهاز الذي توجد عليه أدوات CLI ويتم تسجيل الدخول إليها.
- أي خادم HTTP يجب أن يرتبط فقط بـ`127.0.0.1` و/أو `::1`.
- لا يجب أن تكون لوحة التحكم متاحة من LAN أو الإنترنت افتراضيًا أو عبر إعداد عادي.

### 4.2 حدود المصادقة
- يعتمد التطبيق على المصادقة المحلية التي يديرها المزود نفسه.
- لا يطلب أو ينسخ أو يصدر أو يخزن كلمات المرور أو OAuth tokens أو session cookies أو API keys.
- يحق للـConnector تشغيل CLI أو بروتوكول محلي مصادق عليه واستهلاك النتائج غير السرية فقط.
- يمكن إظهار حالة `authenticated: true/false/unknown` بدون كشف أي سر.

### 4.3 عدم استخدام AI أثناء قراءة الحدود
- يتم استخراج البيانات باستخدام structured protocol fields أو JSON أو parsing حتمي أو regex أو التحكم بـTUI/PTY فقط.
- يمنع استخدام LLM لتلخيص أو تصنيف أو تفسير خرج الاستخدام.
- يجب ألا يؤدي تشغيل Dashboard أو `ai-limits status --json` بحد ذاته إلى استهلاك inference credits لغرض جلب الحدود أو تنسيقها.

### 4.4 الصراحة عند غياب البيانات
- يجب تمثيل البيانات غير المتاحة كـ`unsupported` أو `unavailable` أو `not_authenticated` أو `not_installed` أو `timeout` أو `parse_error`.
- يمنع اختراع limit مفقود أو تقدير quota من سلوك غير موثق.

## 5. المعمارية المختارة

يتم استخدام Modular Monolith محلي بـTypeScript مكون من:

1. `core/domain` — الأنواع الموحدة للمزودين والlimits والfreshness والأخطاء والsnapshots.
2. `core/application` — تنسيق refresh والcache والhistory وتجميع الحالة.
3. `providers/*` — Adapter مستقل لكل مزود.
4. `infra/process` — تشغيل subprocess وPTY بشكل آمن.
5. `infra/storage` — SQLite repositories.
6. `cli` — أوامر `ai-limits`.
7. `server` — HTTP/events محلي على loopback فقط.
8. `web` — React dashboard.

يجب أن يكون اتجاه الاعتماد نحو domain/application contracts. يمنع للـprovider adapters الاعتماد على UI.

## 6. نموذج البيانات الموحد

### 6.1 Provider snapshot
يجب أن يحتوي كل Provider result على الأقل على:

- stable provider ID
- display name
- حالة التثبيت
- حالة المصادقة
- حالة capability الخاصة بالconnector
- overall result status
- مصدر البيانات مثل `app-server`, `cli-json`, `cli-text`, `tui-pty`
- نسخة CLI إن أمكن
- وقت بداية ونهاية الجلب
- freshness/stale state
- plan/account label اختياري بطريقة تحافظ على الخصوصية
- صفر أو أكثر من usage limits
- أخطاء وتحذيرات غير سرية

### 6.2 Usage limit
يجب أن يدعم limit الموحد:

- stable local limit ID
- الاسم الأصلي عند توفره
- النوع: rolling, weekly, monthly, credit, model-specific, other
- مدة النافذة بالدقائق إن عرفت
- used percentage
- remaining percentage
- used/limit/remaining amounts عندما يرسلها المزود
- unit مثل `USD`, credits, requests, tokens, percent, provider-unit
- reset timestamp
- reset countdown مشتق محليًا
- model identifier إذا كان limit خاصًا بموديل
- raw non-secret metadata فقط في debug الاختياري

يمنع اختراع حقول غير موجودة فقط لتبدو نتائج المزودين متشابهة.

## 7. متطلبات المزودين ذوي الأولوية

## 7.1 Codex

التكامل الأساسي:
- تشغيل `codex app-server --stdio` باستخدام جلسة Codex المسجل دخولها مسبقًا.
- تنفيذ JSON-RPC initialization المطلوب.
- استدعاء `account/rateLimits/read`.
- تطبيع `rateLimits` و`rateLimitsByLimitId` وكل primary/secondary windows المتاحة.
- قراءة `usedPercent`, `windowDurationMins`, `resetsAt`, plan type وبيانات credits عند توفرها.
- عدم افتراض أن الحساب يملك دائمًا 5-hour + weekly بالضبط.
- يمكن لاحقًا الاستفادة من `account/rateLimits/updated`، بينما يكفي polling في البداية.

Fallback:
- parsing حتمي لـ`/status` فقط إذا كان app-server غير متاح.

القواعد:
- إذا أعاد الحساب weekly فقط أو 5-hour فقط فيتم عرض المتاح فقط.
- لا يتم تخمين window مفقودة.

## 7.2 Kimi Code

التكامل الأساسي:
- اكتشاف `kimi` والنسخة.
- إعادة استخدام Kimi Code CLI المصادق عليه.
- تشغيل `/usage` عبر PTY مضبوط عندما لا توجد طريقة structured محلية أفضل.
- إزالة ANSI/control sequences.
- تحليل quota/membership fields باستخدام parsers حتمية وfixtures مرتبطة بالنسخة.

البيانات المتوقع دعمها عندما يعرضها المزود:
- 5-hour rolling usage
- weekly usage
- monthly/shared membership quota
- plan/membership state
- extra usage balance/status
- reset information

القواعد:
- يجب تحمل غياب بعض الحقول حسب الخطة أو النسخة.
- أي شكل خرج غير معروف ينتج `parse_error` ولا يتم التخمين.

## 7.3 Google Antigravity (`agy`)

التكامل الأساسي:
- اكتشاف `agy` والنسخة.
- إعادة استخدام جلسة Google المصادق عليها.
- تشغيل `/usage` عبر PTY أو structured command مستقبلي إن تم اكتشافه.
- إبقاء quota الخاصة بكل model منفصلة.

القواعد:
- لا يتم دمج عدة model quotas في نسبة واحدة مضللة.
- يمكن عرض الاسم `Gemini / Antigravity` مع provider ID ثابت مثل `antigravity`.
- لا يتم الرجوع إلى افتراض Gemini CLI القديم عندما يكون المصدر المطلوب هو `agy`.

## 7.4 Cursor

السلوك المطلوب:
- اكتشاف `cursor-agent` والنسخة.
- استخدام `cursor-agent status` لحالة المصادقة والتثبيت بدون أسرار.
- capability probing للنسخة المثبتة لاكتشاف أي deterministic usage surface مدعوم.
- إذا ظهر structured usage command في النسخة الحالية يتم استخدامه وتطبيع نتائجه.
- إذا لم يوجد مصدر محلي حتمي يتم إرجاع `usage_capability: unsupported` مع السبب، بدون استهلاك credits.

ممنوع:
- تشغيل `cursor-agent -p` وطلب معرفة الحدود من نموذج AI.
- scraping للـCursor web dashboard في الإصدار الأول.

## 7.5 OpenCode Go

السلوك المطلوب:
- اكتشاف `opencode` والنسخة.
- التحقق من وجود OpenCode Go/provider auth باستخدام metadata مدعومة وبدون كشف الأسرار.
- capability probing لأي deterministic Go usage command/endpoint في CLI المثبت.
- استخدام structured output عندما يكون متاحًا.
- تطبيع 5-hour/weekly/monthly عند توفر الاستهلاك الحالي من مصدر محلي مدعوم.

وجود plan limits موثقة لا يكفي لحساب live usage. إذا لم توجد طريقة محلية لجلب الاستهلاك الحالي فيتم إرجاع `usage_capability: unsupported` مع السبب.

## 8. اكتشاف القدرات

عند بدء التشغيل ومن خلال `ai-limits doctor` يجب:
- اكتشاف executable path بدون عرض تفاصيل غير لازمة للمستخدم.
- معرفة CLI version إن أمكن.
- اكتشاف installed/not-installed.
- اكتشاف authenticated/not-authenticated/unknown بأوامر غير سرية.
- معرفة acquisition method المتاح.
- إظهار الطريقة المختارة والfallbacks.

يمكن caching لهذه النتائج لفترة قصيرة مع إمكانية التحديث.

## 9. سلوك Refresh

### 9.1 Manual refresh
- `Refresh All` يحدث جميع المزودين المفعّلين بتوازي محدود وآمن.
- لكل مزود refresh مستقل.
- فشل مزود لا يلغي البقية.

### 9.2 Auto-refresh
- معطل افتراضيًا.
- يمكن تشغيله وإيقافه.
- intervals مثل 15s, 30s, 60s, 5m.
- default عند التشغيل 60s.
- يمكن للـprovider cooldown أن يمنع interval عدواني.
- يتم stagger للpolling بدل تشغيل جميع CLIs بنفس اللحظة.

### 9.3 Timeouts
- لكل connector timeout قابل للضبط مع default محافظ.
- أي child process يتجاوز الوقت يجب إيقافه وتنظيفه.

## 10. واجهة CLI

اسم الأداة `ai-limits`.

الأوامر المطلوبة:

```bash
ai-limits status
ai-limits status --json
ai-limits status --json --fresh
ai-limits status --json --cached
ai-limits status --provider codex --json
ai-limits providers
ai-limits doctor
ai-limits dashboard
```

### 10.1 `status --json`
يجب أن:
- يعيد JSON document واحدًا صحيحًا على stdout.
- يستخدم `schema_version` ثابتًا.
- يتضمن جميع priority providers المفعّلين افتراضيًا.
- يعيد partial successes والأخطاء.
- يتضمن `generated_at` وfreshness وprovider timestamps.
- لا يحتوي ANSI.
- لا يحتوي credentials.
- يرسل diagnostics/logs إلى stderr فقط.
- يكون مناسبًا لكي ينفذه الـAgent المحلي ويرسل الناتج عبر WhatsApp.

### 10.2 Exit behavior
- exit 0 عند نجاح إنتاج aggregate snapshot حتى لو بعض المزودين غير متاحين.
- non-zero فقط عند فشل command نفسه أو arguments غير صحيحة.

### 10.3 JSON stability
- أي breaking schema change يحتاج `schema_version` جديدًا.
- إضافة الحقول تكون backward-compatible متى أمكن.

## 11. Local API والأحداث

- loopback فقط.
- read endpoints للaggregate snapshot وprovider details وhistory وsettings المطلوبة للواجهة.
- refresh actions محلية فقط.
- استخدام SSE للتحديثات إلا إذا ثبتت ضرورة WebSocket.
- validation بواسطة shared schemas.

## 12. متطلبات Dashboard

### 12.1 Overview
إظهار خمس provider cards بارزة:
- Kimi
- Codex
- Cursor
- OpenCode Go
- Gemini / Antigravity

كل بطاقة تعرض:
- provider status
- source method
- last updated
- limit windows مع progress indicators
- used/remaining
- reset time/countdown
- plan metadata إن وجدت
- warnings مثل unsupported/unavailable/auth required

### 12.2 Global controls
- Refresh All
- auto-refresh on/off
- interval selector
- آخر وقت تحديث واضح
- stale indicator

### 12.3 Provider detail
- جميع limit buckets
- connector/version information
- diagnostic reason غير سري
- recent history chart عند توفر البيانات

### 12.4 History
- تخزين snapshots الناجحة محليًا.
- عرض 24h / 7d / 30d.
- retention افتراضي 90 يومًا وقابل للتعديل.
- فشل poll لا يمسح آخر usage ناجح.

## 13. Settings

تتضمن:
- enable/disable provider
- display label override
- auto-refresh enabled
- refresh interval
- snapshot retention
- timeout overrides ضمن advanced settings فقط

ولا تتضمن أي provider secret.

## 14. نموذج الأخطاء والحالات

الحالات:
- `ok`
- `partial`
- `not_installed`
- `not_authenticated`
- `unsupported`
- `timeout`
- `parse_error`
- `unavailable`

المتطلبات:
- الاحتفاظ بآخر snapshot ناجح منفصلًا عن latest health.
- تعليم القيم القديمة stale عند فشل refresh الحالي.
- إظهار error codes ورسائل مختصرة وآمنة.
- debug التفصيلي opt-in وredacted.

## 15. متطلبات الأمان

- يمنع تسجيل credentials أو cookies أو Authorization headers أو environment dumps أو محتوى auth files.
- يمنع إرسال الأسرار عبر JSON/API/UI.
- استخدام executable + args بدل shell strings.
- تنظيف provider text قبل التخزين أو logging.
- internal command allowlists.
- رفض bind غير loopback في الإصدار الأول.
- لا يتم تنفيذ provider commands عشوائية مصدرها UI/API.
- history يتجنب personal identifiers غير الضرورية.

## 16. تخزين البيانات

SQLite يغطي:
- application settings
- provider configuration غير السرية
- provider capability/version state
- normalized snapshots
- normalized limit rows
- provider health events

القيود الدائمة:
- timestamps في UTC.
- percentages ضمن حدود منطقية عندما يكون المعنى percentage-based.
- provider/limit IDs ثابتة.
- raw provider output لا يخزن افتراضيًا.

## 17. الأداء والاعتمادية

- Dashboard تعرض cached state بسرعة بدون انتظار live refresh.
- manual refresh يعرض نتيجة كل provider عند اكتمالها.
- provider collection لا يحجب Node event loop.
- المعمارية تدعم 20 provider مستقبلًا بدون إعادة تصميم.
- CLI معلق لا يجب أن يعلق Dashboard أو aggregate command بلا نهاية.

## 18. Accessibility وتجربة الاستخدام

- keyboard accessibility.
- status text دلالي وليس اللون وحده.
- استهداف WCAG 2.2 AA للcontrast/focus.
- responsive desktop layout.
- English UI تكفي للإصدار الأول مع عدم منع Arabic localization مستقبلًا.

## 19. متطلبات الاختبارات

### 19.1 Unit
- normalized calculations
- parser fixtures لكل text connector
- JSON-RPC mapping
- timeout/error mapping
- JSON schema serialization

### 19.2 Integration
- fake provider executables/PTY fixtures
- mocked Codex app-server stdio
- SQLite repositories
- local API
- partial failure orchestration

### 19.3 UI
- provider cards لجميع الحالات
- refresh controls
- stale values
- history rendering

### 19.4 E2E
- تشغيل dashboard المحلي
- cached snapshot
- refresh عبر fake providers
- `ai-limits status --json`
- valid output بدون secret leakage

يمنع أن تتطلب الاختبارات استهلاك AI credits حقيقية.

## 20. Observability وDiagnostics

- structured local logs.
- logs الافتراضية مختصرة وredacted.
- `ai-limits doctor` يقدم تشخيصًا عمليًا.
- correlation ID لكل refresh.
- قياس provider duration/result state محليًا.

## 21. Packaging والتشغيل

- يعمل على جهاز التطوير المحلي للمستخدم.
- أوامر development وproduction local start واضحة.
- install path عملي لأمر `ai-limits`.
- بدون Docker أو PostgreSQL أو Redis أو cloud infrastructure.
- توثيق فروقات Windows/WSL.
- لا يفترض أن CLI مثبت على Windows ظاهر تلقائيًا داخل WSL أو العكس.

## 22. عقد إضافة Providers مستقبلًا

إضافة Provider جديد تتطلب Adapter واختبارات بدون تعديل business logic في Dashboard.

يجب أن يطبق Adapter:
- detect
- getVersion
- getAuthState
- getCapabilities
- fetchUsage
- normalize
- health/error mapping

اختياري:
- subscribe to live updates
- provider-specific history metadata

## 23. Demo/Seed Mode

إنشاء fixtures حتمية لجميع المزودين الخمسة لكي يتم اختبار ومراجعة Dashboard بدون حسابات فعلية أو استهلاك AI.

تتضمن:
- provider سليم بعدة windows
- provider لديه window مفقودة
- Cursor/OpenCode usage unsupported
- auth failure
- timeout
- parser format changed -> parse error

## 24. تعريف الإنجاز الكامل

يعتبر المشروع جاهزًا للاستخدام الشخصي الإنتاجي عندما:

1. توجد Connectors لكل المزودين الخمسة وتعرض available/unsupported بصدق.
2. يعمل Codex app-server usage مع fixtures ومسار موثق للتحقق من حساب حقيقي.
3. تكون parsers الخاصة بـKimi `/usage` وAntigravity `/usage` مختبرة بالfixtures.
4. لا يستهلك Cursor/OpenCode أي AI credits فقط للحصول على usage status.
5. تعرض Dashboard limits وreset times وhealth وfreshness وhistory وrefresh controls.
6. يعيد `ai-limits status --json` عقد JSON ثابتًا مناسبًا للـWhatsApp-connected local agent.
7. لا يتم تخزين أو إخراج provider credentials.
8. يعمل manual/auto refresh مع timeouts وstaggering وpartial failure isolation.
9. تمر unit/integration/UI/E2E tests بدون real AI-credit consumption.
10. يؤكد security review أن التشغيل loopback-only والlogs redacted.
11. يوثق المشروع installation وprovider support matrix وCLI commands وtroubleshooting وكيفية إضافة provider.
12. لا يبقى أي placeholder أو TODO داخل نطاق المشروع بعد final audit.
