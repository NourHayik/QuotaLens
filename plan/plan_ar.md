# لوحة حدود استخدام الذكاء الاصطناعي — خطة التنفيذ التسلسلية

## كيفية تنفيذ هذه الخطة

لكل مرحلة أعطِ الـcoding agent التعليمات التالية:

> اقرأ `requerment_en.md` و`plan_en.md` و`research.md` و`todo.md`. افحص المستودع الحالي. نفذ Phase N فقط وبشكل كامل. لا تنفذ مراحل لاحقة. حافظ على المعمارية وقيود الأمان. أضف أو حدّث الاختبارات المطلوبة للمرحلة. نفذ كل أوامر وفحوص التحقق المحددة للمرحلة، أصلح أي فشل، ثم حدّث `todo.md`. لا تعتبر TODO مكتملة إلا بعد وجود التنفيذ ونجاح التحقق. لا تعتبر المرحلة مكتملة إلا بعد اكتمال كل العناصر التابعة ومعايير القبول.

تم تحديد حجم المراحل على افتراض استخدام coding agent حديث وقوي لديه صلاحية الوصول للمستودع والأدوات وسياق كافٍ لقراءة ملفات المواصفات والتنفيذ ذات الصلة. تم إبقاء تكاملات المزودين معزولة حتى لا يؤدي connector معقد أو parser كبير إلى تحميل مراحل أخرى بلا داعٍ.

---

## Phase 1 — تأسيس المستودع والعقود وبيئة التشغيل المحلية

### الهدف
إنشاء أساس المشروع والعقود الموحدة وحدود runtime والبنية الاختبارية دون تنفيذ مزودين حقيقيين بعد.

### النطاق
- تهيئة Node.js + TypeScript strict mode باستخدام pnpm.
- إنشاء modules للdomain وapplication وproviders وprocess infrastructure وstorage وCLI وserver وweb.
- تعريف schemas/types موحدة لحالة provider وcapabilities وusage limits وsnapshots والأخطاء وfreshness وschema version.
- إضافة Zod validation للعقود العامة.
- إنشاء subprocess abstraction آمن يدعم args arrays وtimeouts وcancellation وفصل stdout/stderr وredaction.
- تعريف PTY abstraction بدون provider-specific logic بعد.
- structured logging مع secret redaction.
- test/lint/format/type-check baseline.
- fake provider adapter للتحقق من المعمارية.

### المعمارية / القيود
- domain/application لا تعتمد على provider-specific أو UI modules.
- لا shell strings من مدخلات المستخدم.
- لا credential storage.
- لا LLM calls.

### التحقق
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- اختبارات schemas وtimeouts وerrors.
- مراجعة dependency direction.

### معايير القبول
- build/test baseline ناجح.
- fake provider ينتج normalized snapshot.
- hung fake process يتم إنهاؤه.
- logs تطبق redaction.

### إجراء الإكمال
1. إنهاء نطاق Phase 1 فقط.
2. تنفيذ التحقق بالكامل.
3. إصلاح كل فشل.
4. تأكيد معايير القبول.
5. تحديث `todo.md`.
6. عدم بدء Phase 2 قبل اكتمال Phase 1.

---

## Phase 2 — SQLite وRefresh Orchestration وCache Semantics

### الهدف
تنفيذ محرك orchestration والتخزين المحلي قبل ربط المزودين الحقيقيين.

### النطاق
- SQLite schema/repositories للsettings وprovider capability وsnapshots وlimits وhealth events.
- migrations وsafe startup.
- provider registry وenable/disable settings.
- aggregate refresh بbounded concurrency.
- partial failure isolation.
- فصل last-good snapshot عن latest-health.
- freshness/stale calculation.
- forced refresh وcached-only read.
- stagger/cooldown primitives للauto-refresh.
- retention افتراضي 90 يومًا مع pruning.

### المعمارية / القيود
- فشل refresh لا يمسح last-good data.
- timestamps في UTC.
- raw provider output لا يخزن افتراضيًا.

