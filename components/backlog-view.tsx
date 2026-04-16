"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Check, Search } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip } from "@/components/tooltip"

type Session = {
  domain: string
  email: string
  apiKey: string
  user: {
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
  const map: Record<string, string> = {
    "blue-grey": "bg-slate-100 text-slate-600",
    yellow: "bg-yellow-100 text-yellow-700",
    green: "bg-green-100 text-green-700",
    blue: "bg-blue-100 text-blue-700",
    red: "bg-red-100 text-red-700",
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${map[cat] ?? "bg-slate-100 text-slate-600"}`}>
      {status.name}
    </span>
  )
}

function EpicBadge({ epicKey, epicName }: { epicKey: string; epicName: string }) {
  const c = epicColor(epicKey)
  return (
    <Tooltip text={epicName}>
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap max-w-[130px] truncate"
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

function IssueRow({ issue }: { issue: Issue }) {
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
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-muted/40 border-t border-border/50 group min-w-0">
      <Checkbox className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100" />
      <span className="w-3 flex-shrink-0 flex items-center justify-center">
        <PriorityIcon name={fields.priority?.name ?? ""} />
      </span>
      <IssueTypeIcon name={fields.issuetype.name} />
      <span className="text-[11px] text-muted-foreground flex-shrink-0 w-16 font-mono">{issue.key}</span>
      <span className="text-sm flex-1 min-w-0 truncate">{fields.summary}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {epicKey && epicName && <EpicBadge epicKey={epicKey} epicName={epicName} />}
        <StatusBadge status={fields.status} />
        {fields.assignee && (
          <Tooltip text={fields.assignee.displayName}>
            {assigneeAvatar
              ? <img src={assigneeAvatar} alt={fields.assignee.displayName} className="w-5 h-5 rounded-full flex-shrink-0" />
              : <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] flex-shrink-0">{fields.assignee.displayName[0]}</div>
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

function SprintGroup({ sprint, defaultOpen = true, search = "", highlight = false, expandAll = null }: { sprint: SprintWithIssues; defaultOpen?: boolean; search?: string; highlight?: boolean; expandAll?: boolean | null }) {
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
          {filtered.map(issue => <IssueRow key={issue.id} issue={issue} />)}
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

  const creds = { domain: session.domain, email: session.email, apiKey: session.apiKey }

  // Fetch projects on mount
  useEffect(() => {
    jiraFetch(creds, "/rest/api/3/project/search", { maxResults: "50", orderBy: "name" })
      .then(data => {
        const list: Project[] = (data.values ?? []).map((p: Project) => ({ id: p.id, key: p.key, name: p.name }))
        setProjects(list)
        const lp = list.find(p => p.key === "LP") ?? list[0] ?? null
        setSelectedProject(lp)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!selectedProject) return
    setLoading(true)
    setError(null)
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
      setBacklogGroup(null)
      setFutureSprints([])
      setShowExtra(false)

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

      setSprints(sprintsWithIssues)
      setFutureSprints(futureWithIssues)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backlog")
    } finally {
      setLoading(false)
    }
  }, [selectedProject]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

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
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">
            Spaces / {selectedProject?.name ?? "…"}
          </p>
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
        </div>
        <Tooltip text={`${session.user.displayName} — click to log out`}>
        <button
          onClick={onLogout}
          className="rounded-full p-0.5 hover:ring-2 hover:ring-border transition-all"
        >
          {avatar
            ? <img src={avatar} alt={session.user.displayName} className="h-8 w-8 rounded-full" />
            : <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">{session.user.displayName?.[0] ?? "?"}</div>
          }
        </button>
        </Tooltip>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-6 py-2 border-b border-border">
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

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        {loading && <div className="text-sm text-muted-foreground mt-8 text-center">Loading backlog…</div>}
        {error && <div className="text-sm text-destructive mt-8 text-center">{error}</div>}
        {!loading && !error && (
          <div className="border border-border rounded-md overflow-hidden">
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
                  />
                ))
              })()}
            </div>
        )}
      </div>
    </div>
  )
}
