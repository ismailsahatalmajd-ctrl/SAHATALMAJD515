# بناء تطبيق Electron لسطح المكتب

## الملفات المطلوبة

تم إنشاء جميع الملفات:
- ✅ `electron.js` - ملف العملية الرئيسية
- ✅ `package.json` - محدّث بإعدادات Electron
- ✅ Dependencies مثبتة (`electron`, `electron-builder`, `electron-is-dev`)

## الطرق المتاحة للتشغيل

### 1. التطوير (Development Mode)
```bash
# في terminal منفصل: شغّل Next.js server
npm run dev

# في terminal آخر: شغّل Electron
npm run electron:dev
```

### 2. البناء الكامل (Production Build)
```bash
npm run electron:build
```

### 3. البديل: Portable Build
```bash
npm run electron:build-portable
```

## الملاحظات المهمة

### المشكلة الحالية
electron-builder يواجه مشكلة في التكوين بسبب حجم مجلد `.next` الكبير.

### الحلول البديلة

#### الحل 1: استخدام Next.js Export
```bash
# 1. Build static export
npm run export

# 2. Update electron.js to point to out/index.html
# (في الوضع الإنتاجي)

# 3. Build Electron
electron-builder --win portable
```

#### الحل 2: استخدام تطبيق الويب مباشرة
يمكن استخدام الرابط المباشر من Vercel:
- https://sahatcom.cards

نسخة سطح المكتب البديلة:
- متصفح Chrome/Edge → "تثبيت التطبيق" (PWA)
- ميزة "Create shortcut" لإنشاء اختصار سطح مكتب

## الخطوات التالية للمستخدم

### الخيار الأفضل حالياً
استخدام PWA (Progressive Web App):
1. افتح https://sahatcom.cards في Chrome
2. اضغط على القائمة (⋮) → "تثبيت التطبيق"
3. سيظهر أيقونة على سطح المكتب

### لبناء Electron محلياً (يتطلب إصلاح)
```bash
# Install dependencies if not already
npm install

# Try running in development first
npm run dev         # In one terminal
npm run electron:dev  # In another terminal
```

### ملاحظة تقنية
المشكلة في electron-builder غالباً بسبب:
- حجم `.next` الكبير (يحتوي على الكثير من node_modules)
- التكوين يحتاج تعديل للإشارة للملفات الصحيحة

الحل المستقبلي: استخدام Next.js Standalone build أو Static Export.
