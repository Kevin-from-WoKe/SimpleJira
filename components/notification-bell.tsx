"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Bell } from "lucide-react"

type Credentials = { domain: string; email: string; apiKey: string }

type Mention = {
  commentId: string
  issueKey: string
  issueSummary: string
  commentSegments: TextSegment[]
  createdAt: string
  authorName: string
  authorAvatar?: string
}

type CacheEntry = { data: Mention[]; ts: number }
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function cacheKey(accountId: string, domain: string) {
  return `jira-mentions:${domain}:${accountId}`
}

function readCache(key: string): Mention[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL) return null
    return entry.data
  } catch { return null }
}

function writeCache(key: string, data: Mention[]) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

async function jiraFetch(
  credentials: Credentials,
  path: string,
  params?: Record<string, string>
) {
  const res = await fetch("/api/jira/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials, path, params }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

type TextSegment = { text: string; highlight: boolean }

function adfToSegments(node: unknown, accountId: string): TextSegment[] {
  if (!node || typeof node !== "object") return []
  const n = node as Record<string, unknown>
  if (n.type === "mention") {
    const attrs = n.attrs as Record<string, string> | undefined
    return [{ text: attrs?.text ?? "", highlight: attrs?.id === accountId }]
  }
  if (n.type === "text" && typeof n.text === "string") return [{ text: n.text as string, highlight: false }]
  if (Array.isArray(n.content)) return (n.content as unknown[]).flatMap(c => adfToSegments(c, accountId))
  return []
}

// Keep for adfHasMention compatibility
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  const n = node as Record<string, unknown>
  if (n.type === "mention") {
    const attrs = n.attrs as Record<string, string> | undefined
    return attrs?.text ?? ""
  }
  if (n.type === "text" && typeof n.text === "string") return n.text
  if (Array.isArray(n.content)) return (n.content as unknown[]).map(adfToText).join("")
  return ""
}

function adfHasMention(node: unknown, accountId: string): boolean {
  if (!node || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n.type === "mention") {
    const attrs = n.attrs as Record<string, string> | undefined
    if (attrs?.id === accountId) return true
  }
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).some(child => adfHasMention(child, accountId))
  }
  return false
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function NotificationSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border/50 last:border-b-0 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-muted flex-shrink-0" />
        <div className="h-3 bg-muted rounded w-32" />
        <div className="h-2.5 bg-muted rounded w-10 ml-auto" />
      </div>
      <div className="h-2.5 bg-muted rounded w-24 mb-2" />
      <div className="space-y-1.5">
        <div className="h-2.5 bg-muted rounded w-full" />
        <div className="h-2.5 bg-muted rounded w-3/4" />
      </div>
    </div>
  )
}

export function NotificationBell({
  credentials,
  accountId,
}: {
  credentials: Credentials
  accountId: string
}) {
  const [open, setOpen] = useState(false)
  const [mentions, setMentions] = useState<Mention[]>([])
  const [loading, setLoading] = useState(true)
  const [seen, setSeen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const key = cacheKey(accountId, credentials.domain)

  const fetchMentions = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    try {
      const data = await jiraFetch(credentials, "/rest/api/3/search/jql", {
        jql: "updated >= -30d ORDER BY updated DESC",
        fields: "summary,comment",
        maxResults: "40",
      })

      const found: Mention[] = []
      for (const issue of data.issues ?? []) {
        const comments = issue.fields?.comment?.comments ?? []
        for (const comment of comments) {
          if (!adfHasMention(comment.body, accountId)) continue
          const segments = adfToSegments(comment.body, accountId)
          // Trim leading whitespace from first segment
          if (segments[0]) segments[0] = { ...segments[0], text: segments[0].text.trimStart() }
          // Truncate total length to ~160 chars
          let total = 0
          const trimmed: TextSegment[] = []
          for (const seg of segments) {
            if (total >= 160) break
            const remaining = 160 - total
            trimmed.push({ text: seg.text.slice(0, remaining), highlight: seg.highlight })
            total += seg.text.length
          }
          found.push({
            commentId: comment.id,
            issueKey: issue.key,
            issueSummary: issue.fields.summary,
            commentSegments: trimmed,
            createdAt: comment.created,
            authorName: comment.author?.displayName ?? "Someone",
            authorAvatar: comment.author?.avatarUrls?.["24x24"],
          })
        }
      }
      found.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      writeCache(key, found)
      setMentions(found)
      // Reset unread badge if new mentions arrived while not seen
      if (!background) setSeen(false)
    } catch {
      // silent
    } finally {
      if (!background) setLoading(false)
    }
  }, [credentials, accountId, key])

  useEffect(() => {
    const cached = readCache(key)
    if (cached) {
      setMentions(cached)
      setLoading(false)
      // Refresh in background
      fetchMentions(true)
    } else {
      fetchMentions(false)
    }
  }, [fetchMentions, key])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  function toggleOpen() {
    setOpen(o => !o)
    if (!open) setSeen(true)
  }

  const unread = !seen && mentions.length > 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        className="relative h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unread && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-background" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[360px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && mentions.length === 0 && (
              <>
                <NotificationSkeleton />
                <NotificationSkeleton />
                <NotificationSkeleton />
              </>
            )}
            {!loading && mentions.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No recent mentions
              </div>
            )}
            {mentions.map(m => (
              <button
                key={`${m.issueKey}-${m.commentId}`}
                className="w-full text-left px-4 py-3 hover:bg-muted/60 border-b border-border/50 last:border-b-0 transition-colors cursor-pointer"
                onClick={() => {/* no redirect for now */}}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m.authorAvatar
                    ? <img src={m.authorAvatar} alt={m.authorName} className="w-5 h-5 rounded-full flex-shrink-0" />
                    : <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] flex-shrink-0">{m.authorName[0]}</div>
                  }
                  <span className="text-xs font-medium flex-1 truncate">{m.authorName} mentioned you</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(m.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">{m.issueKey}</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground truncate">{m.issueSummary}</span>
                </div>
                <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                  {m.commentSegments.length === 0 ? "—" : m.commentSegments.map((seg, i) =>
                    seg.highlight
                      ? <span key={i} className="text-primary">{seg.text}</span>
                      : <span key={i}>{seg.text}</span>
                  )}
                </p>
              </button>
            ))}
            {!loading && (() => {
              if (mentions.length === 0) return null
              const oldest = mentions[mentions.length - 1]
              const days = Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 86_400_000)
              const label = days <= 1 ? "today" : days < 7 ? `the past ${days} days` : days < 14 ? "the past week" : `the past ${Math.round(days / 7)} weeks`
              return (
                <p className="px-4 py-3 text-center text-[11px] text-muted-foreground/70">
                  That&apos;s all your mentions from {label}.
                </p>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
