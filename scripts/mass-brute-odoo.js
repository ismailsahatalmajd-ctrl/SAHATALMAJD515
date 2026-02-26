
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function odooCall(db, service, method, args) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per request

        const response = await fetch(`${ODOO_URL}/jsonrpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: { service, method, args },
                id: 1
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return await response.json();
    } catch (e) { return { error: { message: e.message } }; }
}

async function massBruteForce() {
    const keywords = ["sahat", "almajd", "co", "15790775"];
    const separators = ["-", "_", ""];
    const suffixes = ["", "prod", "production", "main", "live", "db"];

    const candidates = new Set();

    // 1. Basic combinations of keywords with various separators
    for (const sep of separators) {
        candidates.add(keywords.join(sep));
        candidates.add(keywords.slice(0, 2).join(sep));
        candidates.add(keywords.slice(0, 3).join(sep));
        candidates.add([keywords[0], keywords[1]].join(sep));
        candidates.add([keywords[0], keywords[1], keywords[2]].join(sep));
        // Reverse combinations sometimes used
        candidates.add(["almajd", "sahat"].join(sep));
    }

    // 2. Adding suffixes
    const currentList = Array.from(candidates);
    for (const base of currentList) {
        for (const suffix of suffixes) {
            if (suffix === "") continue;
            candidates.add(`${base}-${suffix}`);
            candidates.add(`${base}_${suffix}`);
            candidates.add(`${base}${suffix}`);
        }
    }

    // 3. User suggestions
    candidates.add("sahatalmajd.co");
    candidates.add("sahatalmajdco");
    candidates.add("sahatalmajd-co");
    candidates.add("sahat-almajd-co-15790775"); // Original finding

    console.log(`--- Starting Mass Brute Force (${candidates.size} variations) ---`);

    let count = 0;
    for (const dbName of candidates) {
        count++;
        if (count % 10 === 0) console.log(`Progress: ${count}/${candidates.size}...`);

        const res = await odooCall(dbName, "common", "authenticate", [dbName, ODOO_USER, ODOO_API_KEY, {}]);

        if (res.result) {
            console.log(`\n\n🎉 FOUND IT! SUCCESS!`);
            console.log(`Working Database Name: "${dbName}"`);
            console.log(`Authenticated UID: ${res.result}`);
            return;
        }

        // Break early if we get a non-database error (like 404 or auth blocked)
        if (res.error && res.error.code === 404) {
            console.log("Stopping: Server returned 404.");
            break;
        }
    }

    console.log("\n❌ All candidates failed. Please try to get the DB name from Odoo -> Settings -> Technical -> Database.");
}

massBruteForce();
