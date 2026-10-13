import { NextResponse } from "next/server";
import { getOdooServerConfig, validateOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

export const dynamic = 'force-dynamic';

function getOdooConfig() {
    const config = getOdooServerConfig();
    validateOdooServerConfig(config);
    return config;
}

// Helper to authenticate
async function getOdooUid() {
    const ODOO_CONFIG = getOdooConfig();
    const odooCall = async (service: string, method: string, args: any[], kwargs?: any) => {
        const callArgs = (kwargs && Object.keys(kwargs).length > 0) ? [...args, kwargs] : args;
        const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args: callArgs }, id: Math.floor(Math.random() * 1000) }),
            cache: 'no-store'
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.data?.message || data.error.message || "Odoo Error");
        return data.result;
    };
    const uid = await odooCall("common", "authenticate", [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.apiKey, {}]);
    return { uid, activeDb: ODOO_CONFIG.db, odooCall, apiKey: ODOO_CONFIG.apiKey };
}

export async function GET(request: Request, context: any) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const params = await context.params;
        const id = parseInt(params?.id || new URL(request.url).pathname.split('/').pop() || "");
        if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });

        // Fetch Approval Request to get stock_ids
        const requests = await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.request", "search_read",
            [[["id", "=", id]]],
            { fields: ["stock_ids"] }
        ]);
        const stock_ids = requests?.[0]?.stock_ids || [];

        // Fetch Approval Product Lines
        const approvalLines = await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.product.line", "search_read",
            [[["approval_request_id", "=", id]]],
            { 
                fields: ["id", "product_id", "description", "quantity", "product_uom_id"]
            }
        ]);

        let lines = approvalLines.map((l: any) => ({
            ...l,
            reserved_quantity: 0,
            missing_quantity: 0,
            has_moves: false
        }));

        if (stock_ids.length > 0) {
            const moves = await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "stock.move", "search_read",
                [[["picking_id", "in", stock_ids]]],
                { fields: ["product_id", "product_uom_qty", "forecast_availability", "state"] }
            ]);

            // Group moves by product_id
            const movesByProduct: Record<number, { demand: number, available: number }> = {};
            for (const move of moves) {
                const pId = move.product_id[0];
                if (!movesByProduct[pId]) movesByProduct[pId] = { demand: 0, available: 0 };
                movesByProduct[pId].demand += move.product_uom_qty || 0;
                movesByProduct[pId].available += move.forecast_availability || 0; // forecast_availability is the reserved/ready qty
            }

            // Map to approval lines
            lines = lines.map((l: any) => {
                const pId = l.product_id ? l.product_id[0] : null;
                if (pId && movesByProduct[pId]) {
                    const m = movesByProduct[pId];
                    return {
                        ...l,
                        reserved_quantity: m.available,
                        missing_quantity: Math.max(0, l.quantity - m.available),
                        has_moves: true
                    };
                }
                return l;
            });
        }

        return NextResponse.json({ success: true, lines });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request, context: any) {
    const denied = await authorizeOdooApi(request, true);
    if (denied) return denied;
    try {
        const params = await context.params;
        const id = parseInt(params?.id || new URL(request.url).pathname.split('/').pop() || "");
        if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

        const body = await request.json();
        const { categoryId, replenishmentTypeId, lines } = body;
        
        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed" }, { status: 401 });

        // 1. Update the approval request
        try {
            await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "approval.request", "write",
                [[id], {
                    category_id: parseInt(categoryId),
                    replenishment_operation_type_id: parseInt(replenishmentTypeId)
                }]
            ]);
        } catch (headerError: any) {
            console.warn("Could not update approval.request header (might be due to read access on approval.category):", headerError.message);
        }

        // 2. Unlink existing lines
        const existingLines = await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.product.line", "search",
            [[["approval_request_id", "=", id]]]
        ]);
        if (existingLines && existingLines.length > 0) {
            await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "approval.product.line", "unlink",
                [existingLines]
            ]);
        }

        // 3. Create new lines
        for (const line of lines) {
            await odooCall("object", "execute_kw", [
                activeDb, uid, apiKey,
                "approval.product.line", "create",
                [[{
                    approval_request_id: id,
                    product_id: parseInt(line.productId),
                    quantity: parseFloat(line.quantity),
                }]]
            ]);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: any) {
    const denied = await authorizeOdooApi(request, true);
    if (denied) return denied;
    try {
        const params = await context.params;
        const id = parseInt(params?.id || new URL(request.url).pathname.split('/').pop() || "");
        if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });
        
        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed" }, { status: 401 });

        await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.request", "unlink",
            [[id]]
        ]);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: any) {
    const denied = await authorizeOdooApi(request, true);
    if (denied) return denied;
    try {
        const params = await context.params;
        const id = parseInt(params?.id || new URL(request.url).pathname.split('/').pop() || "");
        if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

        const body = await request.json();
        const { action } = body; // 'confirm' or 'reject'
        
        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed" }, { status: 401 });

        const methodName = action === 'confirm' ? 'action_confirm' : 'action_cancel';
        await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.request", methodName,
            [[id]]
        ]);
        
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
