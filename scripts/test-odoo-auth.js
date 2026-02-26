
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function odooCall(db, service, method, args) {
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
}

async function testAuth() {
    const dbs = ["sahatalmajd", "sahat-almajd-co-15790775"];

    for (const db of dbs) {
        console.log(`Testing DB: ${db}...`);
        try {
            const res = await odooCall(db, "common", "authenticate", [db, ODOO_USER, ODOO_API_KEY, {}]);
            if (res.result) {
                console.log(`✅ AUTH SUCCESS for DB: ${db}. UID: ${res.result}`);
                return;
            } else {
                console.log(`❌ AUTH FAILED for DB: ${db}:`, JSON.stringify(res.error || "Unknown error"));
            }
        } catch (e) {
            console.error(`💥 Error testing DB ${db}:`, e.message);
        }
    }
}

testAuth();
