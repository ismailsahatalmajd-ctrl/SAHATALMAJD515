
import xmlrpc.client

url = "https://sahatalmajd.odoo.com"
db = "sahatalmajd"
username = "warehouse@sahatalmajd.com"
api_key = "dd9812d879d7afcedb252cc3d46fd67e3c1b7148"

def test_connection(db_name):
    print(f"--- Testing Connection for DB: {db_name} ---")
    try:
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        uid = common.authenticate(db_name, username, api_key, {})
        if uid:
            print(f"✅ Success! UID: {uid}")
            return uid
        else:
            print(f"❌ Authentication failed for {db_name}")
    except Exception as e:
        print(f"❌ Error for {db_name}: {str(e)}")
    return None

# Try common patterns
test_connection("sahatalmajd")
test_connection("sahat-almajd-co-15790775")
test_connection("sahatalmajd-production")
test_connection("sahatalmajd-main")
