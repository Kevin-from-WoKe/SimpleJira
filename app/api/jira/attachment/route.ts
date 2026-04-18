import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { credentials, attachmentId } = await req.json()
  const { domain, email, apiKey } = credentials

  const url = `https://${domain}.atlassian.net/rest/api/3/attachment/content/${attachmentId}`
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64")

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Basic ${token}` },
      redirect: "follow",
    })
  } catch (err) {
    const cause = err instanceof Error ? (err.cause ? String(err.cause) : err.message) : String(err)
    return NextResponse.json({ error: `Could not reach ${url}: ${cause}` }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text || `HTTP ${res.status}` }, { status: res.status })
  }

  const buf = await res.arrayBuffer()
  const contentType = res.headers.get("Content-Type") ?? "application/octet-stream"
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  })
}
