import { NextResponse } from "next/server";
import { getOdooServerConfig, validateOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const ODOO_CONFIG = getOdooServerConfig();
        validateOdooServerConfig(ODOO_CONFIG);
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
        const ODOO_CONFIG = getOdooServerConfig();
        validateOdooServerConfig(ODOO_CONFIG);
        const body = await request.json();

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

        // Mode A: Batch creation (e.g. Multiple Purchase Requests at once)
        if (Array.isArray(body.batchRequests) && body.batchRequests.length > 0) {
            const createdRequests: {
                groupKey?: string;
                id: number;
                name: string;
                date: string;
                create_date: string;
                request_status: string;
            }[] = [];

            for (const reqItem of body.batchRequests) {
                const catId = parseInt(reqItem.categoryId);
                const repId = reqItem.replenishmentTypeId ? parseInt(reqItem.replenishmentTypeId) : undefined;
                const reqLines = reqItem.lines || [];
                if (!catId || reqLines.length === 0) continue;

                const createVals: Record<string, any> = {
                    category_id: catId,
                    request_status: "new",
                };
                if (repId && !isNaN(repId)) {
                    createVals.replenishment_operation_type_id = repId;
                }

                const createRes = await odooCall("object", "execute_kw", [
                    ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                    "approval.request", "create",
                    [[createVals]]
                ]);
                const newReqId = Array.isArray(createRes) ? createRes[0] : Number(createRes);

                for (const line of reqLines) {
                    await odooCall("object", "execute_kw", [
                        ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                        "approval.product.line", "create",
                        [[{
                            approval_request_id: newReqId,
                            product_id: parseInt(line.productId),
                            quantity: parseFloat(line.quantity),
                        }]],
                        { context: { lang: "en_US" } }
                    ]);
                }

                if (reqItem.autoConfirm) {
                    try {
                        await odooCall("object", "execute_kw", [
                            ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                            "approval.request", "action_confirm",
                            [[newReqId]]
                        ]);
                    } catch (confirmErr) {
                        console.warn(`Could not auto-confirm request ${newReqId}:`, confirmErr);
                    }
                }

                // Read back the created approval.request to get its generated sequence name (e.g. PR00183) and date
                let reqName = `#${newReqId}`;
                let reqDate = new Date().toISOString();
                let reqCreateDate = new Date().toISOString();
                let reqStatus = reqItem.autoConfirm ? "pending" : "new";

                try {
                    const readBack = await odooCall("object", "execute_kw", [
                        ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                        "approval.request", "search_read",
                        [[["id", "=", newReqId]]],
                        { fields: ["id", "name", "date", "create_date", "request_status"] }
                    ]);
                    if (Array.isArray(readBack) && readBack[0]) {
                        const r = readBack[0];
                        if (r.name && r.name !== "/") reqName = r.name;
                        if (r.date) reqDate = r.date;
                        if (r.create_date) reqCreateDate = r.create_date;
                        if (r.request_status) reqStatus = r.request_status;
                    }
                } catch (e) {}

                createdRequests.push({
                    groupKey: reqItem.groupKey,
                    id: newReqId,
                    name: reqName,
                    date: reqDate,
                    create_date: reqCreateDate,
                    request_status: reqStatus,
                });
            }

            return NextResponse.json({
                success: true,
                createdRequests,
            });
        }

        // Mode B: Single transfer / request creation
        const { categoryId, replenishmentTypeId, lines, autoConfirm } = body;

        if (!categoryId || !lines || lines.length === 0) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
        }

        const createVals: Record<string, any> = {
            category_id: parseInt(categoryId),
            request_status: "new"
        };
        if (replenishmentTypeId && !isNaN(parseInt(replenishmentTypeId))) {
            createVals.replenishment_operation_type_id = parseInt(replenishmentTypeId);
        }

        // 1. Create approval.request (let Odoo sequence assign name like MRSHF... or PR...)
        const createRes = await odooCall("object", "execute_kw", [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
            "approval.request", "create",
            [[createVals]]
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
                }]],
                { context: { lang: "en_US" } }
            ]);
        }

        if (autoConfirm) {
            try {
                await odooCall("object", "execute_kw", [
                    ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                    "approval.request", "action_confirm",
                    [[newRequestId]]
                ]);
            } catch (confirmErr) {
                console.warn(`Could not auto-confirm request ${newRequestId}:`, confirmErr);
            }
        }

        let createdName = `#${newRequestId}`;
        let createdDate = new Date().toISOString();
        try {
            const readBack = await odooCall("object", "execute_kw", [
                ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                "approval.request", "search_read",
                [[["id", "=", newRequestId]]],
                { fields: ["id", "name", "date", "create_date"] }
            ]);
            if (Array.isArray(readBack) && readBack[0]) {
                if (readBack[0].name && readBack[0].name !== "/") createdName = readBack[0].name;
                createdDate = readBack[0].date || readBack[0].create_date || createdDate;
            }
        } catch (e) {}

        return NextResponse.json({
            success: true,
            id: newRequestId,
            name: createdName,
            date: createdDate,
        });

    } catch (error: any) {
        console.error("Odoo Transfers POST API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
