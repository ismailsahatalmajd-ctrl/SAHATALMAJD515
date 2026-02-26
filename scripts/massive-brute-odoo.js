
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function testDbName(dbName) {
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

        // Success means we got an integer UID that is NOTFault Code 1
        if (result.includes('<int>') && !result.includes('faultCode')) {
            return true;
        }
    } catch (e) { }
    return false;
}

async function massiveBruteForce() {
    const parts = ["sahat", "almajd", "co", "15790775"];
    const seps = ["-", "_", ""];

    const candidates = new Set();

    // 1. Permutations of parts (2, 3, and 4 parts)
    function generatePermutations(arr, size) {
        if (size === 1) return arr.map(v => [v]);
        const result = [];
        arr.forEach((v, i) => {
            const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
            const perms = generatePermutations(remaining, size - 1);
            perms.forEach(p => result.push([v, ...p]));
        });
        return result;
    }

    const sizes = [1, 2, 3, 4];
    for (const size of sizes) {
        const perms = generatePermutations(parts, size);
        for (const p of perms) {
            for (const s of seps) {
                candidates.add(p.join(s));
            }
        }
    }

    // 2. Add common Odoo.sh or Odoo Online suffixes
    const baseList = Array.from(candidates);
    const suffixes = ["prod", "production", "main", "live", "online"];
    for (const base of baseList) {
        for (const suf of suffixes) {
            candidates.add(`${base}-${suf}`);
            candidates.add(`${base}_${suf}`);
        }
    }

    console.log(`--- Starting Massive Brute Force (${candidates.size} variations) ---`);

    let count = 0;
    const batchSize = 10;
    const candidateArray = Array.from(candidates);

    for (let i = 0; i < candidateArray.length; i += batchSize) {
        const batch = candidateArray.slice(i, i + batchSize);
        process.stdout.write(`Testing batch ${i}-${i + batchSize}... `);

        const results = await Promise.all(batch.map(name => testDbName(name).then(res => ({ name, res }))));

        const found = results.find(r => r.res);
        if (found) {
            console.log(`\n\n🎯 FOUND IT! DATABASE NAME: "${found.name}"`);
            return;
        } else {
            process.stdout.write("Done\n");
        }
    }

    console.log("\n❌ All candidates failed. Please double check if the API Key is active for this user.");
}

massiveBruteForce();
