
const ODOO_URL = "https://sahatalmajd.odoo.com";

async function deepProbe() {
    try {
        console.log("--- Deep Probing Odoo Cookie for DB Name ---");
        const response = await fetch(ODOO_URL);
        const cookies = response.headers.get('set-cookie');
        console.log("Cookies received:", cookies);

        // Often 'session_id' or 'odoo_db_name' is set
        // Let's also check the login page for hidden DB fields more robustly
        const loginResp = await fetch(`${ODOO_URL}/web/login`);
        const loginHtml = await loginResp.text();

        const dbSelectors = [
            /name="db" value="([^"]+)"/,
            /data-db="([^"]+)"/,
            /\"db\":\s*\"([^"]+)\"/
        ];

        let foundDb = null;
        for (const regex of dbSelectors) {
            const match = loginHtml.match(regex);
            if (match && match[1]) {
                foundDb = match[1];
                break;
            }
        }

        if (foundDb) {
            console.log("✅ SUCCESS! Found DB Name:", foundDb);
        } else {
            console.log("❌ DB Name still hidden. Will try to authenticate with 'sahatalmajd' again but ensure proper JSON-RPC format.");
        }
    } catch (e) {
        console.error("Probe Error:", e.message);
    }
}

deepProbe();
