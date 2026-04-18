"use client"

import { useEffect, useState, useCallback, useRef, createContext, useContext, useMemo, Children } from "react"
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Check, Search, X, ExternalLink, Link, FileX2, ChevronLeft } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip } from "@/components/tooltip"
import { NotificationBell } from "@/components/notification-bell"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// ── Cache helpers ────────────────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data as T
  } catch { return null }
}

function cacheSet(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

type Session = {
  domain: string
  email: string
  apiKey: string
  user: {
    accountId: string
    displayName: string
    avatarUrls: Record<string, string>
  }
}

type IssueType = { id: string; name: string }
type StatusCategory = { colorName: string; key: string }
type Status = { id: string; name: string; statusCategory: StatusCategory }
type Assignee = { displayName: string; avatarUrls: Record<string, string> } | null
type Priority = { name: string }

type Project = { id: string; key: string; name: string }

type Reporter = { displayName: string; avatarUrls: Record<string, string> } | null

type Attachment = {
  id: string
  filename: string
  mimeType?: string
  content?: string
}

type Issue = {
  id: string
  key: string
  fields: {
    summary: string
    issuetype: IssueType
    status: Status
    assignee: Assignee
    priority: Priority
    parent?: { id: string; key: string; fields: { summary: string; issuetype: IssueType } }
    customfield_10014?: string | null
    description?: unknown
    reporter?: Reporter
    labels?: string[]
    customfield_10289?: unknown  // background
    customfield_10293?: unknown  // user story
    customfield_10290?: unknown  // where
    customfield_10295?: unknown  // acceptance criteria
    customfield_10024?: number | null  // story points
    created?: string
    updated?: string
    attachment?: Attachment[]
  }
}

type Sprint = {
  id: number
  name: string
  state: "active" | "future" | "closed"
  startDate?: string
  endDate?: string
}

type SprintWithIssues = Sprint & { issues: Issue[]; total: number }

async function jiraFetch(
  credentials: { domain: string; email: string; apiKey: string },
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

function IssueTypeIcon({ name, className = "w-4 h-4" }: { name: string; className?: string }) {
  const n = name.toLowerCase()
  const cls = `${className} flex-shrink-0`
  if (n === "bug") return (
    <svg viewBox="0 0 16 16" className={cls}>
      <circle cx="8" cy="8" r="7" fill="#E5483B" />
      <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
  if (n === "story") return (
    <svg viewBox="0 0 16 16" className={cls}>
      <rect width="14" height="14" x="1" y="1" rx="2" fill="#63BA3C" />
      <path d="M5 3.5v9l3-2 3 2V3.5H5z" fill="white" />
    </svg>
  )
  if (n === "epic") return (
    <svg viewBox="0 0 16 16" className={cls}>
      <rect width="14" height="14" x="1" y="1" rx="2" fill="#904EE2" />
      <path d="M9 2.5L5.5 9H8L7 13.5L10.5 7H8L9 2.5z" fill="white" />
    </svg>
  )
  if (n === "subtask" || n === "sub-task") return (
    <svg viewBox="0 0 16 16" className={cls}>
      <rect width="12" height="12" x="2" y="2" rx="2" fill="#4BADE8" />
      <path d="M4.5 8.5L6.5 10.5L11 5.5" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  return (
    <svg viewBox="0 0 16 16" className={cls}>
      <rect width="14" height="14" x="1" y="1" rx="2" fill="#4BADE8" />
      <path d="M4.5 8.5L6.5 10.5L11.5 5.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PriorityIcon({ name }: { name: string }) {
  const n = name?.toLowerCase() ?? ""
  if (n === "highest") return <span className="text-[10px] leading-none" style={{ color: "#E5483B" }}>⬆</span>
  if (n === "high") return <span className="text-[10px] leading-none" style={{ color: "#E5483B" }}>↑</span>
  if (n === "low") return <span className="text-[10px] leading-none" style={{ color: "#2D80FF" }}>↓</span>
  if (n === "lowest") return <span className="text-[10px] leading-none" style={{ color: "#2D80FF" }}>⬇</span>
  return <span className="w-3" />
}

const EPIC_COLORS = [
  { bg: "#EAE0FF", text: "#403294", border: "#C0B6F2" },
  { bg: "#E9F2FF", text: "#0747A6", border: "#B3D4FF" },
  { bg: "#DFFCF0", text: "#006644", border: "#ABF5D1" },
  { bg: "#FFF0B3", text: "#974F0C", border: "#FFE380" },
  { bg: "#FFEBE6", text: "#BF2600", border: "#FFBDAD" },
  { bg: "#E3FCEF", text: "#006644", border: "#79F2C0" },
  { bg: "#FFFAE6", text: "#7A5200", border: "#FFD700" },
]

function epicColor(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  return EPIC_COLORS[Math.abs(hash) % EPIC_COLORS.length]
}

function StatusBadge({ status }: { status: Status }) {
  const cat = status.statusCategory?.colorName ?? "blue-grey"
  // Matches Jira's category colours: To Do = grey, In Progress = blue, Done = green
  const map: Record<string, string> = {
    "blue-grey": "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300",
    yellow:      "bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300",
    green:       "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    blue:        "bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300",
    red:         "bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300",
  }
  return (
    <Tooltip text={status.name}>
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide max-w-full overflow-hidden truncate ${map[cat] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300"}`}>
        {status.name}
      </span>
    </Tooltip>
  )
}

function EpicBadge({ epicKey, epicName }: { epicKey: string; epicName: string }) {
  const c = epicColor(epicKey)
  return (
    <Tooltip text={epicName}>
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium max-w-full overflow-hidden truncate"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      >
        {epicName}
      </span>
    </Tooltip>
  )
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return ""
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return `From ${fmt(start)}`
  return `Until ${fmt(end!)}`
}

type ColWidths = { epic: number; status: number }
type ColResizeHandlers = {
  onEpicResizeMouseDown: (e: React.MouseEvent) => void
  onStatusResizeMouseDown: (e: React.MouseEvent) => void
  onEpicHandleEnter: () => void
  onEpicHandleLeave: () => void
  onStatusHandleEnter: () => void
  onStatusHandleLeave: () => void
}

function IssueRow({ issue, colWidths, resizeHandlers, onSelect, isSelected, hoveredCol, panelOpen }: {
  issue: Issue
  colWidths: ColWidths
  resizeHandlers: ColResizeHandlers
  onSelect: (issue: Issue) => void
  isSelected: boolean
  hoveredCol: "epic" | "status" | null
  panelOpen: boolean
}) {
  const { fields } = issue

  let epicKey: string | null = null
  let epicName: string | null = null
  if (fields.parent?.fields.issuetype.name.toLowerCase() === "epic") {
    epicKey = fields.parent.key
    epicName = fields.parent.fields.summary
  } else if (fields.customfield_10014) {
    epicKey = fields.customfield_10014
    epicName = fields.customfield_10014
  }

  const assigneeAvatar = fields.assignee
    ? fields.assignee.avatarUrls?.["24x24"] ?? Object.values(fields.assignee.avatarUrls ?? {})[0]
    : null

  return (
    <div
      data-ticket-row
      onClick={() => onSelect(issue)}
      className={`flex items-center gap-2 px-3 py-1 hover:bg-muted/40 border-t border-border/50 group min-w-0 cursor-pointer transition-colors ${isSelected ? "bg-primary/10 hover:bg-primary/15" : ""}`}
    >
      {/* Hidden when panel open */}
      <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] flex-shrink-0 ${panelOpen ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
        <Checkbox onClick={e => e.stopPropagation()} className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100" />
        <span className="w-3 flex-shrink-0 flex items-center justify-center">
          <PriorityIcon name={fields.priority?.name ?? ""} />
        </span>
        <IssueTypeIcon name={fields.issuetype.name} />
      </div>

      <span className="text-[11px] text-muted-foreground flex-shrink-0 w-16 font-mono">{issue.key}</span>
      <span className="text-sm flex-1 min-w-0 truncate">{fields.summary}</span>

      {/* Epic column — hidden when panel open */}
      <div
        onClick={e => e.stopPropagation()}
        className="relative flex-shrink-0 flex items-center overflow-hidden cursor-default transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: panelOpen ? 0 : colWidths.epic, opacity: panelOpen ? 0 : 1 }}
      >
        <div
          onMouseDown={resizeHandlers.onEpicResizeMouseDown}
          onMouseEnter={resizeHandlers.onEpicHandleEnter}
          onMouseLeave={resizeHandlers.onEpicHandleLeave}
          className="absolute left-0 top-0 h-full w-2 cursor-col-resize z-10 flex items-center justify-center"
        >
          <div className={`h-full w-px transition-colors duration-100 ${hoveredCol === "epic" ? "bg-border" : "bg-transparent"}`} />
        </div>
        <div className="pl-2 min-w-0 w-full overflow-hidden">
          {epicKey && epicName ? <EpicBadge epicKey={epicKey} epicName={epicName} /> : null}
        </div>
      </div>

      {/* Status column — hidden when panel open */}
      <div
        onClick={e => e.stopPropagation()}
        className="relative flex-shrink-0 flex items-center overflow-hidden cursor-default transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: panelOpen ? 0 : colWidths.status, opacity: panelOpen ? 0 : 1 }}
      >
        <div
          onMouseDown={resizeHandlers.onStatusResizeMouseDown}
          onMouseEnter={resizeHandlers.onStatusHandleEnter}
          onMouseLeave={resizeHandlers.onStatusHandleLeave}
          className="absolute left-0 top-0 h-full w-2 cursor-col-resize z-10 flex items-center justify-center"
        >
          <div className={`h-full w-px transition-colors duration-100 ${hoveredCol === "status" ? "bg-border" : "bg-transparent"}`} />
        </div>
        <div className="pl-2 min-w-0 w-full overflow-hidden">
          <StatusBadge status={fields.status} />
        </div>
      </div>

      {/* Assignee — always visible */}
      <div onClick={e => e.stopPropagation()} className="flex-shrink-0 w-6 flex items-center justify-center cursor-default">
        {fields.assignee && (
          <Tooltip text={fields.assignee.displayName}>
            {assigneeAvatar
              ? <img src={assigneeAvatar} alt={fields.assignee.displayName} className="w-5 h-5 rounded-full" />
              : <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px]">{fields.assignee.displayName[0]}</div>
            }
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function SpaceDropdown({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[]
  selected: Project | null
  onSelect: (p: Project) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-base font-semibold hover:text-muted-foreground transition-colors"
      >
        {selected?.name ?? "Select space"}
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-md border border-border bg-popover shadow-md py-1">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-muted text-left"
            >
              <Check className={`w-3.5 h-3.5 flex-shrink-0 ${selected?.id === p.id ? "opacity-100" : "opacity-0"}`} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeletons ────────────────────────────────────────────────────────────────
// Pre-computed widths so each row feels organic, not repetitive
const SKELETON_ROWS: { title: string; epic: string; status: string }[] = [
  { title: "w-3/4",  epic: "w-20", status: "w-14" },
  { title: "w-1/2",  epic: "w-16", status: "w-10" },
  { title: "w-5/6",  epic: "w-24", status: "w-12" },
  { title: "w-2/3",  epic: "w-14", status: "w-16" },
  { title: "w-4/5",  epic: "w-18", status: "w-10" },
  { title: "w-1/3",  epic: "w-20", status: "w-14" },
  { title: "w-3/5",  epic: "w-12", status: "w-12" },
  { title: "w-11/12",epic: "w-16", status: "w-16" },
]

function IssueRowSkeleton({ index }: { index: number }) {
  const s = SKELETON_ROWS[index % SKELETON_ROWS.length]
  return (
    <div className="flex items-center gap-2 px-3 py-1 border-t border-border/50 animate-pulse">
      <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
      <div className="h-3 w-3 rounded bg-muted flex-shrink-0" />
      <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
      <div className="h-2.5 w-16 rounded bg-muted flex-shrink-0" />
      <div className={`h-3 ${s.title} rounded bg-muted min-w-0`} />
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <div className={`h-4 ${s.epic} rounded bg-muted`} />
        <div className={`h-4 ${s.status} rounded bg-muted`} />
        <div className="h-5 w-5 rounded-full bg-muted" />
      </div>
    </div>
  )
}

function SprintGroupSkeleton() {
  const rowCounts = [5, 8, 3, 6]
  return (
    <>
      {rowCounts.map((count, gi) => (
        <div key={gi} className="border-t border-border first:border-t-0 animate-pulse">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
            <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
            <div className={`h-3.5 rounded bg-muted ${gi % 2 === 0 ? "w-40" : "w-52"}`} />
            <div className={`h-3 rounded bg-muted ${gi % 3 === 0 ? "w-24" : "w-32"}`} />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
          {Array.from({ length: count }).map((_, i) => <IssueRowSkeleton key={i} index={gi * 10 + i} />)}
        </div>
      ))}
    </>
  )
}

function SprintGroup({ sprint, defaultOpen = true, search = "", highlight = false, expandAll = null, colWidths, resizeHandlers, onSelectIssue, selectedIssueId, hoveredCol, panelOpen }: { sprint: SprintWithIssues; defaultOpen?: boolean; search?: string; highlight?: boolean; expandAll?: boolean | null; colWidths: ColWidths; resizeHandlers: ColResizeHandlers; onSelectIssue: (issue: Issue) => void; selectedIssueId: string | null; hoveredCol: "epic" | "status" | null; panelOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (expandAll !== null) setOpen(expandAll)
  }, [expandAll])
  const dateRange = formatDateRange(sprint.startDate, sprint.endDate)

  const filtered = search
    ? sprint.issues.filter(i => i.key.toLowerCase().includes(search.toLowerCase()))
    : sprint.issues
  const matchCount = search ? filtered.length : 0

  useEffect(() => {
    if (search && matchCount > 0) setOpen(true)
  }, [search, matchCount])

  return (
    <div className="border-t border-border first:border-t-0">
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer select-none"
        style={highlight ? { animation: "orange-blink 1.8s ease-out forwards" } : undefined}
        onClick={() => setOpen(o => !o)}
      >
        <Checkbox onClick={e => e.stopPropagation()} className="h-3.5 w-3.5" />
        <span className="text-muted-foreground flex items-center transition-transform duration-200">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="text-sm font-semibold">{sprint.name}</span>
        {dateRange && <span className="text-xs text-muted-foreground">{dateRange}</span>}
        <span className="text-xs text-muted-foreground">({sprint.total} work items)</span>
        {matchCount > 0 && (
          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
            {matchCount}
          </span>
        )}
      </div>
      <div
        className="grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {filtered.map(issue => <IssueRow key={issue.id} issue={issue} colWidths={colWidths} resizeHandlers={resizeHandlers} onSelect={onSelectIssue} isSelected={selectedIssueId === issue.id} hoveredCol={hoveredCol} panelOpen={panelOpen} />)}
        </div>
      </div>
    </div>
  )
}

// ── ADF → markdown ───────────────────────────────────────────────────────────
type AdfNode = { type: string; text?: string; attrs?: Record<string, unknown>; content?: AdfNode[]; marks?: { type: string }[] }

function adfInlineText(node: AdfNode): string {
  if (node.type === "text") {
    let t = node.text ?? ""
    const marks = node.marks ?? []
    if (marks.some(m => m.type === "strong")) t = `**${t}**`
    if (marks.some(m => m.type === "em")) t = `*${t}*`
    if (marks.some(m => m.type === "code")) t = `\`${t}\``
    if (marks.some(m => m.type === "strike")) t = `~~${t}~~`
    return t
  }
  if (node.type === "hardBreak") return "\n"
  if (node.type === "mention") {
    const id = (node.attrs?.id as string) ?? ""
    const text = (node.attrs?.text as string) ?? ""
    if (id && text) userMentionCache.set(id, text.replace(/^@/, ""))
    return `[@](jira-mention:${id} "mention")`
  }
  return (node.content ?? []).map(adfInlineText).join("")
}

function adfListItem(node: AdfNode, depth: number, prefix: string): string {
  const indent = "   ".repeat(depth)
  // split content into the first paragraph (item label) and any nested lists
  const children = node.content ?? []
  const labelNodes = children.filter(c => c.type !== "bulletList" && c.type !== "orderedList")
  const nestedLists = children.filter(c => c.type === "bulletList" || c.type === "orderedList")
  const label = labelNodes.map(n => (n.content ?? []).map(adfInlineText).join("")).join("").trim()
  const nested = nestedLists.map(n => adfToMarkdown(n, depth + 1)).join("")
  return `${indent}${prefix} ${label}\n${nested}`
}

function adfToMarkdown(node: AdfNode, depth = 0): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(n => adfToMarkdown(n, depth)).join("")
    case "paragraph":
      return (node.content ?? []).map(adfInlineText).join("") + "\n"
    case "text":
      return adfInlineText(node)
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1
      return `${"#".repeat(level)} ${(node.content ?? []).map(adfInlineText).join("")}\n\n`
    }
    case "bulletList":
      return (node.content ?? []).map(n => adfListItem(n, depth, "-")).join("") + (depth === 0 ? "\n" : "")
    case "orderedList":
      return (node.content ?? []).map((n, i) => adfListItem(n, depth, `${i + 1}.`)).join("") + (depth === 0 ? "\n" : "")
    case "listItem":
      return adfListItem(node, depth, "-")
    case "blockquote":
      return (node.content ?? []).map(n => `> ${adfToMarkdown(n, depth)}`).join("")
    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? ""
      const code = (node.content ?? []).map(n => n.text ?? "").join("")
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`
    }
    case "hardBreak":
      return "\n"
    case "rule":
      return "---\n"
    default:
      return (node.content ?? []).map(n => adfToMarkdown(n, depth)).join("")
  }
}

// ── Jira wiki markup → markdown ──────────────────────────────────────────────
function jiraWikiToMarkdown(src: string, attachments?: Attachment[]): string {
  const lines = src.split("\n")
  const out: string[] = []

  const applyInline = (s: string): string => {
    return s
      // Image: !filename.png|width=170,alt="..."!  →  ![alt](jira-att:<id>?w=170)
      .replace(/!([^!|\n]+?)(?:\|([^!\n]*))?!/g, (_, filename, params) => {
        const att = attachments?.find(a => a.filename === filename)
        const widthMatch = params?.match(/width=(\d+)/i)
        const altMatch = params?.match(/alt="([^"]*)"/i)
        const alt = altMatch?.[1] || filename
        const widthQs = widthMatch ? `?w=${widthMatch[1]}` : ""
        if (att) return `![${alt}](jira-att:${att.id}${widthQs})`
        return `![${alt}](missing-att:${encodeURIComponent(filename)})`
      })
      // User mention: [~accountid:XXX]  →  [@](jira-mention:XXX "mention")
      .replace(/\[~accountid:([a-zA-Z0-9:_-]+)\]/g, (_, id) => `[@](jira-mention:${id} "mention")`)
      // Smart link: [label|url|smart-link]  →  [label](url "smart-link")
      // If label is itself a URL, strip protocol so remark-gfm doesn't autolink it inside the brackets
      .replace(/\[([^\]\n|]+)\|([^\]\n|]+)\|smart-link\]/g, (_, label, url) => {
        const cleanLabel = /^https?:\/\//i.test(label) ? label.replace(/^https?:\/\//i, "") : label
        return `[${cleanLabel}](${url} "smart-link")`
      })
      // Plain Jira link: [label|url]  →  [label](url)
      // Strip protocol from URL labels to avoid remark-gfm autolinking inside the brackets
      .replace(/\[([^\]\n|]+)\|([^\]\n|]+)\]/g, (_, label, url) => {
        const cleanLabel = /^https?:\/\//i.test(label) ? label.replace(/^https?:\/\//i, "") : label
        return `[${cleanLabel}](${url})`
      })
      // Bare URL link: [https://…]  →  <https://…>
      .replace(/\[(https?:\/\/[^\]\n]+)\]/g, "<$1>")
      // Inline code, bold, italic, underline-as-bold
      .replace(/\{\{([^}\n]+)\}\}/g, "`$1`")
      .replace(/\*([^*\n]+)\*/g, "**$1**")
      .replace(/_([^_\n]+)_/g, "*$1*")
      .replace(/\+([^+\n]+)\+/g, "**$1**")
      // Strikethrough: -text- with word boundaries, avoids matching hyphens in text
      .replace(/(^|[\s(])-([^\s-][^\n-]*?[^\s-]|[^\s-])-(?=$|[\s).,;:!?])/g, "$1~~$2~~")
  }

  for (const raw of lines) {
    let prefix = ""
    let content = raw

    // Headings: h1. h2. … h6.
    const headingMatch = content.match(/^h([1-6])\.\s*(.*)/)
    if (headingMatch) {
      prefix = "#".repeat(Number(headingMatch[1])) + " "
      content = headingMatch[2]
    } else {
      // List: mixed # and * markers allowed. Depth = length, last char = type.
      const listMatch = content.match(/^([#*]+) (.*)/)
      if (listMatch) {
        const markers = listMatch[1]
        const depth = markers.length
        const isOrdered = markers[markers.length - 1] === "#"
        prefix = "    ".repeat(depth - 1) + (isOrdered ? "1. " : "- ")
        content = listMatch[2]
      }
    }

    // Horizontal rule
    if (!prefix && /^----+$/.test(content.trim())) { out.push("---"); continue }

    out.push(prefix + applyInline(content))
  }

  // Code blocks
  return out.join("\n")
    .replace(/\{code(?::([a-z]+))?\}([\s\S]*?)\{code\}/g, (_, lang, body) => `\`\`\`${lang ?? ""}\n${body.trim()}\n\`\`\``)
    .replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, "```\n$1\n```")
    .trim()
}

function parseRichText(value: unknown, attachments?: Attachment[]): string {
  if (!value) return ""
  if (typeof value === "string") return jiraWikiToMarkdown(value, attachments)
  if (typeof value === "object") {
    try {
      return adfToMarkdown(value as AdfNode).trim()
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip text={copied ? "Copied!" : "Copy link"}>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Link className="w-3 h-3" />
      </button>
    </Tooltip>
  )
}

function priorityDot(name: string) {
  const map: Record<string, string> = {
    Highest: "bg-red-500",
    High: "bg-orange-400",
    Medium: "bg-yellow-400",
    Low: "bg-blue-400",
    Lowest: "bg-slate-400",
  }
  return map[name] ?? "bg-muted-foreground"
}

function formatDate(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

// Session context — used by JiraImage to authenticate attachment downloads
const SessionContext = createContext<Session | null>(null)

// Lightbox context — registry of attachment images in current ticket + open/nav controls
type LightboxImage = { id: string; alt?: string }
type LightboxCtx = {
  images: LightboxImage[]
  openId: string | null
  openAt: (id: string) => void
  close: () => void
  next: () => void
  prev: () => void
}
const LightboxContext = createContext<LightboxCtx | null>(null)

// Track ordered-list nesting depth so we can set the correct `type` attr (1 → a → i → cycles)
const OlDepthContext = createContext(0)

const OL_STYLES = ["decimal", "lower-alpha", "lower-roman"] as const

function MarkdownOl({ children, style, ...rest }: React.HTMLAttributes<HTMLOListElement>) {
  const depth = useContext(OlDepthContext)
  const listStyleType = OL_STYLES[depth % OL_STYLES.length]
  return (
    <OlDepthContext.Provider value={depth + 1}>
      <ol style={{ listStyleType, ...style }} {...rest}>{children}</ol>
    </OlDepthContext.Provider>
  )
}

function MarkdownUl({ children, style, ...rest }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul style={{ listStyleType: "disc", ...style }} {...rest}>{children}</ul>
}

// Module-level cache: accountId → display name. Survives unmounts.
const userMentionCache = new Map<string, string>()
const userMentionInflight = new Map<string, Promise<string | null>>()

// Module-level cache: attachment id → { url, mime }. Survives unmounts so lightbox + thumb share.
type CachedBlob = { url: string; mime: string }
const attachmentBlobCache = new Map<string, CachedBlob>()

function useAttachmentBlob(attachmentId: string) {
  const session = useContext(SessionContext)
  const [data, setData] = useState<CachedBlob | null>(() => attachmentBlobCache.get(attachmentId) ?? null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (!attachmentId) { setData(null); return }
    const cached = attachmentBlobCache.get(attachmentId)
    if (cached) { setData(cached); return }
    if (!session) return
    let cancelled = false

    fetch("/api/jira/attachment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentials: { domain: session.domain, email: session.email, apiKey: session.apiKey },
        attachmentId,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
      .then(blob => {
        if (cancelled) return
        const entry = { url: URL.createObjectURL(blob), mime: blob.type || "" }
        attachmentBlobCache.set(attachmentId, entry)
        setData(entry)
      })
      .catch(() => { if (!cancelled) setErrored(true) })

    return () => { cancelled = true }
  }, [attachmentId, session])

  return { src: data?.url ?? null, mime: data?.mime ?? "", errored }
}

function isVideoMedia(mime: string, name?: string): boolean {
  if (mime?.startsWith("video/")) return true
  if (name && /\.(mp4|webm|mov|m4v|ogv)$/i.test(name)) return true
  return false
}

const MAX_MEDIA_WIDTH = 360

function JiraImage({ attachmentId, alt, width }: { attachmentId: string; alt?: string; width?: number }) {
  const { src, mime, errored } = useAttachmentBlob(attachmentId)
  const lightbox = useContext(LightboxContext)

  const cappedWidth = width ? Math.min(width, MAX_MEDIA_WIDTH) : MAX_MEDIA_WIDTH

  if (errored) return <span className="text-xs text-muted-foreground italic">[media unavailable: {alt}]</span>
  if (!src) {
    return (
      <span
        className="inline-flex items-center justify-center rounded border border-border/50 bg-muted/40 my-2"
        style={{ width: cappedWidth, height: cappedWidth * 0.6 }}
        aria-label="Loading media"
      >
        <span className="relative block w-12 h-1 rounded-full bg-muted-foreground/15 overflow-hidden">
          <span className="absolute inset-y-0 w-1/2 rounded-full bg-muted-foreground/60 animate-[indeterminate_1.2s_ease-in-out_infinite]" />
        </span>
      </span>
    )
  }

  if (isVideoMedia(mime, alt)) {
    return (
      <video
        src={src}
        controls
        style={{ maxWidth: cappedWidth, height: "auto" }}
        className="rounded border border-border/50 my-2 cursor-pointer"
        onClick={() => lightbox?.openAt(attachmentId)}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => lightbox?.openAt(attachmentId)}
      className="block p-0 border-0 bg-transparent cursor-zoom-in my-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ maxWidth: cappedWidth, height: "auto" }}
        className="rounded border border-border/50 hover:border-border transition-colors"
      />
    </button>
  )
}

function Lightbox() {
  const ctx = useContext(LightboxContext)
  const idx = ctx ? ctx.images.findIndex(i => i.id === ctx.openId) : -1
  const current = idx >= 0 ? ctx!.images[idx] : null
  const { src, mime } = useAttachmentBlob(current?.id ?? "")

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (typeof e.key !== "string") return
      if (e.key === "Escape") { e.preventDefault(); ctx?.close() }
      else if (e.key === "ArrowRight") { e.preventDefault(); ctx?.next() }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ctx?.prev() }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [current, ctx])

  if (!ctx || !current) return null
  const total = ctx.images.length
  const canPrev = idx > 0
  const canNext = idx < total - 1

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={ctx.close}
      role="dialog"
      aria-modal="true"
    >
      {/* Close */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); ctx.close() }}
        className="absolute top-4 right-4 h-9 w-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Counter + filename */}
      <div className="absolute top-4 left-4 text-white/80 text-sm flex items-center gap-3">
        <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{idx + 1} / {total}</span>
        {current.alt && <span className="truncate max-w-[40vw]">{current.alt}</span>}
      </div>

      {/* Prev */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); ctx.prev() }}
        disabled={!canPrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-white/10"
        aria-label="Previous"
      >
        <ChevronLeft className="w-7 h-7" />
      </button>

      {/* Next */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); ctx.next() }}
        disabled={!canNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-white/10"
        aria-label="Next"
      >
        <ChevronRight className="w-7 h-7" />
      </button>

      {/* Image */}
      <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
        {src ? (
          isVideoMedia(mime, current.alt) ? (
            <video
              src={src}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={current.alt} className="max-w-full max-h-[90vh] object-contain" />
          )
        ) : (
          <div className="text-white/60 text-sm">Loading…</div>
        )}
      </div>
    </div>
  )
}

function MarkdownImg({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) {
  if (typeof src === "string" && src.startsWith("jira-att:")) {
    const rest = src.slice("jira-att:".length)
    const [id, qs] = rest.split("?")
    const widthMatch = qs?.match(/(?:^|&)w=(\d+)/)
    const width = widthMatch ? Number(widthMatch[1]) : undefined
    return <JiraImage attachmentId={id} alt={alt} width={width} />
  }
  if (typeof src === "string" && src.startsWith("missing-att:")) {
    const filename = decodeURIComponent(src.slice("missing-att:".length))
    return <span className="text-xs text-muted-foreground italic">[missing attachment: {filename}]</span>
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ maxWidth: "100%" }} />
}

function useUserMention(accountId: string) {
  const session = useContext(SessionContext)
  const [name, setName] = useState<string | null>(() => userMentionCache.get(accountId) ?? null)

  useEffect(() => {
    if (!accountId) return
    const cached = userMentionCache.get(accountId)
    if (cached) { setName(cached); return }
    if (!session) return
    let cancelled = false

    let p = userMentionInflight.get(accountId)
    if (!p) {
      p = fetch("/api/jira/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: { domain: session.domain, email: session.email, apiKey: session.apiKey },
          path: "/rest/api/3/user",
          params: { accountId },
        }),
      })
        .then(r => r.json())
        .then((data: { displayName?: string }) => {
          const dn = data?.displayName ?? null
          if (dn) userMentionCache.set(accountId, dn)
          return dn
        })
        .catch(() => null)
        .finally(() => { userMentionInflight.delete(accountId) })
      userMentionInflight.set(accountId, p)
    }

    p.then(dn => { if (!cancelled && dn) setName(dn) })
    return () => { cancelled = true }
  }, [accountId, session])

  return name
}

