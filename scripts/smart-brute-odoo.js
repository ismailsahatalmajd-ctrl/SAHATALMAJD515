
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

async function smartBruteForce() {
    const base = "sahat-almajd-co-15790775";
    const parts = base.split('-');

    // Generate variations
    const candidates = new Set([
        base,
        base.replace(/-/g, '_'),
        "sahatalmajd",
        "sahatalmajd_co",
        "sahatalmajd-co",
        "sahat_almajd",
        "sahat-almajd",
        "sahat_almajd_co",
        parts.join(''),
        parts.slice(0, -1).join('-'),
        parts.slice(0, -1).join('_'),
        "sahatalmajd-production",
        "sahatalmajd_production",
        "sahatalmajd-main",
        "sahatalmajd_main"
    ]);

    console.log(`--- Starting Smart Brute Force (${candidates.size} variations) ---`);

    for (const dbName of candidates) {
        process.stdout.write(`Testing: ${dbName}... `);
        const res = await odooCall(dbName, "common", "authenticate", [dbName, ODOO_USER, ODOO_API_KEY, {}]);

        if (res.result) {
            console.log(`\n✅ FOUND! Database Name: "${dbName}"`);
            console.log(`UID: ${res.result}`);
            return;
        } else {
            console.log("X");
        }
    }

    console.log("❌ All variations failed. I'll try one more 'Dynamic Session' hack.");
}

smartBruteForce();
