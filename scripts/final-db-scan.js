
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function odooCall(db, service, method, args) {
    try {
        const response = await fetch(`${ODOO_URL}/jsonrpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: { service, method, args },
                id: 1
            })
        });
        return await response.json();
    } catch (e) { return { error: { message: e.message } }; }
}

async function finalScan() {
    // Variations of the name you found
    const candidates = [
        "sahatalmajd",
        "sahat_almajd_co_15790775",
        "sahat-almajd-co-15790775",
        "sahat_almajd",
        "sahatalmajd_co",
        "sahatalmajd-main",
        "production"
    ];

    console.log("--- Final Scanning with Exact Name Variations ---");
    for (const dbName of candidates) {
        console.log(`Checking: ${dbName}...`);
        const res = await odooCall(dbName, "common", "authenticate", [dbName, ODOO_USER, ODOO_API_KEY, {}]);

        if (res.result) {
            console.log(`✅ SUCCESS! Working DB Name is: "${dbName}"`);
            console.log(`UID: ${res.result}`);
            return;
        }

        if (res.error) {
            const errorMsg = res.error.data?.message || res.error.message || JSON.stringify(res.error);
            if (!errorMsg.includes("does not exist") && !errorMsg.includes("KeyError")) {
                console.log(`⚠️ Potential Auth Issue (not DB name issue) for ${dbName}: ${errorMsg}`);
            }
        }
    }
    console.log("❌ All variations failed. I will try to use the Odoo Session method if possible.");
}

finalScan();
