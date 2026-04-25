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
  setDoc,
  onSnapshot,
} = require('firebase/firestore');
const path = require('path');

function loadZkLib() {
  const candidates = [
    'node-zklib',
    path.join(__dirname, '..', 'node_modules', 'node-zklib'),
  ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(candidate);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('node-zklib not found');
}

const ZKLib = loadZkLib();

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

const bridgeRef = doc(db, 'zk-bridge', 'status');
let isProcessing = false;

async function publishHeartbeat() {
  try {
    await setDoc(bridgeRef, {
      bridgeOnline: true,
      bridgeLastSeenAt: new Date().toISOString(),
      bridgeHost: process.env.COMPUTERNAME || 'unknown-host',
    }, { merge: true });
  } catch (error) {
    console.error('Heartbeat error:', String(error?.message || error));
  }
}

async function processPendingRequest(data) {
  if (!data || data.status !== 'pending') return;
  if (isProcessing) return;

  // تجاهل إذا كان الطلب قديماً (أكثر من 10 دقائق)
  const requestedAt = data.requestedAt?.toDate?.() || new Date(data.requestedAt || 0);
  if (Number.isNaN(requestedAt.getTime()) || (Date.now() - requestedAt.getTime() > 10 * 60 * 1000)) {
    console.log('⚠️  طلب قديم أو غير صالح، تم تجاهله.');
    return;
  }

  isProcessing = true;

  const ip = data.zkIp || ZK_IP;
  const port = data.zkPort || ZK_PORT;

  console.log(`\n📥 طلب مزامنة جديد من: ${data.requestedBy || 'مجهول'}`);
  console.log(`   الجهاز: ${ip}:${port}`);

  await setDoc(bridgeRef, {
    ...data,
    bridgeOnline: true,
    bridgeLastSeenAt: new Date().toISOString(),
    status: 'processing',
    processingAt: new Date().toISOString(),
  }, { merge: true });

  const zk = new ZKLib(ip, Number(port), 10000, 4000);
  try {
    console.log('🔌 جاري الاتصال بجهاز البصمة...');
    await zk.createSocket();

    await new Promise((r) => setTimeout(r, 1500));

    console.log('👥 جاري جلب المستخدمين...');
    const users = await zk.getUsers();

    console.log('📋 جاري جلب سجلات الحضور...');
    const attendances = await zk.getAttendances();

    try { await zk.disconnect(); } catch (_) { }

    const result = {
      users: users.data || [],
      attendances: attendances.data || [],
    };

    console.log(`✅ تمت المزامنة: ${result.users.length} مستخدم، ${result.attendances.length} سجل`);

    await setDoc(bridgeRef, {
      status: 'done',
      requestedAt: data.requestedAt,
      requestedBy: data.requestedBy,
      zkIp: ip,
      zkPort: port,
      completedAt: new Date().toISOString(),
      bridgeOnline: true,
      bridgeLastSeenAt: new Date().toISOString(),
      result,
    }, { merge: true });

    console.log('☁️  تم رفع النتيجة إلى Firebase بنجاح.\n');
  } catch (error) {
    try { await zk.disconnect(); } catch (_) { }

    const errMsg = String(error?.message || error?.code || error);
    console.error('❌ خطأ:', errMsg);

    let friendlyError = 'فشل الاتصال: ';
    if (errMsg.includes('ETIMEDOUT')) friendlyError += 'انتهت المهلة. تأكد أن الجهاز يعمل.';
    else if (errMsg.includes('ECONNREFUSED')) friendlyError += 'تم رفض الاتصال. تحقق من المنفذ.';
    else if (errMsg.includes('EHOSTUNREACH')) friendlyError += 'الجهاز غير متاح على الشبكة.';
    else friendlyError += errMsg;

    await setDoc(bridgeRef, {
      status: 'error',
      requestedAt: data.requestedAt,
      requestedBy: data.requestedBy,
      zkIp: ip,
      zkPort: port,
      completedAt: new Date().toISOString(),
      bridgeOnline: true,
      bridgeLastSeenAt: new Date().toISOString(),
      error: friendlyError,
    }, { merge: true });
  } finally {
    isProcessing = false;
  }
}

onSnapshot(bridgeRef, async (snapshot) => {
  if (!snapshot.exists()) return;
  await processPendingRequest(snapshot.data());
}, (error) => {
  console.error('Firestore watch error:', String(error?.message || error));
});

// نبض حياة دوري + فحص دوري احتياطي (لو stream انقطع)
setInterval(async () => {
  await publishHeartbeat();
}, 15000);

// نبضة أولى عند التشغيل
publishHeartbeat().catch(() => { });

// إبقاء البرنامج يعمل
process.on('SIGINT', () => {
  console.log('\n🛑 تم إيقاف الـ Bridge.');
  process.exit(0);
});
