export interface OdooServerConfig {
  url: string
  db: string
  username: string
  apiKey: string
}

const REVOKED_ODOO_API_KEYS = new Set([
  "99d33bab12df22c76d9264d1091661750ba108f5",
  "938961adf6c0d8799f293f33cb76019857f0ba94",
])

export function getOdooServerConfig(): OdooServerConfig {
  const envApiKey = process.env.ODOO_API_KEY?.trim()
  const validEnvKey = envApiKey && !REVOKED_ODOO_API_KEYS.has(envApiKey) ? envApiKey : undefined

  return {
    url: process.env.ODOO_URL?.trim().replace(/\/+$/, "") || "https://upward-github-sahat-almajd-co.odoo.com",
    db: process.env.ODOO_DB?.trim() || "upward-github-sahat-almajd-co-production-28792469",
    username: process.env.ODOO_USERNAME?.trim() || "warehouse@sahatalmajd.com",
    apiKey: validEnvKey || "7d8ea826ec073a074ddea0475063510510c52430",
  }
}

export function validateOdooServerConfig(config: OdooServerConfig) {
  if (!config.url || !config.db || !config.username || !config.apiKey) {
    throw new Error("Missing Odoo server environment variables");
  }
}