
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function testDbCorrectly(dbName) {
    const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${dbName}</string></value></param>
    <param><value><string>${ODOO_USER}</string></value></param>
    <param><value><string>${ODOO_API_KEY}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

    try {
        const response = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: xml
        });
        const result = await response.text();

        // Accurate Success Check: 
        // 1. Must NOT be an XML fault
        // 2. Must be an <int> that represents a real user ID (usually > 1 for admin/auth users)
        if (result.includes('<fault>') || result.includes('faultCode')) {
            return false;
        }

        if (result.includes('<int>') && !result.includes('<boolean>0</boolean>')) {
            return true;
        }
    } catch (e) { }
    return false;
}

async function startMassiveDiscovery() {
    const parts = ["sahat", "almajd", "co", "15790775"];
    const seps = ["-", "_", ""];
    const candidates = new Set();

    // Generate permutations
    function getPerms(arr, size) {
        if (size === 1) return arr.map(v => [v]);
        const result = [];
        arr.forEach((v, i) => {
            const rem = [...arr.slice(0, i), ...arr.slice(i + 1)];
            getPerms(rem, size - 1).forEach(p => result.push([v, ...p]));
        });
        return result;
    }

    [2, 3, 4].forEach(size => {
        getPerms(parts, size).forEach(p => {
            seps.forEach(s => candidates.add(p.join(s)));
        });
    });

    console.log(`--- MASSIVE DISCOVERY: Testing ${candidates.size} variations ---`);

    const list = Array.from(candidates);
    const batchSize = 15;

    for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);
        process.stdout.write(`Batch ${i}... `);

        const results = await Promise.all(batch.map(name => testDbCorrectly(name).then(ok => ({ name, ok }))));
        const found = results.find(r => r.ok);

        if (found) {
            console.log(`\n\n🎯 FOUND! REAL DATABASE NAME: "${found.name}"`);
            return;
        }
        process.stdout.write("Done\n");
    }
    console.log("\n❌ All automated variations failed. This could mean the technical name is completely different.");
}

startMassiveDiscovery();