### التحقق
- migration tests.
- integration tests لمزودين healthy/failing/timeout/partial.
- retention/stale tests.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`.

### معايير القبول
- refresh متعدد المزودين يعيد نتائج مستقلة.
- مزود واحد لا يفشل aggregate.
- cached read لا يشغل providers.
- history قابلة للاستعلام.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث عناصر Phase 2 بعد نجاح التحقق فقط.

---

## Phase 3 — واجهة CLI وعقد JSON ثابت

### الهدف
تسليم الواجهة التي سيستخدمها الـAgent المتصل بWhatsApp قبل ربط المزودين الحقيقيين.

### النطاق
- تنفيذ CLI `ai-limits` باستخدام نفس application services.
- الأوامر:
  - `status`
  - `status --json`
  - `status --json --fresh`
  - `status --json --cached`
  - `status --provider <id> --json`
  - `providers`
  - `doctor`
  - placeholder لـ`dashboard`
- JSON document واحد فقط على stdout.
- diagnostics/logs على stderr.
- `schema_version` = `1.0`.
- exit code rules.
- human-readable table mode.
- deterministic demo mode.

### المعمارية / القيود
- CLI transport فقط ولا يكرر business/provider logic.
- JSON بدون ANSI أو secrets.

### التحقق
- Zod schema validation.
- shell-level stdout JSON parsing.
- partial failure -> exit 0 + error entry.
- initialization failure -> non-zero.
- stdout/stderr separation.

### معايير القبول
- يستطيع local automation agent تنفيذ `ai-limits status --json --cached` والحصول على JSON صحيح.
- `--fresh` يستدعي نفس refresh service.
- العقد موثق ومختبر.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث Phase 3 بعد التحقق فقط.

---

## Phase 4 — Codex Connector عبر App Server

### الهدف
تنفيذ أقوى structured integration أولًا: OpenAI Codex.

### النطاق
- اكتشاف `codex` والنسخة وحالة auth.
- إدارة `codex app-server --stdio`.
- JSON-RPC initialization.
- `account/rateLimits/read`.
- تطبيع `rateLimits`, `rateLimitsByLimitId`, primary/secondary windows, `usedPercent`, `windowDurationMins`, `resetsAt`, plan type وcredits.
- الاحتفاظ بكل buckets بدون افتراض 5-hour + weekly دائمًا.
- strict timeouts وgraceful termination.
- deterministic `/status` fallback عند الحاجة.
- sanitized fixtures تشمل حسابًا بنافذة واحدة فقط.

### المعمارية / القيود
- لا تخمين لأي window مفقودة.
- لا تشغيل Codex model/prompt.

### التحقق
- mocked stdio JSON-RPC tests.
- fixtures كاملة وpartial وnull وmalformed وtimeout وunauthenticated.
- reset/percentage normalization.
- secret leakage checks.

### معايير القبول
- `ai-limits status --provider codex --json --fresh` يعيد normalized Codex data.
- missing windows تبقى مفقودة.
- app-server failure له fallback/error آمن.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث Phase 4 بعد التحقق فقط.

---

## Phase 5 — Kimi وAntigravity PTY Usage Connectors

### الهدف
تنفيذ المزودين اللذين يملكان `/usage` موثقًا باستخدام PTY حتمي.

### النطاق
#### Kimi
- اكتشاف `kimi` والنسخة.
- controlled PTY session.
- تشغيل `/usage` بدون AI prompt.
- capture + ANSI stripping + clean termination.
- parsing للquota/membership fields.

#### Antigravity
- اكتشاف `agy` والنسخة.
- controlled PTY.
- تشغيل `/usage` بدون AI prompt.
- parsing لكل model/quota bucket بشكل منفصل.
- الاحتفاظ model IDs/names.

#### Shared PTY
- timeouts, readiness detection, cancellation, Windows/WSL abstraction.
- versioned sanitized fixtures.
- unknown format -> `parse_error` مع last-good stale data.

### المعمارية / القيود
- لا LLM parsing.
- لا AI prompt للحصول على usage.
- parsers حتمية ومختبرة بالكامل.

### التحقق
- PTY simulation tests.
- fixtures لحالات healthy/missing/auth failure/quota exhausted/format drift/timeout.
- التأكد من أن `/usage` لا يذهب لمسار normal model prompt في harness الاختبار.
- full test/lint/type-check.

### معايير القبول
- كلا connectorين يعيدان normalized quota data من fixtures المدعومة.
- model quotas الخاصة بـAntigravity تبقى منفصلة.
- parser drift يفشل بوضوح.
- لا يتم استهلاك AI credits عمدًا لعملية الجمع.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث Phase 5 بعد التحقق فقط.

---

## Phase 6 — Cursor وOpenCode Go Capability-Aware Connectors

### الهدف
دعم الاشتراكين المتبقيين بدون كسر قاعدة zero-AI-credit عندما لا يعرض CLI live usage.

### النطاق
#### Cursor
- اكتشاف `cursor-agent` والنسخة.
- `cursor-agent status` لحالة auth.
- probing للcommands/help لاكتشاف deterministic usage surface.
- استخدامه إن وجد.
- وإلا `usage_capability: unsupported` مع السبب.

#### OpenCode Go
- اكتشاف `opencode` والنسخة.
- auth-list metadata بدون secrets.
- probing لأي Go-specific deterministic usage command.
- استخدامه إذا وجد وإلا `unsupported`.

#### Compatibility
- capability matrix fields: tested version, acquisition method, fallback, last probe.
- fixtures لمسارات structured usage المستقبلية بدون تغيير core contract.

### المعمارية / القيود
- ممنوع `cursor-agent -p` أو `opencode run` لسؤال model عن quota.
- لا قراءة/إخراج محتوى auth file.
- لا حساب live usage من static plan limits فقط.

### التحقق
- fake executable tests.
- secret leakage tests.
- unsupported path tests.
- structured future fixture mapping.
- full suite.

### معايير القبول
- Cursor/OpenCode يظهران في aggregate حتى إن كان live quota unsupported.
- الحالة تميز بين installed/authenticated وquota-readable.
- لا AI inference لاكتشاف الاستخدام.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث Phase 6 بعد التحقق فقط.

---

## Phase 7 — Local API وDashboard وHistory وAuto-Refresh

### الهدف
بناء Dashboard فوق core وCLI العاملين.

### النطاق
- Fastify loopback-only.
- رفض non-loopback binding.
- validated endpoints للsnapshot/provider/history/settings/refresh.
- SSE update stream.
- React/Vite dashboard.
- خمس priority provider cards.
- progress/used/remaining/reset/source/freshness/errors/last update.
- Refresh All وper-provider refresh.
- auto-refresh toggle و15s/30s/60s/5m.
- auto-refresh off افتراضيًا و60s عند تشغيله.
- stagger polling.
- provider detail و24h/7d/30d history.
- settings للproviders/labels/interval/retention.
- `ai-limits dashboard` يفتح الواجهة المحلية.

### المعمارية / القيود
- UI لا تشغل provider commands مباشرة.
- API وCLI يستخدمان application services نفسها.
- SSE بدل WebSocket ما لم توجد ضرورة.

### التحقق
- API schema + loopback tests.
- React tests لجميع الحالات.
- scheduler fake timers.
- SSE integration.
- keyboard/focus/status accessibility checks.

### معايير القبول
- Dashboard تعرض cached values مباشرة.
- fresh results تحدث بشكل مستقل.
- تعطيل auto-refresh يوقف polling.
- unsupported Cursor/OpenCode واضح وليس 0% مضللًا.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث Phase 7 بعد التحقق فقط.

---

## Phase 8 — Diagnostics وSecurity Hardening وPackaging وReal-Provider Validation

### الهدف
تقوية الأداة للاستخدام اليومي والتحقق من المزودين الخمسة الحقيقيين.

### النطاق
- إكمال `ai-limits doctor`.
- Windows/WSL diagnostics.
- log retention/rotation عند الحاجة.
- secret leak review عبر logs/JSON/DB/API/errors.
- command allowlist وinjection tests.
- child process cleanup عند shutdown/crash.
- packaging/install لأمر `ai-limits`.
- startup وoptional autostart docs.
- manual validation للproviders المثبتة بدون تسجيل أسرار.
- support matrix مع tested CLI versions.
- تحديث parsers من sanitized captures فقط.

### المعمارية / القيود
- real-provider validation لا يرسل model prompts فقط لاختبار usage.
- لا raw sensitive capture في repository.

### التحقق
- security suite.
- `ai-limits doctor` لحالات installed/missing.
- package install/uninstall smoke test.
- fresh/cached CLI smoke tests.
- dashboard launch smoke test.
- SQLite backup/restore test.

### معايير القبول
- local install يعمل بدون Docker أو server infra.
- لا يوجد known credential leakage path.
- المزودون الخمسة لديهم tested/unsupported status موثق.
- hung child processes تنظف بشكل صحيح.

### إجراء الإكمال
اتبع الإجراء القياسي وحدّث Phase 8 بعد التحقق فقط.

---

## Phase 9 — Full E2E وProduction-Readiness Closure

### الهدف
إجراء المراجعة النهائية requirement-by-requirement وإصلاح جميع blockers.

### النطاق
- إعادة قراءة `requerment_en.md`, `research.md`, `plan_en.md`, `todo.md`.
- ربط كل requirement بدليل implementation.
- full unit/integration/UI/E2E.
- سيناريو cached dashboard -> fresh refresh -> partial failure -> recovery.
- سيناريو `ai-limits status --json` يتم استهلاكه بواسطة automation script عام.
- provider timeout والبقية تنجح.
- parser drift -> stale last-good + parse error.
- التحقق أن لا collector path يستخدم LLM/model prompt.
- loopback-only verification.
- retention/pruning وbackup/restore docs.
- accessibility/responsive checks.
- dependency/security audit.
- إزالة debug code/placeholders/bypasses/dead code/in-scope TODOs.
- إنهاء README وsupport matrix وJSON schema docs وtroubleshooting وprovider-extension guide.

### التحقق
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- production builds
- Playwright E2E
- dependency/security audit
- JSON schema contract test
- loopback binding check
- `ai-limits doctor`
- requirements traceability checklist

### معايير القبول
- كل Definition of Done item لديه evidence.
- كل automated suites ناجحة.
- لا high-severity security issue غير محلولة بدون mitigation موثق.
- لا provider credential مخزنة أو مكشوفة.
- CLI JSON ثابت ومناسب للـexternal agent.
- Dashboard وCLI يشتركان في نفس normalized source of truth.
- final production-readiness TODO لا يتم تأشيرها إلا بعد نجاح جميع ما سبق.

### إجراء الإكمال
1. إكمال المراجعة النهائية.
2. إصلاح كل blocker.
3. إعادة تنفيذ verification بالكامل.
4. تأكيد جميع requirements وDefinition of Done.
5. تحديث كل Phase 9 TODOs.
6. تأشير final production-readiness فقط عندما يكون المشروع كاملًا ومتحققًا منه.
