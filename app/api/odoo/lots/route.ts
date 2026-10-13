import { NextResponse } from "next/server";
import { getOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

export async function POST(request: Request) {
    const denied = await authorizeOdooApi(request);
    if (denied) return denied;
    try {
        const body = await request.json();
        const { productCodes } = body;

        if (!productCodes || !Array.isArray(productCodes) || productCodes.length === 0) {
            return NextResponse.json({ success: true, lotsByProduct: {} });
        }

        const ODOO_CONFIG = getOdooServerConfig();

        const odooCall = async (service: string, method: string, args: any[]) => {
            const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "call",
                    params: { service, method, args },
                    id: Math.floor(Math.random() * 1000)
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.data?.message || data.error.message || "Odoo Error");
            return data.result;
        };

        // 0. Auto-discover DB Name
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
        } catch (e) {}

        const uid = await odooCall("common", "authenticate", [activeDb, ODOO_CONFIG.username, ODOO_CONFIG.apiKey, {}]);
        if (!uid) return NextResponse.json({ success: false, error: "Auth failed" }, { status: 401 });

        const products = await odooCall("object", "execute_kw", [
            activeDb, uid, ODOO_CONFIG.apiKey,
            "product.product", "search_read",
            [[["default_code", "in", productCodes]]],
            { fields: ["id", "default_code"] }
        ]);

        if (products.length === 0) {
             return NextResponse.json({ success: true, lotsByProduct: {} });
        }

        const productIds = products.map((p: any) => p.id);
        const productIdToCode = Object.fromEntries(products.map((p: any) => [p.id, p.default_code]));

        const quants = await odooCall("object", "execute_kw", [
            activeDb, uid, ODOO_CONFIG.apiKey,
            "stock.quant", "search_read",
            [[["product_id", "in", productIds], ["quantity", ">", 0], ["location_id.usage", "=", "internal"]]],
            { fields: ["product_id", "lot_id", "quantity"] }
        ]);

        const lotIds = [...new Set(quants.filter((q: any) => q.lot_id).map((q: any) => q.lot_id[0]))];
        
        let lotsMap: Record<number, any> = {};
        if (lotIds.length > 0) {
            let lots = [];
            try {
                lots = await odooCall("object", "execute_kw", [
                    activeDb, uid, ODOO_CONFIG.apiKey,
                    "stock.lot", "search_read",
                    [[["id", "in", lotIds]]],
                    { fields: ["id", "name", "expiration_date", "use_date"] }
                ]);
            } catch (e) {
                try {
                   lots = await odooCall("object", "execute_kw", [
                       activeDb, uid, ODOO_CONFIG.apiKey,
                       "stock.production.lot", "search_read",
                       [[["id", "in", lotIds]]],
                       { fields: ["id", "name", "expiration_date", "use_date"] }
                   ]);
                } catch(e2) {
                   console.error("Could not fetch lots", e2);
                }
            }
            lotsMap = Object.fromEntries(lots.map((l: any) => [l.id, l]));
        }

        const lotsByProduct: Record<string, { lotName: string, date: string, quantity: number }[]> = {};

        quants.forEach((q: any) => {
            if (!q.lot_id) return;
            const pCode = productIdToCode[q.product_id[0]];
            const lot = lotsMap[q.lot_id[0]];
            if (!lot) return;

            if (!lotsByProduct[pCode]) lotsByProduct[pCode] = [];
            
            const date = lot.expiration_date || lot.use_date || '';
            // Only format date if it exists
            const formattedDate = date ? date.split(' ')[0] : '';

            lotsByProduct[pCode].push({
                lotName: lot.name,
                date: formattedDate,
                quantity: q.quantity
            });
        });

        // Sort lots by date (FEFO)
        for (const pCode in lotsByProduct) {
            // Group by lotName to avoid duplicates if quant is split across multiple internal locations
            const groupedLots: Record<string, any> = {};
            lotsByProduct[pCode].forEach(l => {
                if (!groupedLots[l.lotName]) {
                    groupedLots[l.lotName] = { ...l };
                } else {
                    groupedLots[l.lotName].quantity += l.quantity;
                }
            });
            
            let uniqueLots = Object.values(groupedLots);

            uniqueLots.sort((a: any, b: any) => {
                if (!a.date && !b.date) return 0;
                if (!a.date) return 1;
                if (!b.date) return -1;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });
            lotsByProduct[pCode] = uniqueLots;
        }

        return NextResponse.json({ success: true, lotsByProduct });
    } catch (error: any) {
        console.error("Odoo Lots API Route Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
