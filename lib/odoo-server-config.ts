export interface OdooServerConfig {
  url: string
  db: string
  username: string
  apiKey: string
}

export function getOdooServerConfig(): OdooServerConfig {
  return {
    url: process.env.ODOO_URL?.trim().replace(/\/+$/, "") || "",
    db: process.env.ODOO_DB?.trim() || "",
    username: process.env.ODOO_USERNAME?.trim() || "",
    apiKey: process.env.ODOO_API_KEY?.trim() || "",
  }
}

export function validateOdooServerConfig(config: OdooServerConfig) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length) {
    throw new Error(`Missing Odoo server environment variables: ${missing.join(", ")}`)
  }

  try {
    const parsedUrl = new URL(config.url)
    if (parsedUrl.protocol !== "https:") {
      throw new Error("ODOO_URL must use HTTPS")
    }
  } catch (err: any) {
    throw new Error(`Invalid ODOO_URL: ${err.message}`)
  }
}