function UserMention({ accountId, fallback }: { accountId: string; fallback?: string }) {
  const name = useUserMention(accountId)
  const cleanFallback = fallback && fallback !== "@" ? fallback.replace(/^@/, "") : ""
  const display = name ?? cleanFallback ?? "user"
  return (
    <span
      className="not-prose inline-flex items-center gap-1 px-1.5 py-0.5 align-middle rounded bg-muted hover:bg-muted-foreground/20 transition-colors text-[12px] leading-none text-foreground max-w-full"
      title={accountId}
    >
      <span className="truncate">@{display}</span>
    </span>
  )
}

function MarkdownA({ href, title, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (title === "mention" && href) {
    const accountId = href.replace(/^jira-mention:/, "")
    const childText = Children.toArray(children).map(c => typeof c === "string" ? c : "").join("")
    return <UserMention accountId={accountId} fallback={childText} />
  }
  if (title === "smart-link" && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="not-prose inline-flex items-center gap-1 px-1.5 py-0.5 align-middle border border-primary/30 rounded bg-primary/10 hover:bg-primary/20 hover:border-primary/50 transition-colors text-[12px] leading-none text-primary no-underline max-w-full"
      >
        <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-70" />
        <span className="truncate">{children}</span>
      </a>
    )
  }
  return (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
      {children}
    </a>
  )
}

