
const ODOO_URL = "https://sahatalmajd.odoo.com";

async function finalDbProbe() {
    try {
        console.log("--- Attempting to extract DB name from Odoo Login Page ---");
        const response = await fetch(`${ODOO_URL}/web/login`);
        const html = await response.text();

        // Pattern 1: Regex for data-db attribute (very common)
        let match = html.match(/data-db="([^"]+)"/);
        // Pattern 2: Regex for JS session info
        if (!match) match = html.match(/"db":\s*"([^"]+)"/);

        if (match && match[1]) {
            console.log("✅ SUCCESS! Found Technical DB Name:", match[1]);
        } else {
            console.log("❓ DB Name is hidden from public view.");
            console.log("Attempting to probe via JSON-RPC common service...");

            // Try to get version - sometimes this reveals the DB or at least confirms connectivity
            const versionResp = await fetch(`${ODOO_URL}/jsonrpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "call",
                    params: { service: "common", method: "version", args: [] },
                    id: 1
                })
            });
            const version = await versionResp.json();
            console.log("Odoo Version Info:", JSON.stringify(version, null, 2));
        }
    } catch (e) {
        console.error("Probe Error:", e.message);
    }
}

finalDbProbe();
