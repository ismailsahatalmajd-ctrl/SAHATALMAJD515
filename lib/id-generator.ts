
// مكتبة توليد الأرقام التسلسلية للفواتير والعمليات
import { getBranches, getIssues, getBranchRequests, getReturns } from "./storage"
import { db } from "./db"

// نوع العملية (للتوثيق)
// IS = Issue (صرف)
// OR = Order (طلب)
// RN = Return New (طلب مرتجع)
// RR = Return Receipt (استلام مرتجع)

/**
 * دالة مساعدة للحصول على كود الفرع.
 * إذا لم يصدر كود للفرع، تقوم بتوليد كود مؤقت للعرض (مثل B01)
 */
export async function getBranchCode(branchId: string): Promise<string> {
    const branches = await db.branches.toArray();
    const branch = branches.find(b => b.id === branchId);

    if (branch) {
        if (branch.code) return branch.code;

        // JIT Migration: Auto-generate code if missing
        const prefix = (branch.name[0] || "B").toUpperCase();
        // Determine number based on creation order for consistency
        const sortedBranches = [...branches].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const index = sortedBranches.findIndex(b => b.id === branchId);
        const num = index + 1; // 1-based index

        const newCode = `${prefix}${num.toString().padStart(2, '0')}`;

        // Save to DB so it persists
        await db.branches.update(branchId, { code: newCode });

        return newCode;
    }

    // Fallback only if branch clearly doesn't exist
    return "XXX";
}

/**
 * تولد رقم تسلسلي عام (Global Sequence) لنوع معين من العمليات
 * @param type نوع العملية (IS, OR, RN, RR)
 */
export async function generateGlobalSequence(type: "IS" | "OR" | "RN" | "RR"): Promise<string> {
    // في التطبيق الحقيقي، يجب أن يكون هذا العداد في قاعدة البيانات نفسها لضمان عدم التكرار.
    // هنا سنقوم بحساب العدد الحالي + 1 بناءً على البيانات الموجودة.
    // ملاحظة: هذا قد يسبب تكرار إذا قام جهازان بالعملية في نفس اللحظة (Race Condition).
    // الحل الأمثل هو استخدام Atomic Counter في السيرفر أو Dexie Transaction.

    let count = 0;

    if (type === "IS") {
        count = await db.issues.count();
    } else if (type === "OR") {
        // الطلبات
        // نحتاج لعد الطلبات التي تم إنشاؤها
        // حالياً الطلبات مخزنة في مصفوفة داخل التخزين المحلي، أو جدول requests لو قمنا بنقله
        // سنستخدم الدالة المتاحة لجلب الطلبات
        const reqs = getBranchRequests();
        count = reqs.length;
    } else if (type === "RN") {
        // طلبات المرتجعات (طلبات الفروع بنوع return)
        const reqs = getBranchRequests();
        count = reqs.filter(r => r.type === 'return').length;
    } else if (type === "RR") {
        // استلام المرتجعات (جدول returns)
        const rets = await db.returns.toArray();
        count = rets.length;
    }

    // تنسيق الرقم: 5 خانات (00001) حسب طلب المستخدم
    return (count + 1).toString().padStart(5, '0');
}

/**
 * تولد رقم تسلسلي خاص بالفرع (Branch Sequence)
 */
export async function generateBranchSequence(branchId: string, type: "IS" | "OR" | "RN" | "RR"): Promise<string> {
    let count = 0;

    if (type === "IS") {
        count = await db.issues.where("branchId").equals(branchId).count();
    } else if (type === "OR") {
        const reqs = getBranchRequests();
        count = reqs.filter(r => r.branchId === branchId).length;
    } else if (type === "RN") {
        // طلبات المرتجعات للفرع
        const reqs = getBranchRequests();
        count = reqs.filter(r => r.branchId === branchId && r.type === 'return').length;
    } else if (type === "RR") {
        // استلام المرتجعات للفرع
        const rets = await db.returns.toArray();
        count = rets.filter(r => r.branchId === branchId).length;
    }

    // تنسيق الرقم: 4 خانات (0001) دائمًا
    return (count + 1).toString().padStart(4, '0');
}

/**
 * دالة التنسيق النهائية للفاتورة
 * الصيغة: TY-BCODE-BSEQ-GSEQ
 * مثال: IS-F01-0005-0120
 */
export async function formatInvoiceNumber(
    type: "IS" | "OR" | "RN" | "RR",
    branchId: string
): Promise<string> {
    const branchCode = await getBranchCode(branchId);
    const branchSeq = await generateBranchSequence(branchId, type);
    const globalSeq = await generateGlobalSequence(type);

    return `${type}-${branchCode}-${branchSeq}-${globalSeq}`;
}

/**
 * دالة خاصة لـ "رقم الطلب" أو "المرتجع" (تسلسل الفرع فقط)
 * الصيغة: TY-BCODE-BSEQ
 * مثال: OR-F01-0005, RN-F01-0002
 */
export async function formatOrderNumber(
    branchId: string,
    type: "OR" | "RN" | "RR" = "OR"
): Promise<string> {
    const branchCode = await getBranchCode(branchId);
    // Use the type to get the correct sequence count for that specific type
    const branchSeq = await generateBranchSequence(branchId, type as any);
    return `${type}-${branchCode}-${branchSeq}`;
}

