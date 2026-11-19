import { NextResponse } from "next/server";
import { getOdooServerConfig, validateOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

export const dynamic = 'force-dynamic';

function getOdooConfig() {
    const config = getOdooServerConfig();
    validateOdooServerConfig(config);
    return config;
}

async function getOdooUid() {
    const ODOO_CONFIG = getOdooConfig();
    const odooCall = async (service: string, method: string, args: any[], kwargs?: any) => {
        const callArgs = (kwargs && Object.keys(kwargs).length > 0) ? [...args, kwargs] : args;
        const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args: callArgs }, id: Math.floor(Math.random() * 1000) }),
            cache: "no-store"
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.data?.message || data.error.message || "Odoo Error");
        return data.result;
    };
    const uid = await odooCall("common", "authenticate", [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.apiKey, {}]);
    return { uid, activeDb: ODOO_CONFIG.db, odooCall, apiKey: ODOO_CONFIG.apiKey };
}

// GET: Fast fetch of Odoo products in English (en_US) for product replacement & addition
export async function GET(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });

        const products = await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "product.product", "search_read",
            [[["active", "=", true], ["type", "in", ["product", "consu"]]]],
            {
                fields: ["id", "name", "display_name", "default_code", "uom_id"],
                context: { lang: "en_US" }
            }
        ]);

        return NextResponse.json({ success: true, products: products || [] });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const body = await request.json();
        const action = body.action || "fetch";

        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });

        // Action 1: Create new product line(s) for one or multiple branches/invoices
        if (action === "create") {
            const writeDenied = await authorizeOdooApi(request, true);
            if (writeDenied) return writeDenied;

            const items: { requestId: number; productId: number; quantity: number }[] = body.items || [];
            if (!Array.isArray(items) || items.length === 0) {
                return NextResponse.json({ success: false, error: "No items provided to create" }, { status: 400 });
            }

            const requestIds = Array.from(new Set(items.map(i => Number(i.requestId)).filter(Boolean)));
            const requestsData = await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "approval.request", "search_read",
                [[["id", "in", requestIds]]],
                { fields: ["id", "request_status"] }
            ]);

            const editableRequestIds = new Set<number>();
            if (Array.isArray(requestsData)) {
                for (const r of requestsData) {
                    if (r.request_status === "new" || r.request_status === "pending") {
                        editableRequestIds.add(r.id);
                    }
                }
            }

            const createdLineIds: number[] = [];
            const errors: string[] = [];

            for (const item of items) {
                const reqId = Number(item.requestId);
                const prodId = Number(item.productId);
                const qty = Number(item.quantity);
                if (!reqId || !prodId || isNaN(qty) || qty <= 0) continue;

                if (!editableRequestIds.has(reqId)) {
                    errors.push(`الطلب #${reqId} غير قابل للتعديل (مقبول أو ملغي)`);
                    continue;
                }

                try {
                    const newId = await odooCall("object", "execute_kw", [
                        activeDb, uid, apiKey,
                        "approval.product.line", "create",
                        [[{
                            approval_request_id: reqId,
                            product_id: prodId,
                            quantity: qty
                        }]],
                        { context: { lang: "en_US" } }
                    ]);
                    if (newId) {
                        createdLineIds.push(Array.isArray(newId) ? newId[0] : Number(newId));
                    }
                } catch (err: any) {
                    errors.push(`فشل الإضافة للطلب #${reqId}: ${err.message || "Odoo Error"}`);
                }
            }

            let createdLines: any[] = [];
            if (createdLineIds.length > 0) {
                createdLines = await odooCall("object", "execute_kw", [
                    activeDb, uid, apiKey,
                    "approval.product.line", "search_read",
                    [[["id", "in", createdLineIds]]],
                    {
                        fields: ["id", "approval_request_id", "product_id", "description", "quantity", "product_uom_id"],
                        context: { lang: "en_US" }
                    }
                ]);
            }

            if (createdLineIds.length === 0 && errors.length > 0) {
                return NextResponse.json({ success: false, error: errors.join(" | ") }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                createdLines,
                errors: errors.length > 0 ? errors : undefined
            });
        }

        // Action 2: Delete product line(s) from one or multiple branches/invoices
        if (action === "delete") {
            const writeDenied = await authorizeOdooApi(request, true);
            if (writeDenied) return writeDenied;

            const lineIds: number[] = (body.lineIds || []).map(Number).filter(Boolean);
            if (lineIds.length === 0) {
                return NextResponse.json({ success: false, error: "No lineIds provided to delete" }, { status: 400 });
            }

            // Verify lines belong to editable requests
            const linesData = await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "approval.product.line", "search_read",
                [[["id", "in", lineIds]]],
                { fields: ["id", "approval_request_id"] }
            ]);

            const reqIds = Array.from(
                new Set(
                    (linesData || [])
                        .map((l: any) => Array.isArray(l.approval_request_id) ? l.approval_request_id[0] : Number(l.approval_request_id))
                        .filter(Boolean)
                )
            );

            if (reqIds.length > 0) {
                const requestsData = await odooCall("object", "execute_kw", [
                    activeDb, uid, apiKey,
                    "approval.request", "search_read",
                    [[["id", "in", reqIds]]],
                    { fields: ["id", "request_status"] }
                ]);
                const nonEditable = (requestsData || []).filter((r: any) => r.request_status !== "new" && r.request_status !== "pending");
                if (nonEditable.length > 0) {
                    return NextResponse.json({
                        success: false,
                        error: "لا يمكن حذف أصناف من طلب مقبول أو مرسل / Cannot delete lines from an approved transfer"
                    }, { status: 400 });
                }
            }

            await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "approval.product.line", "unlink",
                [lineIds]
            ]);

            return NextResponse.json({ success: true, deletedLineIds: lineIds });
        }

        // Default Action: Fetch ALL Approval Product Lines for the given IDs in English (en_US)
        const ids = body.ids || [];
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
        }

        const approvalLines = await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.product.line", "search_read",
            [[["approval_request_id", "in", ids]]],
            {
                fields: ["id", "approval_request_id", "product_id", "description", "quantity", "product_uom_id"],
                context: { lang: "en_US" }
            }
        ]);

        return NextResponse.json({ success: true, lines: approvalLines });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const denied = await authorizeOdooApi(request, true);
    if (denied) return denied;
    try {
        const body = await request.json();
        const updates: {
            lineId: number;
            quantity: number;
            requestId?: number;
            productId?: number;
            newProductId?: number;
            newDescription?: string;
            newUomId?: number;
        }[] = body.updates || [];

        if (!Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ success: false, error: "لا توجد تعديلات لإرسالها" }, { status: 400 });
        }

        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });

        let updatedCount = 0;
        const errors: string[] = [];

        // Group by requestId to check status and optionally sync stock.move if stock_ids exist
        const requestIds = Array.from(new Set(updates.map(u => u.requestId).filter(Boolean))) as number[];
        const requestStockIdsMap: Record<number, number[]> = {};
        const nonEditableRequests = new Set<number>();

        if (requestIds.length > 0) {
            try {
                const requestsData = await odooCall("object", "execute_kw", [
                    activeDb, uid, apiKey,
                    "approval.request", "search_read",
                    [[["id", "in", requestIds]]],
                    { fields: ["id", "request_status", "stock_ids"] }
                ]);
                if (Array.isArray(requestsData)) {
                    for (const r of requestsData) {
                        if (r.request_status !== "new" && r.request_status !== "pending") {
                            nonEditableRequests.add(r.id);
                        }
                        if (r.stock_ids && r.stock_ids.length > 0) {
                            requestStockIdsMap[r.id] = r.stock_ids;
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not fetch stock_ids for requests:", e);
            }
        }

        for (const item of updates) {
            const lineId = Number(item.lineId);
            const newQty = Number(item.quantity);
            const reqId = item.requestId ? Number(item.requestId) : undefined;
            if (!lineId || isNaN(newQty) || newQty <= 0) continue;

            if (reqId && nonEditableRequests.has(reqId)) {
                errors.push(`سطر #${lineId}: لا يمكن تعديل طلب مقبول أو مرسل`);
                continue;
            }

            try {
                const writeVals: Record<string, any> = { quantity: newQty };
                if (item.newProductId && Number(item.newProductId) > 0) {
                    writeVals.product_id = Number(item.newProductId);
                    if (item.newDescription) {
                        writeVals.description = item.newDescription;
                    }
                    if (item.newUomId && Number(item.newUomId) > 0) {
                        writeVals.product_uom_id = Number(item.newUomId);
                    }
                }

                await odooCall("object", "execute_kw", [
                    activeDb, uid, apiKey,
                    "approval.product.line", "write",
                    [[lineId], writeVals],
                    { context: { lang: "en_US" } }
                ]);
                updatedCount++;

                // Also update corresponding stock.move if picking is still editable (not done/cancel)
                const prodId = item.productId ? Number(item.productId) : undefined;
                const stockIds = reqId ? requestStockIdsMap[reqId] : undefined;

                if (stockIds && stockIds.length > 0 && prodId) {
                    try {
                        const moves = await odooCall("object", "execute_kw", [
                            activeDb, uid, apiKey,
                            "stock.move", "search_read",
                            [[
                                ["picking_id", "in", stockIds],
                                ["product_id", "=", prodId],
                                ["state", "not in", ["done", "cancel"]]
                            ]],
                            { fields: ["id"] }
                        ]);
                        if (Array.isArray(moves) && moves.length > 0) {
                            const moveIds = moves.map((m: any) => m.id);
                            const moveVals: Record<string, any> = { product_uom_qty: newQty };
                            if (item.newProductId && Number(item.newProductId) > 0) {
                                moveVals.product_id = Number(item.newProductId);
                            }
                            await odooCall("object", "execute_kw", [
                                activeDb, uid, apiKey,
                                "stock.move", "write",
                                [moveIds, moveVals]
                            ]);
                        }
                    } catch (moveErr) {
                        console.warn(`Could not update stock.move for line ${lineId}:`, moveErr);
                    }
                }
            } catch (err: any) {
                errors.push(`سطر #${lineId}: ${err.message || "فشل التحديث"}`);
            }
        }

        if (updatedCount === 0 && errors.length > 0) {
            return NextResponse.json({ success: false, error: errors.join(" | ") }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            updatedCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
