
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
    let maxSeq = 0;

    if (type === "IS") {
        const items = await db.issues.toArray();
        items.forEach(i => {
            if (i.invoiceCode && i.invoiceCode.startsWith("IS-")) {
                const parts = i.invoiceCode.split('-');
                if (parts.length >= 4) {
                    const seq = parseInt(parts[3], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            }
        });
    } else if (type === "OR" || type === "RN") {
        const items = getBranchRequests();
        items.forEach(i => {
            if (i.requestNumber && i.requestNumber.startsWith(`${type}-`)) {
                const parts = i.requestNumber.split('-');
                const pIdx = parts.length > 3 ? 3 : 2;
                if (parts.length > pIdx) {
                    const seq = parseInt(parts[pIdx], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            }
        });
    } else if (type === "RR") {
        const items = await db.returns.toArray();
        items.forEach(i => {
            if (i.returnCode && i.returnCode.startsWith("RR-")) {
                const parts = i.returnCode.split('-');
                if (parts.length >= 4) {
                    const seq = parseInt(parts[3], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            }
        });
    }

    return (maxSeq + 1).toString().padStart(5, '0');
}

/**
 * تولد رقم تسلسلي خاص بالفرع (Branch Sequence)
 */
export async function generateBranchSequence(branchId: string, type: "IS" | "OR" | "RN" | "RR"): Promise<string> {
    let maxSeq = 0;

    if (type === "IS") {
        const items = await db.issues.where("branchId").equals(branchId).toArray();
        items.forEach(i => {
            if (i.invoiceCode && i.invoiceCode.startsWith("IS-")) {
                const parts = i.invoiceCode.split('-');
                if (parts.length >= 3) {
                    const seq = parseInt(parts[2], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            }
        });
    } else if (type === "OR" || type === "RN") {
        const items = getBranchRequests().filter(r => r.branchId === branchId);
        items.forEach(i => {
            if (i.requestNumber && i.requestNumber.startsWith(`${type}-`)) {
                const parts = i.requestNumber.split('-');
                if (parts.length >= 3) {
                    const seq = parseInt(parts[2], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            }
        });
    } else if (type === "RR") {
        const items = await db.returns.toArray();
        items.filter(r => r.branchId === branchId).forEach(i => {
            if (i.returnCode && i.returnCode.startsWith("RR-")) {
                const parts = i.returnCode.split('-');
                if (parts.length >= 3) {
                    const seq = parseInt(parts[2], 10);
                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                }
            }
        });
    }

    return (maxSeq + 1).toString().padStart(4, '0');
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

