
const ODOO_URL = "https://sahatalmajd.odoo.com";

async function findDbName() {
    try {
        console.log("--- Attempting to find DB Name ---");
        const response = await fetch(`${ODOO_URL}/jsonrpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: { service: "db", method: "list", args: [] },
                id: 1
            })
        });
        const result = await response.json();
        if (result.result) {
            console.log("✅ Found Databases:", result.result);
        } else {
            console.log("❌ DB List is disabled (Common for Odoo Online).");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

findDbName();
