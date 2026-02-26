
const ODOO_URL = "https://sahatalmajd.odoo.com";

async function probeOdoo() {
    try {
        console.log("--- Probing Odoo for DB Name ---");
        const response = await fetch(`${ODOO_URL}/web/database/selector`);
        const text = await response.text();

        // Try to find database names in the HTML
        const dbMatches = text.match(/data-db="([^"]+)"/g);
        if (dbMatches) {
            const names = dbMatches.map(m => m.match(/"([^"]+)"/)[1]);
            console.log("✅ Found DB Names in Selector:", names);
        } else {
            console.log("❓ DB Selector hidden. Trying common patterns...");
            // Often in Odoo Online, if multiple DBs are hidden, it's just the subdomain
            // BUT sometimes it has a suffix. 
        }

        // Another trick: check session_info
        const sessionResp = await fetch(`${ODOO_URL}/web/session/modules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: 1 })
        });
        const sessionData = await sessionResp.json();
        console.log("Session Info:", JSON.stringify(sessionData, null, 2));

    } catch (e) {
        console.error("Probe Error:", e.message);
    }
}

probeOdoo();
