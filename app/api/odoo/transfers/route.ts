import { NextResponse } from "next/server";
import { getOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

const ODOO_CONFIG = getOdooServerConfig();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const url = new URL(request.url);
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam === "all" ? 0 : (limitParam ? parseInt(limitParam) : 100);

        const odooCall = async (service: string, method: string, args: any[]) => {
            const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "call",
                    params: { service, method, args },
                    id: Math.floor(Math.random() * 1000)
                }),
                cache: 'no-store'
            });
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.data?.message || data.error.message || "Odoo Error");
            }
            return data.result;
        };

        // Auto-discover DB Name
        let activeDb = ODOO_CONFIG.db;
        try {
            const listResp = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "call",
                    params: { service: "db", method: "list", args: [] },
                    id: 1
                })
            });
            const listData = await listResp.json();
            if (listData.result && listData.result.length > 0) {
                activeDb = listData.result[0];
            }
        } catch (e) {
            console.warn("DB listing disabled, relying on config.");
        }

        const uid = await odooCall("common", "authenticate", [
            activeDb, 
            ODOO_CONFIG.username, 
            ODOO_CONFIG.apiKey, 
            {}
        ]);

        if (!uid) {
            return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });
        }

        // Fetch approval.request
        const transfers = await odooCall("object", "execute_kw", [
            activeDb, uid, ODOO_CONFIG.apiKey,
            "approval.request", "search_read",
            [[]],
            { 
                fields: ["id", "name", "category_id", "replenishment_operation_type_id", "request_status", "date", "create_date", "write_date", "request_owner_id", "product_line_ids", "stock_ids"],
                order: "id desc",
                ...(limit > 0 ? { limit } : {})
            }
        ]);

        // Secondary fetch for stock.picking to get detailed statuses
        const allStockIds = Array.from(new Set(transfers.flatMap((t: any) => t.stock_ids || [])));
        let pickingsMap: Record<number, any> = {};

        if (allStockIds.length > 0) {
            const pickings = await odooCall("object", "execute_kw", [
                activeDb, uid, ODOO_CONFIG.apiKey,
                "stock.picking", "search_read",
                [[["id", "in", allStockIds]]],
                {
                    fields: ["id", "state", "has_tracking", "products_availability_state", "name"]
                }
            ]);
            
            pickings.forEach((p: any) => {
                pickingsMap[p.id] = p;
            });
        }

        // Attach pickings to transfers
        const transfersWithPickings = transfers.map((t: any) => ({
            ...t,
            pickings: (t.stock_ids || []).map((id: number) => pickingsMap[id]).filter(Boolean)
        }));

        return NextResponse.json({ success: true, transfers: transfersWithPickings });

    } catch (error: any) {
        console.error("Odoo Transfers API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const denied = await authorizeOdooApi(request, true);
    if (denied) return denied;
    try {
        const body = await request.json();
        const { categoryId, replenishmentTypeId, lines } = body;

        if (!categoryId || !replenishmentTypeId || !lines || lines.length === 0) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
        }

        const odooCall = async (service: string, method: string, args: any[], kwargs?: any) => {
            const callArgs = (kwargs && Object.keys(kwargs).length > 0) ? [...args, kwargs] : args;
            const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "call",
                    params: { service, method, args: callArgs },
                    id: Math.floor(Math.random() * 1000)
                }),
                cache: 'no-store'
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.data?.message || data.error.message || "Odoo Error");
            return data.result;
        };

        const uid = await odooCall("common", "authenticate", [
            ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.apiKey, {}
        ]);

        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });

        // 1. Create approval.request
        const createRes = await odooCall("object", "execute_kw", [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
            "approval.request", "create",
            [[{
                name: "طلب جديد",
                category_id: parseInt(categoryId),
                replenishment_operation_type_id: parseInt(replenishmentTypeId),
                request_status: "new"
            }]]
        ]);
        const newRequestId = Array.isArray(createRes) ? createRes[0] : createRes;

        // 2. Create approval.product.line records linked to the new request
        for (const line of lines) {
            await odooCall("object", "execute_kw", [
                ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                "approval.product.line", "create",
                [[{
                    approval_request_id: newRequestId,
                    product_id: parseInt(line.productId),
                    quantity: parseFloat(line.quantity),
                }]]
            ]);
        }

        return NextResponse.json({ success: true, id: newRequestId });

    } catch (error: any) {
        console.error("Odoo Transfers POST API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
