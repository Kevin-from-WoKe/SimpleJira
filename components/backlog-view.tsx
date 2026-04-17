"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Check, Search, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip } from "@/components/tooltip"
import { NotificationBell } from "@/components/notification-bell"

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

function IssueTypeIcon({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n === "bug") return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
      <circle cx="8" cy="8" r="7" fill="#E5483B" />
      <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
  if (n === "story") return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
      <rect width="14" height="14" x="1" y="1" rx="2" fill="#63BA3C" />
      <path d="M5 3.5v9l3-2 3 2V3.5H5z" fill="white" />
    </svg>
  )
  if (n === "epic") return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
      <rect width="14" height="14" x="1" y="1" rx="2" fill="#904EE2" />
      <path d="M9 2.5L5.5 9H8L7 13.5L10.5 7H8L9 2.5z" fill="white" />
    </svg>
  )
  if (n === "subtask" || n === "sub-task") return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
      <rect width="12" height="12" x="2" y="2" rx="2" fill="#4BADE8" />
      <path d="M4.5 8.5L6.5 10.5L11 5.5" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
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
function IssueRowSkeleton() {
  return (
    <div className="flex items-center gap-2 px-3 py-1 border-t border-border/50 animate-pulse">
      <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
      <div className="h-3 w-3 rounded bg-muted flex-shrink-0" />
      <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
      <div className="h-2.5 w-16 rounded bg-muted flex-shrink-0" />
      <div className="h-3 flex-1 rounded bg-muted min-w-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-4 w-12 rounded bg-muted" />
        <div className="h-5 w-5 rounded-full bg-muted" />
      </div>
    </div>
  )
}

function SprintGroupSkeleton() {
  return (
    <div className="border-t border-border first:border-t-0 animate-pulse">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
        <div className="h-3.5 w-3.5 rounded bg-muted flex-shrink-0" />
        <div className="h-3.5 w-40 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <IssueRowSkeleton key={i} />)}
    </div>
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
          fields: "summary,status,assignee,issuetype,priority,parent,customfield_10014",
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
          fields: "summary,status,assignee,issuetype,priority,parent,customfield_10014",
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
              className="h-7 w-44 rounded-md border border-border bg-background pl-7 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
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
          className="h-full overflow-auto p-6 flex flex-col transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: selectedIssue ? "30vw" : "100%" }}
        >
          {loading && (
            <div className="border border-border rounded-md overflow-hidden h-full">
              <SprintGroupSkeleton />
              <SprintGroupSkeleton />
              <SprintGroupSkeleton />
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
          className="absolute top-0 right-0 h-full border-l border-border bg-background shadow-xl flex flex-col"
          style={{
            width: "70vw",
            transform: selectedIssue ? "translateX(0)" : "translateX(100%)",
            visibility: selectedIssue ? "visible" : "hidden",
            transition: "transform 300ms cubic-bezier(0.22, 1, 0.36, 1), visibility 300ms",
          }}
        >
          {selectedIssue && (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <IssueTypeIcon name={selectedIssue.fields.issuetype.name} />
                  <span className="text-xs font-mono text-muted-foreground">{selectedIssue.key}</span>
                  <span className="text-sm truncate">{selectedIssue.fields.summary}</span>
                </div>
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6 text-sm text-muted-foreground">
                Ticket details will load here.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
