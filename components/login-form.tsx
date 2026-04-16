"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { BacklogView } from "@/components/backlog-view"
import config from "@/basecn.config"

const STORAGE_KEY = "jira-session"

type JiraUser = {
  accountId: string
  displayName: string
  emailAddress: string
  avatarUrls: Record<string, string>
}

type Session = {
  domain: string
  email: string
  apiKey: string
  user: JiraUser
}

export function LoginForm() {
  const [domain, setDomain] = useState("")
  const [email, setEmail] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedDomain = localStorage.getItem("jira-domain")
    if (savedDomain) setDomain(savedDomain)
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setSession(JSON.parse(saved))
      } catch {}
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/jira/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, apiKey }),
      })
      const text = await res.text()
      if (!text) {
        setError(`Empty response (HTTP ${res.status}) — check server logs`)
        return
      }
      const data = JSON.parse(text)
      if (!res.ok) {
        setError(data.error ?? "Login failed")
        return
      }
      localStorage.setItem("jira-domain", domain.trim())
      const newSession: Session = { domain, email, apiKey, user: data }
      if (remember) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession))
      }
      setSession(newSession)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setDomain("")
    setEmail("")
    setApiKey("")
  }

  if (!mounted) return null

  if (session) {
    return <BacklogView session={session} onLogout={handleLogout} />
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6 md:p-10">
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{config.name}</CardTitle>
        <CardDescription>{config.tagline}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="domain">Domain</Label>
            <div className="flex items-center gap-0">
              <Input
                id="domain"
                placeholder="yourcompany"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                className="rounded-r-none z-10"
              />
              <span className="flex h-9 items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground whitespace-nowrap">
                .atlassian.net
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="apikey">API Key</Label>
            <Input
              id="apikey"
              type="password"
              placeholder="Your Atlassian API token"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(v) => setRemember(!!v)}
            />
            <Label htmlFor="remember" className="font-normal">
              Remember me
            </Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
    </div>
  )
}
