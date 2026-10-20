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

export async function POST(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const body = await request.json();
        const ids = body.ids || [];
        
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
        }

        const { uid, activeDb, odooCall, apiKey } = await getOdooUid();
        if (!uid) return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });

        // Fetch ALL Approval Product Lines for the given IDs in ONE call
        const approvalLines = await odooCall("object", "execute_kw", [
            activeDb, uid, apiKey,
            "approval.product.line", "search_read",
            [[["approval_request_id", "in", ids]]],
            { fields: ["id", "approval_request_id", "product_id", "description", "quantity", "product_uom_id"] }
        ]);

        return NextResponse.json({ success: true, lines: approvalLines });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
