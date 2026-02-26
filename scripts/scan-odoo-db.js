
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
                id: Math.floor(Math.random() * 1000)
            })
        });
        return await response.json();
    } catch (e) { return { error: e.message }; }
}

async function findWorkingDb() {
    // These are common patterns for Odoo Online DB names
    const candidates = [
        "sahatalmajd",
        "sahatalmajdco",
        "sahatalmajd.co",
        "sahat_almajd",
        "sahat_almajd_co",
        "sahatalmajd_co",
        "sahat-almajd-co-15790775",
        "sahat_almajd_co_15790775",
        "sahatalmajd-prod"
    ];

    console.log("--- Scanning for Working Odoo Database ---");
    for (const dbName of candidates) {
        console.log(`Trying: ${dbName}...`);
        const res = await odooCall(dbName, "common", "authenticate", [dbName, ODOO_USER, ODOO_API_KEY, {}]);
        if (res.result) {
            console.log(`✅ FOUND! Working DB Name is: "${dbName}" (UID: ${res.result})`);
            return;
        }
        // If it's a KeyError, it's the wrong DB. If it's something else, let's see.
        if (res.error) {
            const msg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
            if (!msg.includes("does not exist") && !msg.includes("KeyError")) {
                console.log(`❌ Technical Error for ${dbName}: ${msg}`);
            }
        }
    }
    console.log("❌ All common DB names failed. Please check Odoo -> Settings -> Technical -> Database.");
}

findWorkingDb();
