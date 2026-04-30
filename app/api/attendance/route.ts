import { NextResponse } from 'next/server';
import { initAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export async function POST(request: Request) {
  console.log('[ADMS-ADMIN] Starting processing...');
  try {
    const adminApp = initAdminApp();
    const db = getFirestore(adminApp);
    
    console.log('[ADMS-ADMIN] Firestore Admin initialized');

    const data = await request.text();
    const { searchParams } = new URL(request.url);
    const deviceSn = searchParams.get('SN');
    const table = searchParams.get('table');

    if (table === 'ATTLOG') {
      const lines = data.split('\n').filter(line => line.trim());
      console.log(`[ADMS-ADMIN] Processing ${lines.length} logs from SN: ${deviceSn}`);

      // 1. Find branch
      let branchId = "unknown_branch";
      if (deviceSn) {
        try {
            const branchSnap = await db.collection('branches')
              .where('fingerprintConfig.bridgeId', '==', deviceSn)
              .get();
            if (!branchSnap.empty) branchId = branchSnap.docs[0].id;
        } catch (e) {
            console.error('[ADMS-ADMIN] Branch search failed:', e);
        }
      }

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const userId = parts[0].trim();
        const checkTime = parts[1].trim();

        if (userId && checkTime) {
          // 2. Find employee
          const empSnap = await db.collection('employees')
            .where('fingerprintId', '==', userId)
            .get();
          
          let employeeName = `User #${userId}`;
          let employeeBranchId = branchId;

          if (!empSnap.empty) {
            const empData = empSnap.docs[0].data();
            employeeName = empData.name;
            if (employeeBranchId === "unknown_branch") employeeBranchId = empData.branchId || "";
          }

          // 3. Save Record
          await db.collection('absenceRecords').add({
            employeeId: userId,
            employeeName: employeeName,
            date: checkTime.split(' ')[0],
            recordTime: checkTime,
            type: 'attendance',
            category: 'fingerprint',
            notes: 'بصمة جهاز (ADMS)',
            status: 'approved',
            branchId: employeeBranchId,
            createdAt: new Date().toISOString()
          });
          
          console.log(`✅ [ADMS-SUCCESS] Record saved for: ${employeeName}`);
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error('❌ [ADMS-ADMIN] CRITICAL ERROR:', error.message || error);
    return new Response(`ERROR: ${error.message}`, { status: 500 });
  }
}
