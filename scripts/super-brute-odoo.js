
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function testXmlRpc(dbName) {
    const xml = `
        <methodCall>
            <methodName>authenticate</methodName>
            <params>
                <param><value><string>${dbName}</string></value></param>
                <param><value><string>${ODOO_USER}</string></value></param>
                <param><value><string>${ODOO_API_KEY}</string></value></param>
                <param><value><struct></struct></value></param>
            </params>
        </methodCall>
    `;

    try {
        const response = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: xml
        });
        const result = await response.text();

        // If it returns an integer UID, it worked!
        if (result.includes('<int>') || (!result.includes('faultCode') && result.includes('<value>'))) {
            // Check if it's not a boolean false
            if (result.includes('<boolean>0</boolean>')) return false;
            return true;
        }
    } catch (e) { }
    return false;
}

async function superBruteForce() {
    const parts = ["sahat", "almajd", "co", "15790775", "warehouse"];
    const separators = ["", "-", "_"];
    const suffixes = ["", "prod", "production", "main", "online", "live"];

    const candidates = new Set();

    // Generate all permutations
    for (const sep of separators) {
        candidates.add("sahatalmajd");
        candidates.add("sahat-almajd");
        candidates.add("sahat_almajd");
        candidates.add("sahat-almajd-co");
        candidates.add("sahat_almajd_co");
        candidates.add("sahatalmajdco");
        candidates.add("sahat-almajd-co-15790775");
        candidates.add("sahat_almajd_co_15790775");
        candidates.add("15790775");
        candidates.add("sahatalmajd-warehouse");
    }

    // Add common Odoo Online patterns
    const baseNames = ["sahatalmajd", "sahat-almajd", "sahat_almajd", "sahat-almajd-co", "sahat_almajd_co"];
    for (const base of baseNames) {
        for (const suffix of suffixes) {
            if (suffix) {
                candidates.add(`${base}-${suffix}`);
                candidates.add(`${base}_${suffix}`);
                candidates.add(`${base}${suffix}`);
            }
        }
    }

    console.log(`--- Starting SUPER Brute Force (${candidates.size} variations) via XML-RPC ---`);

    let count = 0;
    for (const dbName of candidates) {
        count++;
        if (count % 20 === 0) console.log(`Searching... ${count}/${candidates.size}`);

        const success = await testXmlRpc(dbName);
        if (success) {
            console.log(`\n\n🎯 SUCCESS! THE DATABASE NAME IS: "${dbName}"`);
            return;
        }
    }

    console.log("\n❌ All candidates failed. This suggests either the API Key is invalid or Odoo Online is blocking RPC outside of specific IPs.");
}

superBruteForce();
