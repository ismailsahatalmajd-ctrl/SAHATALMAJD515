
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_DB = "sahat-almajd-co-15790775";
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function odooCall(service, method, args) {
    const response = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: {
                service,
                method,
                args
            },
            id: Math.floor(Math.random() * 1000)
        })
    });
    const result = await response.json();
    if (result.error) {
        throw new Error(JSON.stringify(result.error));
    }
    return result.result;
}

async function testConnection() {
    try {
        console.log("Attempting to authenticate...");
        const uid = await odooCall("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
        if (!uid) {
            console.error("Authentication failed: Invalid credentials");
            return;
        }
        console.log("Authenticated! UID:", uid);

        const version = await odooCall("common", "version", []);
        console.log("Odoo Version:", version);

        // Try to read a product
        const products = await odooCall("object", "execute_kw", [
            ODOO_DB, uid, ODOO_API_KEY,
            "product.product", "search_read",
            [[["default_code", "!=", false]]],
            { limit: 5, fields: ["name", "default_code", "lst_price"] }
        ]);
        console.log("Sample Products from Odoo:", products);

    } catch (error) {
        console.error("Error:", error.message);
    }
}

testConnection();
