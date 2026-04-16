import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { domain, email, apiKey } = await req.json()

  if (!domain || !email || !apiKey) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
  }

  const cleanDomain = domain.trim().replace(/\/$/, "").replace(/\.atlassian\.net$/, "")
  const base = `https://${cleanDomain}.atlassian.net`
  const url = `${base}/rest/api/3/myself`
  const token = Buffer.from(`${email.trim()}:${apiKey.trim()}`).toString("base64")

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Basic ${token}`,
        Accept: "application/json",
      },
    })
  } catch (err) {
    const cause = err instanceof Error ? (err.cause ? String(err.cause) : err.message) : String(err)
    return NextResponse.json({ error: `Could not reach ${url}: ${cause}` }, { status: 502 })
  }

  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  if (!res.ok) {
    return NextResponse.json({ error: data.message ?? `HTTP ${res.status}` }, { status: res.status })
  }

  return NextResponse.json(data)
}
