# Fingerprint Master Plan / الخطة الرئيسية لنظام البصمة

## Working Mode / وضع العمل

- Development only until the full scope is approved.
- No Git commit, push, or deployment until final sign-off.
- All new planning and user-facing labels for this scope should support Arabic and English.

- التنفيذ في وضع التطوير فقط حتى اعتماد كامل النطاق.
- لا يوجد رفع إلى Git أو نشر حتى الموافقة النهائية.
- كل الخطة والعناصر الظاهرة للمستخدم في هذا المسار تكون عربية وإنجليزية.

## Goals / الأهداف

1. Centralize branch fingerprint device settings with cloud + local persistence.
2. Isolate branch fingerprint identity so one branch cannot affect another by mistake.
3. Map device user numbers to employee names per branch.
4. Provide a branch-facing daily operations page and an admin-facing global oversight page.
5. Keep the system functional offline with local cache, then sync to cloud.
6. Leave cross-branch fingerprint template sync as a controlled advanced phase.

1. توحيد إعدادات جهاز البصمة لكل فرع مع حفظ سحابي ومحلي.
2. عزل هوية البصمة لكل فرع حتى لا يؤثر فرع على آخر بالخطأ.
3. ربط أرقام مستخدمي جهاز البصمة بأسماء الموظفين داخل كل فرع.
4. توفير صفحة تشغيل يومي للفرع وصفحة إشراف عامة للإدارة.
5. إبقاء النظام عاملاً بدون إنترنت عبر التخزين المحلي ثم المزامنة مع السحابة.
6. جعل مزامنة قوالب البصمة بين الفروع مرحلة متقدمة ومنضبطة.

## Core Data Model / نموذج البيانات الأساسي

### Branch Device Settings / إعدادات جهاز الفرع

- `branchId`
- `branchName`
- `zkIp`
- `zkPort`
- `bridgeId`
- `bridgeStatus`
- `lastSyncAt`
- `updatedAt`

### Employee Fingerprint Mapping / ربط البصمة بالموظف

- `branchId`
- `deviceUserId`
- `employeeId`
- `employeeName`
- `fingerprintLabel`
- `status` (`mapped`, `unmapped`, `needs_review`)
- `updatedAt`

### Why This Matters / لماذا هذا مهم

- The same device user number can repeat across branches.
- Mapping must use `branchId + deviceUserId`, not `deviceUserId` alone.

- يمكن تكرار نفس رقم المستخدم في أجهزة فروع مختلفة.
- لذلك الربط الصحيح يكون عبر `branchId + deviceUserId` وليس رقم الجهاز وحده.

## Persistence Strategy / استراتيجية الحفظ

### Cloud / السحابة

- Source of truth for branch device settings.
- Source of truth for employee fingerprint mappings.
- Source of truth for branch sync state and audit timestamps.

- المرجع الأساسي لإعدادات أجهزة الفروع.
- المرجع الأساسي لربط أرقام البصمة بالموظفين.
- المرجع الأساسي لحالة المزامنة والطوابع الزمنية.

### Local / المحلي

- Cached copy of branch settings for offline operation.
- Cached mapping data for fast lookup while reviewing imported logs.
- Pending queue for updates created while offline.

- نسخة مخزنة من إعدادات الفرع للعمل بدون إنترنت.
- نسخة مخزنة من ربط الأرقام بالأسماء لعرض النتائج بسرعة.
- قائمة انتظار للتغييرات التي حدثت أثناء انقطاع الشبكة.

### Sync Rule / قاعدة المزامنة

- Cloud-first when online.
- Local fallback when offline.
- Automatic reconciliation when connection returns.

- السحابة هي الأساس عند توفر الاتصال.
- التخزين المحلي هو البديل عند انقطاع الشبكة.
- تتم المزامنة التلقائية عند عودة الاتصال.

## Branch Page / صفحة الفرع

### Purpose / الهدف

- Daily operational page for one branch only.
- Simple, safe, and limited to branch scope.

- صفحة تشغيل يومي لفرع واحد فقط.
- بسيطة وآمنة ومحصورة داخل نطاق الفرع.

### Contains / تحتوي على

1. Branch fingerprint device settings.
2. Bridge connection state and last sync time.
3. Pull fingerprint logs for this branch only.
4. Save imported logs and show branch-specific errors.
5. Map device user numbers to employee names inside the branch.
6. Branch attendance summaries and filters.
7. Branch work schedules and deficit rules.

1. إعدادات جهاز البصمة للفرع.
2. حالة الجسر وآخر وقت مزامنة.
3. سحب سجلات البصمة لهذا الفرع فقط.
4. حفظ السجلات المستوردة وعرض أخطاء هذا الفرع فقط.
5. ربط أرقام الجهاز بأسماء الموظفين داخل نفس الفرع.
6. تقارير حضور الفرع مع الفلاتر.
7. جداول دوام الفرع وقواعد النقص.

### Must Not Contain / لا يجب أن تحتوي على

- Cross-branch editing.
- Global overrides for all branches.
- Central supervision dashboards.

- تعديل بيانات فروع أخرى.
- أوامر عامة تؤثر على جميع الفروع.
- لوحات المتابعة المركزية للإدارة.

## Admin Page / صفحة الإدارة

### Purpose / الهدف

- Oversight and control across all branches.
- Used by supervisors and central administration.

- الإشراف والتحكم على مستوى جميع الفروع.
- مخصصة للمشرفين والإدارة المركزية.

### Contains / تحتوي على

