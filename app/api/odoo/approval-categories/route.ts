import { NextResponse } from "next/server";
import { getOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

const ODOO_CONFIG = getOdooServerConfig();

export async function GET(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
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

        // Workaround: The warehouse user does not have read access to 'approval.category'.
        // So we fetch the latest 500 approval requests and extract unique categories from them.
        const recentRequests = await odooCall("object", "execute_kw", [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
            "approval.request", "search_read",
            [[]]
        ], {
            fields: ["category_id"],
            limit: 500,
            order: "id desc"
        });

        const uniqueCategoriesMap = new Map<number, string>();
        recentRequests.forEach((req: any) => {
            if (req.category_id && Array.isArray(req.category_id)) {
                uniqueCategoriesMap.set(req.category_id[0], req.category_id[1]);
            }
        });

        const categories = Array.from(uniqueCategoriesMap.entries()).map(([id, name]) => ({
            id, name
        }));

        return NextResponse.json({ success: true, categories });
    } catch (error: any) {
        console.error("Categories API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
