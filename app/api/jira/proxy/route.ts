import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { path, credentials, params } = await req.json()
  const { domain, email, apiKey } = credentials

  const base = `https://${domain}.atlassian.net`
  const queryString = params ? "?" + new URLSearchParams(params).toString() : ""
  const url = `${base}${path}${queryString}`
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64")

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Basic ${token}`, Accept: "application/json" },
    })
  } catch (err) {
    const cause = err instanceof Error ? (err.cause ? String(err.cause) : err.message) : String(err)
    return NextResponse.json({ error: `Could not reach ${url}: ${cause}` }, { status: 502 })
  }

  const text = await res.text()
  let data: unknown = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  return NextResponse.json(data, { status: res.status })
}