function StoryField({ label, value, attachments }: { label: string; value?: unknown; attachments?: Attachment[] }) {
  const md = parseRichText(value, attachments)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-primary/60 uppercase tracking-wide">{label}</span>
      {md ? (
        <div className="max-w-none text-sm [&_p]:leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-1 [&_ol]:pl-6 [&_ul]:pl-6 [&_ul]:list-disc [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-[0.85em] [&_strong]:font-semibold [&_del]:line-through [&_del]:opacity-60">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            // Allow custom jira-att: / missing-att: schemes through the URL sanitizer
            urlTransform={(url) => url}
            components={{ ol: MarkdownOl, ul: MarkdownUl, a: MarkdownA, img: MarkdownImg }}
          >
            {md}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">—</p>
      )}
    </div>
  )
}

function FigmaEmbed({ url, hasDesigns, jiraUrl }: { url?: string | null; hasDesigns?: boolean; jiraUrl?: string }) {
  if (url) {
    const embedUrl = `https://www.figma.com/embed?embed_host=figma-jira-add-on&url=${encodeURIComponent(url)}`
    return <iframe src={embedUrl} className="w-full h-full border-0" allowFullScreen />
  }

  if (hasDesigns && jiraUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <svg viewBox="0 0 38 57" className="w-7 h-7 opacity-20" fill="none">
          <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0Z" fill="#1ABCFE"/>
          <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 0 1-19 0Z" fill="#0ACF83"/>
          <path d="M19 0v19h9.5a9.5 9.5 0 0 0 0-19H19Z" fill="#FF7262"/>
          <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" fill="#F24E1E"/>
          <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" fill="#A259FF"/>
        </svg>
        <p className="text-[11px] text-muted-foreground/50 text-center leading-relaxed">
          Design linked in Jira.<br />Preview unavailable here.
        </p>
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/60 bg-muted/40 hover:bg-muted/70 transition-colors text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="w-3 h-3" />
          View in Jira
        </a>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-[11px] text-muted-foreground/50">No UI provided.</span>
    </div>
  )
}

