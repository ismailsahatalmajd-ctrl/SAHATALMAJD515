
const ODOO_URL = "https://sahatalmajd.odoo.com";
const ODOO_DB = "sahat-almajd-co-15790775"; // الاسم الذي وجدته في الـ Console
const ODOO_USER = "warehouse@sahatalmajd.com";
const ODOO_API_KEY = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148";

async function definitiveTest() {
    console.log(`--- Targeted Test for DB: ${ODOO_DB} ---`);

    const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
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
        console.log("Raw Response from Odoo:");
        console.log(result);

        if (result.includes('<int>')) {
            const uid = result.match(/<int>(\d+)<\/int>/)[1];
            console.log(`\n✅ SUCCESS! Authenticated with UID: ${uid}`);
        } else if (result.includes('faultString')) {
            const fault = result.match(/<string>(.*?)<\/string>/g);
            console.log(`\n❌ Odoo returned an error: ${fault ? fault[1] : 'Unknown'}`);
        } else if (result.includes('<boolean>0</boolean>')) {
            console.log("\n❌ Authentication failed: Invalid Email or API Key.");
        }
    } catch (e) {
        console.error("\n💥 Connection Error:", e.message);
    }
}

definitiveTest();
