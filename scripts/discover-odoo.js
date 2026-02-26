
const ODOO_URL = "https://sahatalmajd.odoo.com";

async function discoverDbName() {
    try {
        console.log("--- Discovering Odoo DB Name ---");
        const response = await fetch(`${ODOO_URL}/web/login`);
        const html = await response.text();

        // Pattern 1: Look for db name in form inputs
        let match = html.match(/name="db" value="([^"]+)"/);
        // Pattern 2: Look for db name in session info or JS configs
        if (!match) match = html.match(/"db":\s*"([^"]+)"/);
        // Pattern 3: Look for metadata tags
        if (!match) match = html.match(/data-db="([^"]+)"/);

        if (match && match[1]) {
            console.log("✅ Discovered DB Name:", match[1]);
        } else {
            console.log("❓ DB Name not found in HTML. Trying to authenticate with 'sahatalmajd' via XML-RPC...");
        }
    } catch (e) {
        console.error("Discovery Error:", e.message);
    }
}

discoverDbName();
