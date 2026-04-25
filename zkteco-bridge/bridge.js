/**
 * ZKTeco Firebase Bridge
 * ─────────────────────────────────────────────────────────────────────────────
 * يُشغَّل هذا البرنامج على كمبيوتر العمل (المتصل بجهاز البصمة).
 * يراقب Firebase كل 5 ثواني، فإذا وُجد طلب مزامنة جديد:
 *   1. يتصل بجهاز البصمة
 *   2. يجلب المستخدمين وسجلات الحضور
 *   3. يرفع النتيجة إلى Firebase
 *   4. يقرأ الموقع النتيجة من أي مكان
 *
 * التثبيت (مرة واحدة على كمبيوتر العمل):
 *   npm install firebase node-zklib
 *
 * التشغيل:
 *   node bridge.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} = require('firebase/firestore');
const ZKLib = require('node-zklib');

// ─── إعدادات Firebase (نفس إعدادات الموقع) ──────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU",
  authDomain: "newproject2-2afdc.firebaseapp.com",
  projectId: "newproject2-2afdc",
  storageBucket: "newproject2-2afdc.firebasestorage.app",
  messagingSenderId: "133801940558",
  appId: "1:133801940558:web:39e564c9c1698a7695151f"
};

// ─── إعدادات جهاز البصمة ─────────────────────────────────────────────────────
// غيّر هذه القيم حسب إعدادات شبكة العمل
const ZK_IP   = process.env.ZK_IP   || '192.168.1.100';
const ZK_PORT = process.env.ZK_PORT  || 4370;

// ─── التهيئة ──────────────────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const BRIDGE_DOC = 'zk-bridge/status';   // مسار وثيقة الحالة في Firestore

console.log('==============================================');
console.log(' ZKTeco Firebase Bridge - كمبيوتر العمل');
console.log('==============================================');
console.log(` جهاز البصمة: ${ZK_IP}:${ZK_PORT}`);
console.log(' يراقب Firebase للطلبات الواردة...');
console.log('==============================================\n');

// ─── مراقبة Firestore بـ onSnapshot (فوري) ───────────────────────────────────
const bridgeRef = doc(db, 'zk-bridge', 'status');

onSnapshot(bridgeRef, async (snapshot) => {
  if (!snapshot.exists()) return;

  const data = snapshot.data();

  // تجاهل إذا لم يكن الطلب "pending"
  if (data.status !== 'pending') return;

  // تجاهل إذا كان الطلب قديماً (أكثر من 5 دقائق)
  const requestedAt = data.requestedAt?.toDate?.() || new Date(data.requestedAt || 0);
  if (Date.now() - requestedAt.getTime() > 5 * 60 * 1000) {
    console.log('⚠️  طلب قديم، تم تجاهله.');
    return;
  }

  const ip   = data.zkIp   || ZK_IP;
  const port = data.zkPort || ZK_PORT;

  console.log(`\n📥 طلب مزامنة جديد من: ${data.requestedBy || 'مجهول'}`);
  console.log(`   الجهاز: ${ip}:${port}`);

  // تحديث الحالة إلى "جاري المعالجة"
  await setDoc(bridgeRef, {
    ...data,
    status: 'processing',
    processingAt: new Date().toISOString(),
  });

  // الاتصال بجهاز البصمة
  const zk = new ZKLib(ip, Number(port), 10000, 4000);
  try {
    console.log('🔌 جاري الاتصال بجهاز البصمة...');
    await zk.createSocket();

    await new Promise(r => setTimeout(r, 1500));

    console.log('👥 جاري جلب المستخدمين...');
    const users = await zk.getUsers();

    console.log('📋 جاري جلب سجلات الحضور...');
    const attendances = await zk.getAttendances();

    try { await zk.disconnect(); } catch (_) {}

    const result = {
      users:       users.data       || [],
      attendances: attendances.data || [],
    };

    console.log(`✅ تمت المزامنة: ${result.users.length} مستخدم، ${result.attendances.length} سجل`);

    // رفع النتيجة إلى Firebase
    await setDoc(bridgeRef, {
      status:      'done',
      requestedAt: data.requestedAt,
      requestedBy: data.requestedBy,
      zkIp:        ip,
      zkPort:      port,
      completedAt: new Date().toISOString(),
      result,
    });

    console.log('☁️  تم رفع النتيجة إلى Firebase بنجاح.\n');

  } catch (error) {
    try { await zk.disconnect(); } catch (_) {}

    const errMsg = String(error.message || error.code || error);
    console.error('❌ خطأ:', errMsg);

    let friendlyError = 'فشل الاتصال: ';
    if (errMsg.includes('ETIMEDOUT'))    friendlyError += 'انتهت المهلة. تأكد أن الجهاز يعمل.';
    else if (errMsg.includes('ECONNREFUSED')) friendlyError += 'تم رفض الاتصال. تحقق من المنفذ.';
    else if (errMsg.includes('EHOSTUNREACH')) friendlyError += 'الجهاز غير متاح على الشبكة.';
    else friendlyError += errMsg;

    await setDoc(bridgeRef, {
      status:      'error',
      requestedAt: data.requestedAt,
      requestedBy: data.requestedBy,
      zkIp:        ip,
      zkPort:      port,
      completedAt: new Date().toISOString(),
      error:       friendlyError,
    });
  }
});

// إبقاء البرنامج يعمل
process.on('SIGINT', () => {
  console.log('\n🛑 تم إيقاف الـ Bridge.');
  process.exit(0);
});
