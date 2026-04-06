import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { isDesktopMode } from "@/lib/runtime"

const SECRET_KEY = process.env.JWT_SECRET || "your-secret-key-change-this-in-prod"
const key = new TextEncoder().encode(SECRET_KEY)

export async function createSession(payload: any) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
  const session = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key)

  const cookieStore = await cookies()
  cookieStore.set("session", session, {
    expires,
    httpOnly: true,
    // In Electron desktop (standalone over http://localhost), setting `secure:true` prevents cookies.
    // Keep secure only in production web builds (not desktop mode).
    secure: process.env.NODE_ENV === "production" && !isDesktopMode(),
    sameSite: "lax",
    path: "/",
  })
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get("session")?.value
  if (!session) return null
  try {
    const { payload } = await jwtVerify(session, key, {
      algorithms: ["HS256"],
    })
    return payload
  } catch (error) {
    return null
  }
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.set("session", "", {
    expires: new Date(0),
    path: "/",
  })
}