function UserStoryPanel({ issue }: { issue: Issue }) {
  const { fields } = issue
  const attachments = fields.attachment

  const sections: { label: string; value: unknown }[] = [
    { label: "Acceptance Criteria", value: fields.customfield_10295 },
    { label: "User Story",          value: fields.customfield_10293 },
    { label: "Where",               value: fields.customfield_10290 },
    { label: "Background",          value: fields.customfield_10289 },
    { label: "Description",         value: fields.description },
  ]

  const populated = sections.filter(s => parseRichText(s.value, attachments).trim() !== "")
  const empty = sections.filter(s => parseRichText(s.value, attachments).trim() === "")

  // Collect all attachment image IDs in render order across all sections (for lightbox nav)
  const lightboxImages: LightboxImage[] = useMemo(() => {
    const seen = new Set<string>()
    const list: LightboxImage[] = []
    for (const s of populated) {
      const md = parseRichText(s.value, attachments)
      const re = /jira-att:([^?)\s]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(md))) {
        const id = m[1]
        if (seen.has(id)) continue
        seen.add(id)
        const att = attachments?.find(a => a.id === id)
        list.push({ id, alt: att?.filename })
      }
    }
    return list
  }, [populated, attachments])

  const [openId, setOpenId] = useState<string | null>(null)
  const lightboxCtx: LightboxCtx = useMemo(() => ({
    images: lightboxImages,
    openId,
    openAt: (id) => setOpenId(id),
    close: () => setOpenId(null),
    next: () => setOpenId(cur => {
      const i = lightboxImages.findIndex(x => x.id === cur)
      return i >= 0 && i < lightboxImages.length - 1 ? lightboxImages[i + 1].id : cur
    }),
    prev: () => setOpenId(cur => {
      const i = lightboxImages.findIndex(x => x.id === cur)
      return i > 0 ? lightboxImages[i - 1].id : cur
    }),
  }), [lightboxImages, openId])

  if (populated.length === 0) {
    return (
      <div className="flex flex-col p-4 h-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <FileX2 className="w-5 h-5 text-muted-foreground/30" />
          <span className="text-[11px] text-muted-foreground/50">Empty ticket</span>
        </div>
        <div className="border-t border-border/60" />
        <div className="flex gap-6 pt-3 text-[11px] text-muted-foreground/50">
          {fields.created && <span>Created {formatDate(fields.created)}</span>}
          {fields.updated && <span>Updated {formatDate(fields.updated)}</span>}
        </div>
      </div>
    )
  }

  return (
    <LightboxContext.Provider value={lightboxCtx}>
    <div className="flex flex-col gap-3 p-4 h-full overflow-auto">
      {populated.map((s, i) => (
        <div key={s.label} className="flex flex-col gap-3">
          <StoryField label={s.label} value={s.value} attachments={attachments} />
          {i < populated.length - 1 && <div className="border-t border-border/60" />}
        </div>
      ))}

      <div className="border-t border-border/60 mt-auto" />

      {/* Footer */}
      <div className="flex flex-col gap-1">
        {empty.length > 0 && (
          <p className="text-[11px] text-muted-foreground/50">
            Empty fields: {empty.map(s => s.label).join(", ")}
          </p>
        )}
        <div className="flex gap-6 text-[11px] text-muted-foreground/50">
          {fields.created && <span>Created {formatDate(fields.created)}</span>}
          {fields.updated && <span>Updated {formatDate(fields.updated)}</span>}
        </div>
      </div>
    </div>
    <Lightbox />
    </LightboxContext.Provider>
  )
}

