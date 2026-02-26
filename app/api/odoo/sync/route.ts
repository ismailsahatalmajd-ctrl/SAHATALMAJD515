
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { invoiceCode, products } = body;

        const ODOO_CONFIG = {
            url: "https://sahatalmajd.odoo.com",
            db: "sahatalmajd", // تم التغيير للاسم المختصر (Standard for Odoo Online)
            username: "warehouse@sahatalmajd.com",
            apiKey: "dd9812d879d7afcedb252cc3d46fd67e3c1b7148",
        };

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
            if (data.error) {
                console.error("Odoo RPC Error:", data.error);
                throw new Error(data.error.data?.message || data.error.message || "Odoo Error");
            }
            return data.result;
        };

        // 0. Auto-discover DB Name
        console.log("--- Attempting to find DB Name from server list ---");
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
                console.log("✅ Auto-discovered DB Name:", activeDb);
            }
        } catch (e) {
            console.warn("DB listing disabled, relying on config.");
        }

        // 1. Authenticate
        const uid = await odooCall("common", "authenticate", [activeDb, ODOO_CONFIG.username, ODOO_CONFIG.apiKey, {}]);
        if (!uid) {
            return NextResponse.json({ success: false, error: "فشل تسجيل الدخول إلى Odoo. يرجى التحقق من المفتاح البرمجي." }, { status: 401 });
        }

        // 2. Find internal transfer picking type and locations
        const pickingTypes = await odooCall("object", "execute_kw", [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
            "stock.picking.type", "search_read",
            [[["code", "=", "internal"]]],
            { limit: 1, fields: ["id", "default_location_src_id", "default_location_dest_id"] }
        ]);

        if (!pickingTypes.length) {
            return NextResponse.json({ success: false, error: "لم يتم العثور على نوع عملية 'تحويل داخلي' في Odoo." });
        }
        const pickingType = pickingTypes[0];

        // 3. Match Products
        const moveLines = [];
        for (const item of products) {
            const odooProducts = await odooCall("object", "execute_kw", [
                ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                "product.product", "search_read",
                [[["default_code", "=", item.productCode]]],
                { limit: 1, fields: ["id", "uom_id"] }
            ]);

            if (odooProducts.length > 0) {
                moveLines.push([0, 0, {
                    name: `تحويل من نظام المخزون - فاتورة ${invoiceCode}`,
                    product_id: odooProducts[0].id,
                    product_uom_qty: item.quantity,
                    product_uom: odooProducts[0].uom_id[0],
                    location_id: pickingType.default_location_src_id[0],
                    location_dest_id: pickingType.default_location_dest_id[0],
                }]);
            }
        }

        if (moveLines.length === 0) {
            const productList = products.map((p: any) => p.productCode).join(", ");
            return NextResponse.json({
                success: false,
                error: `تعذر العثور على المنتجات التالية في أودو: [${productList}]. يرجى التأكد من مطابقة كود الصنف (Internal Reference).`
            });
        }

        // 4. Create Picking (Transfer) as Draft
        try {
            const pickingId = await odooCall("object", "execute_kw", [
                ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                "stock.picking", "create",
                [{
                    picking_type_id: pickingType.id,
                    location_id: pickingType.default_location_src_id[0],
                    location_dest_id: pickingType.default_location_dest_id[0],
                    origin: invoiceCode,
                    priority: '0',
                    scheduled_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    move_ids_without_package: moveLines
                }]
            ]);

            const pickingData = await odooCall("object", "execute_kw", [
                ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
                "stock.picking", "read",
                [[pickingId]],
                { fields: ["name"] }
            ]);

            return NextResponse.json({ success: true, pickingId: pickingData[0]?.name || pickingId });
        } catch (e: any) {
            return NextResponse.json({ success: false, error: `خطأ أثناء إنشاء التحويل في أودو: ${e.message}` });
        }

    } catch (error: any) {
        console.error("Odoo Sync API Route Error:", error);
        let errorMsg = error.message;
        if (errorMsg.includes("fetch failed")) errorMsg = "تعذر الاتصال بسيرفر أودو (سيرفر أودو متوقف أو الرابط خطأ)";
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
}