1. Live status of each branch bridge and fingerprint device.
2. Last sync state for every branch.
3. Global attendance reports and comparisons.
4. Review queue for unmapped fingerprint numbers.
5. Central branch settings management.
6. Audit visibility for mapping and sync changes.
7. Future template distribution controls if implemented.

1. الحالة الحية لكل جسر وكل جهاز بصمة في الفروع.
2. آخر حالة مزامنة لكل فرع.
3. تقارير حضور مجمعة ومقارنات بين الفروع.
4. قائمة مراجعة للأرقام غير المعرفة.
5. إدارة مركزية لإعدادات الفروع.
6. متابعة التعديلات على الربط والمزامنة.
7. أدوات توزيع القوالب مستقبلاً إذا تم تنفيذها.

## Identity and Routing / الهوية والتوجيه

### Required Identifiers / المعرفات المطلوبة

- `branchId` for branch ownership.
- `bridgeId` for the branch-side bridge process.
- `targetBridgeId` on remote requests.

- `branchId` لتحديد ملكية الفرع.
- `bridgeId` لتحديد الجسر العامل في الفرع.
- `targetBridgeId` داخل الطلبات المرسلة عن بعد.

### Routing Rule / قاعدة التوجيه

- A bridge must ignore requests that do not match its own identity.
- Branch A requests must not be executed by Branch B.

- يجب على الجسر تجاهل أي طلب لا يطابق هويته.
- طلبات فرع أ لا يجوز أن ينفذها جسر فرع ب.

## Employee Identification / تعريف الموظف

### Current Scope / النطاق الحالي

- Convert device numbers into recognizable employee names per branch.
- Persist mappings locally and in cloud.
- Show unknown device numbers as unmapped until reviewed.

- تحويل أرقام الجهاز إلى أسماء موظفين واضحة داخل كل فرع.
- حفظ الربط محليًا وسحابيًا.
- عرض الأرقام غير المعروفة كحالات تحتاج مراجعة.

### Important Limitation / قيد مهم

- Mapping a number to an employee does not make another branch device recognize the fingerprint.
- Recognition on another device requires the fingerprint template to exist on that device.

- ربط الرقم بالموظف لا يجعل جهاز فرع آخر يتعرف على البصمة تلقائيًا.
- التعرف على جهاز آخر يتطلب وجود قالب البصمة داخل ذلك الجهاز.

## Cross-Branch Template Sync / مزامنة قوالب البصمة بين الفروع

### Phase Type / نوع المرحلة

- Advanced optional phase after the base branch/admin system is stable.

- مرحلة متقدمة اختيارية بعد استقرار نظام الفروع والإدارة الأساسي.

### Goal / الهدف

- Allow an employee already registered in one branch device to be recognized in another branch device.

- تمكين الموظف المسجل في جهاز فرع من أن يتعرف عليه جهاز فرع آخر.

### Preconditions / الشروط المسبقة

1. Confirm the ZKTeco library can read and write fingerprint templates safely.
2. Define consent and auditing rules.
3. Track which branch devices already contain each employee template.

1. التأكد أن مكتبة ZKTeco تدعم قراءة ورفع قوالب البصمة بشكل آمن.
2. تحديد قواعد الموافقة والتتبع.
3. تسجيل الأجهزة التي تحتوي قالب كل موظف.

## Roles and Permissions / الأدوار والصلاحيات

### Branch Role / دور الفرع

- Can manage only its own device settings, mappings, logs, and schedules.

- يدير فقط إعدادات جهازه وربطاته وسجلاته ودواماته.

### Admin Role / دور الإدارة

- Can view and manage all branches.
- Can review and correct branch mappings.
- Can monitor global sync health.

- يرى ويدير جميع الفروع.
- يراجع ويصحح الربط في الفروع.
- يراقب صحة المزامنة العامة.

## Delivery Phases / مراحل التنفيذ

### Phase 1 / المرحلة الأولى

- Cloud + local persistence for branch fingerprint settings.
- Add identity-safe branch/bridge routing.

- الحفظ السحابي والمحلي لإعدادات أجهزة الفروع.
- إضافة توجيه آمن يعتمد على هوية الفرع والجسر.

### Phase 2 / المرحلة الثانية

- Branch-level employee fingerprint mapping.
- Review workflow for unmapped numbers.

- ربط أرقام البصمة بالموظفين لكل فرع.
- مسار مراجعة للأرقام غير المعرفة.

### Phase 3 / المرحلة الثالثة

- Separate branch page and admin page behavior.
- Enforce role-based visibility.

- فصل سلوك صفحة الفرع عن صفحة الإدارة.
- تطبيق الصلاحيات حسب الدور.

### Phase 4 / المرحلة الرابعة

- Optional template sync research and implementation.

- بحث وتنفيذ مزامنة القوالب عند الحاجة.

## Development Policy / سياسة التطوير

- Build and test everything locally first.
- Keep changes in development until the user approves the complete flow.
- Release only after end-to-end verification.

- بناء واختبار كل شيء محليًا أولاً.
- إبقاء التغييرات في وضع التطوير حتى اعتماد المسار كاملًا.
- الإطلاق فقط بعد التحقق الكامل من البداية للنهاية.

## Immediate Next Step / الخطوة التالية المباشرة

- Implement Phase 1 in development mode only.
- Start with cloud + local branch device settings, then add identity-safe routing.

- تنفيذ المرحلة الأولى في وضع التطوير فقط.
- البدء بحفظ إعدادات الفروع سحابيًا ومحليًا، ثم إضافة التوجيه الآمن بحسب الهوية.