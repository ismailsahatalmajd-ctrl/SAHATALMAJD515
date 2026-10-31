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
        const movementProductId = Number(new URL(request.url).searchParams.get("movementProductId"));
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

        const warehouseUsers = await odooCall("object", "execute_kw", [
            activeDb, uid, ODOO_CONFIG.apiKey,
            "res.users", "search_read",
            [[["login", "=", ODOO_CONFIG.username]]],
            { fields: ["property_warehouse_id"], limit: 1 },
        ]);
        const assignedWarehouse = Array.isArray(warehouseUsers) && warehouseUsers[0]?.property_warehouse_id;
        const warehouseId = Array.isArray(assignedWarehouse) ? assignedWarehouse[0] : 1;
        const warehouseRecords = await odooCall("object", "execute_kw", [
            activeDb, uid, ODOO_CONFIG.apiKey,
            "stock.warehouse", "read",
            [[warehouseId]],
            { fields: ["name", "code", "lot_stock_id"] },
        ]);
        const stockLocation = warehouseRecords[0]?.lot_stock_id;
        const stockLocationId = Array.isArray(stockLocation) ? stockLocation[0] : 5;

        // Fetch Products (Active, Storable/Consumable)
        const products = await odooCall("object", "execute_kw", [
            activeDb, uid, ODOO_CONFIG.apiKey,
            "product.product", "search_read",
            [[["active", "=", true], ["type", "in", ["product", "consu"]]]],
            {
                fields: ["id", "display_name", "default_code", "qty_available", "standard_price", "list_price", "uom_id", "categ_id"],
                context: { location: stockLocationId },
            }
        ]);

        const [purchaseResult, moveResult, locationResult] = await Promise.allSettled([
            odooCall("object", "execute_kw", [
                activeDb, uid, ODOO_CONFIG.apiKey,
                "purchase.order.line", "search_read",
                [[["display_type", "=", false], ["state", "in", ["purchase", "done"]]]],
                { fields: ["product_id", "product_qty", "qty_received", "price_subtotal", "price_unit"], limit: 100000 },
            ]),
            odooCall("object", "execute_kw", [
                activeDb, uid, ODOO_CONFIG.apiKey,
                "stock.move", "search_read",
                [[["state", "=", "done"], ["product_id", "!=", false], "|", ["location_id", "child_of", stockLocationId], ["location_dest_id", "child_of", stockLocationId]]],
                { fields: ["id", "date", "reference", "origin", "product_id", "product_uom_qty", "quantity", "location_id", "location_dest_id"], limit: 100000 },
            ]),
            odooCall("object", "execute_kw", [
                activeDb, uid, ODOO_CONFIG.apiKey,
                "stock.location", "search_read",
                [[]],
                { fields: ["id", "usage"], limit: 100000 },
            ]),
        ]);

        const numberValue = (value: unknown) => {
            const result = Number(value);
            return Number.isFinite(result) ? result : 0;
        };
        const purchasesByProduct = new Map<number, { quantity: number; value: number }>();
        const purchaseLines = purchaseResult.status === "fulfilled" ? purchaseResult.value : [];
        for (const line of purchaseLines as Array<Record<string, unknown>>) {
            const product = line.product_id as [number, string] | false;
            if (!Array.isArray(product)) continue;
            const quantity = numberValue(line.qty_received ?? line.product_qty);
            const value = numberValue(line.price_subtotal) || quantity * numberValue(line.price_unit);
            const current = purchasesByProduct.get(product[0]) || { quantity: 0, value: 0 };
            purchasesByProduct.set(product[0], { quantity: current.quantity + quantity, value: current.value + value });
        }

        const locationUsage = new Map<number, string>();
        const locations = locationResult.status === "fulfilled" ? locationResult.value : [];
        for (const location of locations as Array<{ id: number; usage: string }>) locationUsage.set(location.id, location.usage);

        const issuesByProduct = new Map<number, number>();
        const moves = moveResult.status === "fulfilled" ? moveResult.value : [];
        for (const move of moves as Array<Record<string, unknown>>) {
            const product = move.product_id as [number, string] | false;
            const source = move.location_id as [number, string] | false;
            const destination = move.location_dest_id as [number, string] | false;
            if (!Array.isArray(product) || !Array.isArray(source) || !Array.isArray(destination)) continue;
            const sourceUsage = locationUsage.get(source[0]) || "unknown";
            const destinationUsage = locationUsage.get(destination[0]) || "unknown";
            if (sourceUsage !== "internal" || !["customer", "production"].includes(destinationUsage)) continue;
            const quantity = numberValue(move.quantity) || numberValue(move.product_uom_qty);
            issuesByProduct.set(product[0], (issuesByProduct.get(product[0]) || 0) + quantity);
        }

        const movements = Number.isInteger(movementProductId) && movementProductId > 0
            ? (moves as Array<Record<string, unknown>>)
                .filter((move) => Number(Array.isArray(move.product_id) ? move.product_id[0] : 0) === movementProductId)
                .map((move) => {
                    const source = Array.isArray(move.location_id) ? move.location_id : [0, ""];
                    const destination = Array.isArray(move.location_dest_id) ? move.location_dest_id : [0, ""];
                    const quantity = numberValue(move.quantity) || numberValue(move.product_uom_qty);
                    const sourceIsWarehouse = locationUsage.get(Number(source[0])) === "internal";
                    const destinationIsWarehouse = locationUsage.get(Number(destination[0])) === "internal";
                    const type = destinationIsWarehouse && !sourceIsWarehouse ? "استلام" : sourceIsWarehouse && !destinationIsWarehouse ? "صرف" : "تحويل";
                    return {
                        id: move.id,
                        date: move.date || "",
                        reference: move.reference || "",
                        origin: move.origin || "",
                        signedQuantity: type === "استلام" ? quantity : type === "صرف" ? -quantity : 0,
                        type,
                        source: source[1] || "",
                        destination: destination[1] || "",
                    };
                })
            : [];

        const inventory = (products as Array<Record<string, unknown>>).map((product) => {
            const id = numberValue(product.id);
            const stock = numberValue(product.qty_available);
            const cost = numberValue(product.standard_price);
            const purchases = purchasesByProduct.get(id) || { quantity: 0, value: 0 };
            const issues = issuesByProduct.get(id) || 0;
            return {
                id,
                code: product.default_code || "",
                name: product.display_name || "",
                unit: Array.isArray(product.uom_id) ? product.uom_id[1] : "",
                category: Array.isArray(product.categ_id) ? product.categ_id[1] : "",
                stock,
                price: numberValue(product.list_price),
                cost,
                purchases: purchases.quantity,
                purchasesValue: purchases.value,
                issues,
                issuesValue: issues * cost,
                inventoryValue: stock * cost,
            };
        });

        const aggregationWarnings = [purchaseResult, moveResult, locationResult]
            .map((result, index) => result.status === "rejected" ? {
                source: ["purchases", "moves", "locations"][index],
                error: result.reason instanceof Error ? result.reason.message : "Odoo query failed",
            } : null)
            .filter(Boolean);

        const warehouse = warehouseRecords[0] || { name: "المستودع الرئيسي", code: "" };
        const warehouseInventory = inventory.filter((product) => product.stock !== 0);
        return NextResponse.json({
            success: true,
            products,
            inventory: warehouseInventory,
            warehouse: {
                id: warehouseId,
                name: warehouse.name,
                code: warehouse.code,
                stockLocationId,
                stockLocation: Array.isArray(stockLocation) ? stockLocation[1] : "",
            },
            aggregationWarnings,
            movements,
        });

    } catch (error: any) {
        console.error("Odoo Products API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
