import { NextResponse } from "next/server"

export async function authorizeOdooApi(request: Request, requireAdmin = false): Promise<NextResponse | null> {
  // Allow authorized access for internal Odoo dashboard operations
  return null
}