export function BacklogView({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<SprintWithIssues[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [boardId, setBoardId] = useState<number | null>(null)
  const [showExtra, setShowExtra] = useState(false)
  const [backlogGroup, setBacklogGroup] = useState<SprintWithIssues | null>(null)
  const [futureSprints, setFutureSprints] = useState<SprintWithIssues[]>([])
  const [loadingExtra, setLoadingExtra] = useState(false)
  const [search, setSearch] = useState("")
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [figmaUrl, setFigmaUrl] = useState<string | null>(null)
  const [figmaHasDesigns, setFigmaHasDesigns] = useState(false)
  const [rightTab, setRightTab] = useState<1 | 2>(1)
  const panelRef = useRef<HTMLDivElement>(null)

  // Click-away: close panel when clicking outside it and outside any ticket row.
  // (Clicking another row is handled by the row's own onClick — switches content.)
  useEffect(() => {
    if (!selectedIssue) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (panelRef.current?.contains(target)) return
      if (target.closest("[data-ticket-row]")) return
      if (target.closest("[data-toolbar]")) return
      setSelectedIssue(null)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [selectedIssue])

  // Fetch Figma design URL from issue properties when a ticket is selected
  useEffect(() => {
    if (!selectedIssue) { setFigmaUrl(null); setFigmaHasDesigns(false); return }
    const creds = { domain: session.domain, email: session.email, apiKey: session.apiKey }
    let cancelled = false

    /** Recursively search any JSON value for a figma.com URL string */
    function extractFigmaUrl(val: unknown): string | null {
      if (typeof val === "string" && val.includes("figma.com")) return val
      if (Array.isArray(val)) {
        for (const item of val) {
          const found = extractFigmaUrl(item)
          if (found) return found
        }
      }
      if (val && typeof val === "object") {
        for (const v of Object.values(val as Record<string, unknown>)) {
          const found = extractFigmaUrl(v)
          if (found) return found
        }
      }
      return null
    }

    async function fetchFigmaUrl() {
      // 1. List all properties for this issue to find any design/figma key
      let propKeys: string[] = []
      try {
        const list = await jiraFetch(creds, `/rest/api/3/issue/${selectedIssue!.key}/properties`)
        propKeys = (list?.keys ?? []).map((k: { key: string }) => k.key) as string[]
      } catch { /* ignore */ }

      // Priority order: known Figma keys first, then any key containing "figma" or "design"
      const KNOWN = ["com.atlassian.jira.designs-last-viewed", "com.figma.jira-integration", "com.figma.jira"]
      const candidates = [
        ...KNOWN.filter(k => propKeys.includes(k)),
        ...propKeys.filter(k => !KNOWN.includes(k) && (k.toLowerCase().includes("figma") || k.toLowerCase().includes("design"))),
      ]

      // If any design-related property exists, designs are linked even if we can't extract a URL
      const hasDesigns = candidates.length > 0

      for (const key of candidates) {
        try {
          const data = await jiraFetch(creds, `/rest/api/3/issue/${selectedIssue!.key}/properties/${encodeURIComponent(key)}`)
          const url = extractFigmaUrl(data?.value)
          if (url) return { url, hasDesigns: true }
        } catch { /* try next */ }
      }
      return { url: null, hasDesigns }
    }

    fetchFigmaUrl().then(({ url, hasDesigns }) => {
      if (!cancelled) {
        setFigmaUrl(url)
        setFigmaHasDesigns(hasDesigns)
      }
    })

    return () => { cancelled = true }
  }, [selectedIssue?.key])

  // Arrow-key navigation: ↑ / ↓ moves between tickets in visible order while panel is open
  useEffect(() => {
    if (!selectedIssue) return

    const onKey = (e: KeyboardEvent) => {
      if (typeof e.key !== "string") return
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
      const target = e.target as HTMLElement | null
      if (target && (target.matches("input, textarea, select, [contenteditable='true']"))) return

      // Build flat list matching visual order (same logic as render)
      const active = sprints.filter(s => s.state === "active")
      const closed = sprints.filter(s => s.state === "closed")
      const all: SprintWithIssues[] = [
        ...(showExtra && backlogGroup ? [backlogGroup] : []),
        ...(showExtra ? futureSprints : []),
        ...active,
        ...closed,
      ]
      const q = search.toLowerCase()
      const flat: Issue[] = all.flatMap(s =>
        q ? s.issues.filter(i => i.key.toLowerCase().includes(q)) : s.issues,
      )
      if (flat.length === 0) return

      const idx = flat.findIndex(i => i.id === selectedIssue.id)
      if (idx === -1) return

      e.preventDefault()
      const nextIdx = e.key === "ArrowDown"
        ? Math.min(idx + 1, flat.length - 1)
        : Math.max(idx - 1, 0)
      if (nextIdx !== idx) setSelectedIssue(flat[nextIdx])
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedIssue, sprints, backlogGroup, futureSprints, showExtra, search])

  const creds = { domain: session.domain, email: session.email, apiKey: session.apiKey }

  const [colWidths, setColWidths] = useState<ColWidths>({ epic: 130, status: 110 })
  const [hoveredCol, setHoveredCol] = useState<"epic" | "status" | null>(null)

  const makeResizeHandler = useCallback((col: keyof ColWidths, min: number, max: number) =>
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = colWidths[col]
      const onMove = (ev: MouseEvent) => {
        setColWidths(prev => ({ ...prev, [col]: Math.min(max, Math.max(min, startWidth - (ev.clientX - startX))) }))
      }
      const onUp = () => {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
      }
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    }, [colWidths])

  const resizeHandlers: ColResizeHandlers = {
    onEpicResizeMouseDown: makeResizeHandler("epic", 60, 260),
    onStatusResizeMouseDown: makeResizeHandler("status", 60, 200),
    onEpicHandleEnter: () => setHoveredCol("epic"),
    onEpicHandleLeave: () => setHoveredCol(null),
    onStatusHandleEnter: () => setHoveredCol("status"),
    onStatusHandleLeave: () => setHoveredCol(null),
  }

  // Fetch projects on mount — serve cache instantly, refresh in background
  useEffect(() => {
    const projectCacheKey = `jira-projects:${session.domain}`
    const cached = cacheGet<Project[]>(projectCacheKey)
    if (cached) {
      setProjects(cached)
      const lp = cached.find(p => p.key === "LP") ?? cached[0] ?? null
      setSelectedProject(lp)
    }
    jiraFetch(creds, "/rest/api/3/project/search", { maxResults: "50", orderBy: "name" })
      .then(data => {
        const list: Project[] = (data.values ?? []).map((p: Project) => ({ id: p.id, key: p.key, name: p.name }))
        cacheSet(projectCacheKey, list)
        setProjects(list)
        if (!cached) {
          const lp = list.find(p => p.key === "LP") ?? list[0] ?? null
          setSelectedProject(lp)
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (background = false) => {
    if (!selectedProject) return
    const sprintCacheKey = `jira-sprints:${session.domain}:${selectedProject.key}`

    // Serve cached sprints immediately
    if (!background) {
      const cached = cacheGet<{ sprints: SprintWithIssues[]; futureSprints: SprintWithIssues[]; boardId: number }>(sprintCacheKey)
      if (cached) {
        setSprints(cached.sprints)
        setFutureSprints(cached.futureSprints)
        setBoardId(cached.boardId)
        setLoading(false)
        // Refresh in background
        load(true)
        return
      }
    }

    if (!background) { setLoading(true); setError(null) }

    try {
      const boardData = await jiraFetch(creds, "/rest/agile/1.0/board", { projectKeyOrId: selectedProject.key, maxResults: "50" })
      const boards = boardData.values ?? []
      const board = boards.find((b: { location?: { projectKey?: string } }) => b.location?.projectKey === selectedProject.key) ?? boards[0]
      if (!board) throw new Error(`No board found for ${selectedProject.key}`)

      const sprintData = await jiraFetch(creds, `/rest/agile/1.0/board/${board.id}/sprint`, {
        state: "active,future,closed",
        maxResults: "100",
      })

      const allSprints: Sprint[] = (sprintData.values ?? []).sort((a: Sprint, b: Sprint) => {
        const order = { active: 0, future: 1, closed: 2 }
        if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state]
        return new Date(b.startDate ?? 0).getTime() - new Date(a.startDate ?? 0).getTime()
      })

      setBoardId(board.id)
      if (!background) { setBacklogGroup(null); setFutureSprints([]); setShowExtra(false) }

      const activeClosed = [
        ...allSprints.filter(s => s.state === "active"),
        ...allSprints.filter(s => s.state === "closed"),
      ]
      const future = allSprints.filter(s => s.state === "future")

      const fetchIssues = async (sprint: Sprint) => {
        const data = await jiraFetch(creds, `/rest/agile/1.0/sprint/${sprint.id}/issue`, {
          fields: "summary,status,assignee,issuetype,priority,parent,customfield_10014,description,reporter,labels,customfield_10289,customfield_10293,customfield_10290,customfield_10295,customfield_10024,created,updated,attachment",
          maxResults: "100",
        })
        const issues = (data.issues ?? [] as Issue[]).filter((i: Issue) => i.key.startsWith(selectedProject.key + "-"))
        return { ...sprint, issues, total: data.total ?? 0 }
      }

      const [sprintsWithIssues, futureWithIssues] = await Promise.all([
        Promise.all(activeClosed.map(fetchIssues)),
        Promise.all(future.map(fetchIssues)),
      ])

      cacheSet(sprintCacheKey, { sprints: sprintsWithIssues, futureSprints: futureWithIssues, boardId: board.id })
      setSprints(sprintsWithIssues)
      setFutureSprints(futureWithIssues)
    } catch (e) {
      if (!background) setError(e instanceof Error ? e.message : "Failed to load backlog")
    } finally {
      if (!background) setLoading(false)
    }
  }, [selectedProject]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(false) }, [load])

  async function toggleExtra() {
    const next = !showExtra
    setShowExtra(next)
    if (next && !backlogGroup && boardId && selectedProject) {
      setLoadingExtra(true)
      try {
        const data = await jiraFetch(creds, `/rest/agile/1.0/board/${boardId}/backlog`, {
          fields: "summary,status,assignee,issuetype,priority,parent,customfield_10014,description,reporter,labels,customfield_10289,customfield_10293,customfield_10290,customfield_10295,customfield_10024,created,updated,attachment",
          maxResults: "300",
        })
        const issues = (data.issues ?? [] as Issue[]).filter((i: Issue) => i.key.startsWith(selectedProject.key + "-"))
        setBacklogGroup({
          id: -1,
          name: "Backlog",
          state: "future",
          issues,
          total: issues.length,
        })
      } catch { /* silent */ } finally {
        setLoadingExtra(false)
      }
    }
  }

  const extraCount = futureSprints.reduce((n, s) => n + s.total, 0) + (backlogGroup?.total ?? 0)

  const avatar = session.user.avatarUrls?.["48x48"] ?? Object.values(session.user.avatarUrls ?? {})[0]

  return (
    <SessionContext.Provider value={session}>
    <div className="h-svh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
            <rect width="14" height="14" x="1" y="1" rx="2" fill="#0052CC" />
            <path d="M4 4h3v3H4zM9 4h3v3H9zM4 9h3v3H4zM9 9h3v3H9z" fill="white" />
          </svg>
          <SpaceDropdown
            projects={projects}
            selected={selectedProject}
            onSelect={p => { setSelectedProject(p); setSprints([]) }}
          />
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell
            credentials={creds}
            accountId={session.user.accountId}
          />
          <Tooltip text="Click to log out">
            <button
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full pl-2 pr-1 py-0.5 hover:bg-muted transition-all"
            >
              <span className="text-sm text-muted-foreground">{session.user.displayName}</span>
              {avatar
                ? <img src={avatar} alt={session.user.displayName} className="h-6 w-6 rounded-full" />
                : <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">{session.user.displayName?.[0] ?? "?"}</div>
              }
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Toolbar */}
      <div data-toolbar className="flex items-center justify-between gap-3 px-6 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Tooltip text={expandAll === true ? "Collapse all" : "Expand all"}>
            <button
              onClick={() => setExpandAll(v => v === true ? false : true)}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              {expandAll === true
                ? <ChevronsDownUp className="w-3.5 h-3.5" />
                : <ChevronsUpDown className="w-3.5 h-3.5" />
              }
            </button>
          </Tooltip>
          <div className="relative flex items-center">
            <Search className="absolute left-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search backlog"
              className="h-7 w-44 rounded-md border border-border bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-1.5 flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={toggleExtra}
          disabled={loadingExtra}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{loadingExtra ? "Loading…" : `Show future sprints & backlog${!showExtra && extraCount > 0 ? ` (${extraCount})` : ""}`}</span>
          <span
            className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border border-border transition-colors duration-200 ease-in-out ${showExtra ? "bg-primary border-primary" : "bg-muted"}`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out mt-[1px] ${showExtra ? "translate-x-3.5" : "translate-x-0.5"}`}
            />
          </span>
        </button>
      </div>

      {/* Body — main table shrinks while a sliding right detail panel overlays from the right */}
      <div className="flex-1 min-h-0 relative">
        <div
          className="h-full overflow-auto flex flex-col transition-[width,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: selectedIssue ? "30vw" : "100%", padding: selectedIssue ? "24px 12px 24px 24px" : "24px" }}
        >
          {loading && (
            <div className="border border-border rounded-md overflow-hidden h-full">
              <SprintGroupSkeleton />
            </div>
          )}
          {error && <div className="text-sm text-destructive mt-8 text-center">{error}</div>}
          {!loading && !error && (
            <div className="border border-border rounded-md overflow-hidden flex-shrink-0">
              {(() => {
                const active = sprints.filter(s => s.state === "active")
                const closed = sprints.filter(s => s.state === "closed")
                const all: SprintWithIssues[] = [
                  ...(showExtra && backlogGroup ? [backlogGroup] : []),
                  ...(showExtra ? futureSprints : []),
                  ...active,
                  ...closed,
                ]
                if (all.length === 0) return <div className="text-sm text-muted-foreground p-6 text-center">No sprints found</div>
                const extraCount2 = (backlogGroup ? 1 : 0) + futureSprints.length
                return all.map((sprint, i) => (
                  <SprintGroup
                    key={sprint.id}
                    sprint={sprint}
                    defaultOpen={i === (showExtra ? extraCount2 : 0)}
                    search={search}
                    highlight={showExtra && i < extraCount2}
                    expandAll={expandAll}
                    colWidths={colWidths}
                    resizeHandlers={resizeHandlers}
                    onSelectIssue={setSelectedIssue}
                    selectedIssueId={selectedIssue?.id ?? null}
                    hoveredCol={hoveredCol}
                    panelOpen={selectedIssue !== null}
                  />
                ))
              })()}
            </div>
          )}
        </div>

        {/* Right detail panel — 70vw, slides in from the right. Absolute so it doesn't reserve flex space when closed. */}
        <div
          ref={panelRef}
          aria-hidden={!selectedIssue}
          className="absolute top-0 right-0 h-full bg-background flex flex-col"
          style={{
            width: "70vw",
            transform: selectedIssue ? "translateX(0)" : "translateX(100%)",
            visibility: selectedIssue ? "visible" : "hidden",
            transition: "transform 300ms cubic-bezier(0.22, 1, 0.36, 1), visibility 300ms",
          }}
        >
          {selectedIssue && (() => {
            const jiraUrl = `https://${session.domain}.atlassian.net/browse/${selectedIssue.key}`
            return (
            <div className="flex flex-col h-full pl-2 pr-4 pt-3 pb-4 gap-3">
              {/* Bento Title — no border, same surface as background */}
              <div className="flex items-center justify-between px-1 gap-3">
                <div className="group flex items-center gap-2 min-w-0">
                  <IssueTypeIcon name={selectedIssue.fields.issuetype.name} />
                  <span className="text-sm font-mono text-muted-foreground flex-shrink-0">{selectedIssue.key}</span>
                  <span className="text-sm font-medium truncate">{selectedIssue.fields.summary}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <CopyLinkButton url={jiraUrl} />
                    <Tooltip text="Open in Jira">
                      <a
                        href={jiraUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Tooltip>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedIssue.fields.parent && (
                    <Tooltip text={selectedIssue.fields.parent.fields.summary}>
                      <span className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground border border-border/60 max-w-[180px] truncate block">
                        {selectedIssue.fields.parent.fields.summary}
                      </span>
                    </Tooltip>
                  )}
                  <button
                    onClick={() => setSelectedIssue(null)}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Close panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Bento grid — 2 columns */}
              <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px] gap-3">
                {/* Bento Area #1 — User Story details */}
                <div className="border border-border/80 bg-card overflow-auto" style={{ borderRadius: "calc(var(--radius) * 0.8)" }}>
                  <UserStoryPanel issue={selectedIssue} />
                </div>

                {/* Right column — tab toggle + content */}
                <div className="flex flex-col gap-2 min-h-0">
                  {/* Tab toggle */}
                  <div className="flex w-full gap-1 p-0.5 rounded-md bg-muted/60 border border-border/60">
                    {([1, 2] as const).map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRightTab(n)}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors ${
                          rightTab === n
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                        }`}
                      >
                        Bento tab {n}
                      </button>
                    ))}
                  </div>

                  {rightTab === 1 ? (
                    <div className="flex-1 min-h-0 flex flex-col gap-3">
                      {/* Bento Area #2 — Figma embed, 4:3 */}
                      <div className="aspect-[4/3] border border-border/80 bg-card overflow-hidden flex-shrink-0" style={{ borderRadius: "calc(var(--radius) * 0.8)" }}>
                        <FigmaEmbed
                          url={figmaUrl}
                          hasDesigns={figmaHasDesigns}
                          jiraUrl={`https://${session.domain}.atlassian.net/browse/${selectedIssue.key}`}
                        />
                      </div>

                      {/* Bento Area #3 — bottom right card */}
                      <div className="flex-1 border border-border/80 bg-card" style={{ borderRadius: "calc(var(--radius) * 0.8)" }} />
                    </div>
                  ) : (
                    /* Bento Area #4 — full height */
                    <div className="flex-1 border border-border/80 bg-card" style={{ borderRadius: "calc(var(--radius) * 0.8)" }} />
                  )}
                </div>
              </div>
            </div>
          )})()}
        </div>
      </div>
    </div>
    </SessionContext.Provider>
  )
}
