
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_DB = "sahat-almajd-co-15790775";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function odooCall(service, method, args) {
    try {
        const response = await fetch(`${ODOO_URL}/jsonrpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: { service, method, args },
                id: Math.floor(Math.random() * 1000)
            })
        });
        const result = await response.json();
        if (result.error) throw new Error(JSON.stringify(result.error));
        return result.result;
    } catch (e) {
        console.error(`Odoo Call [${method}] Error:`, e.message);
        throw e;
    }
}

async function inspectOdoo() {
    try {
        console.log("--- Odoo Inspection ---");
        const uid = await odooCall("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
        if (!uid) {
            console.error("Authentication failed. Please check ODOO_USER (should be your login email).");
            return;
        }
        console.log("✅ Authenticated UID:", uid);

        // 1. Get Picking Types (to find Internal Transfer)
        const pickingTypes = await odooCall("object", "execute_kw", [
            ODOO_DB, uid, ODOO_API_KEY,
            "stock.picking.type", "search_read",
            [[["code", "=", "internal"]]],
            { fields: ["display_name", "sequence_code", "warehouse_id", "default_location_src_id", "default_location_dest_id"] }
        ]);
        console.log("\n📦 Internal Picking Types:", JSON.stringify(pickingTypes, null, 2));

        // 2. Get Locations
        const locations = await odooCall("object", "execute_kw", [
            ODOO_DB, uid, ODOO_API_KEY,
            "stock.location", "search_read",
            [[["usage", "=", "internal"]]],
            { limit: 10, fields: ["display_name", "usage"] }
        ]);
        console.log("\n📍 Internal Locations (first 10):", JSON.stringify(locations, null, 2));

    } catch (error) {
        console.error("Inspection Failed:", error);
    }
}

inspectOdoo();
