import { NextResponse } from "next/server"
export const dynamic = 'force-static'
import path from "path"
import fs from "fs/promises"

export async function POST(request: Request) {
  try {
    const { filename, data } = await request.json()
    if (!filename || !data) {
      return NextResponse.json({ ok: false, error: "filename and data are required" }, { status: 400 })
    }
    const dir = path.join(process.cwd(), "نسخة احتياطية")
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {}
    const filePath = path.join(dir, filename)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), { encoding: "utf-8" })
    return NextResponse.json({ ok: true, path: filePath })
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Failed to save backup" }, { status: 500 })
  }
}