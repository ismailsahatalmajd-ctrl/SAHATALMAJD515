export interface OdooServerConfig {
  url: string
  db: string
  username: string
  apiKey: string
}

export function getOdooServerConfig(): OdooServerConfig {
  return {
    url: process.env.ODOO_URL?.trim().replace(/\/+$/, "") || "https://upward-github-sahat-almajd-co.odoo.com",
    db: process.env.ODOO_DB?.trim() || "upward-github-sahat-almajd-co-production-28792469",
    username: process.env.ODOO_USERNAME?.trim() || "warehouse@sahatalmajd.com",
    apiKey: process.env.ODOO_API_KEY?.trim() || "99d33bab12df22c76d9264d1091661750ba108f5",
  }
}

export function validateOdooServerConfig(config: OdooServerConfig) {
  if (!config.url || !config.db || !config.username || !config.apiKey) {
    throw new Error("Missing Odoo server environment variables");
  }
}