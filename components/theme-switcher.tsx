"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Palette, Sun, Moon, Shuffle } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import themesData from "@/lib/themes-data.json"

const STORAGE_KEY = "shadcn-preset"

const COLOR_THEMES = [
  "blue", "violet", "rose", "red", "orange", "amber", "green",
] as const

type CssVars = {
  light: Record<string, string>
  dark: Record<string, string>
}

type FontInfo = { family: string; googleImport: string } | null

type SavedTheme = {
  type: "theme" | "preset"
  value: string
  cssVars: CssVars
  fonts?: { body: FontInfo; heading: FontInfo }
  spacing?: string
}

const SHUFFLE_FONTS: FontInfo[] = [
  // Sans-serif
  { family: "'Geist Variable', sans-serif", googleImport: "Geist" },
  { family: "'Inter Variable', sans-serif", googleImport: "Inter" },
  { family: "'DM Sans Variable', sans-serif", googleImport: "DM_Sans" },
  { family: "'Figtree Variable', sans-serif", googleImport: "Figtree" },
  { family: "'Outfit Variable', sans-serif", googleImport: "Outfit" },
  { family: "'Manrope Variable', sans-serif", googleImport: "Manrope" },
  { family: "'Space Grotesk Variable', sans-serif", googleImport: "Space_Grotesk" },
  { family: "'Montserrat Variable', sans-serif", googleImport: "Montserrat" },
  { family: "'Raleway Variable', sans-serif", googleImport: "Raleway" },
  { family: "'Roboto Variable', sans-serif", googleImport: "Roboto" },
  { family: "'Public Sans Variable', sans-serif", googleImport: "Public_Sans" },
  { family: "'Instrument Sans Variable', sans-serif", googleImport: "Instrument_Sans" },
  { family: "'Nunito Sans Variable', sans-serif", googleImport: "Nunito_Sans" },
  { family: "'IBM Plex Sans Variable', sans-serif", googleImport: "IBM_Plex_Sans" },
  { family: "'Source Sans 3 Variable', sans-serif", googleImport: "Source_Sans_3" },
  { family: "'Noto Sans Variable', sans-serif", googleImport: "Noto_Sans" },
  { family: "'Oxanium Variable', sans-serif", googleImport: "Oxanium" },
  { family: "'Plus Jakarta Sans Variable', sans-serif", googleImport: "Plus_Jakarta_Sans" },
  { family: "'Sora Variable', sans-serif", googleImport: "Sora" },
  { family: "'Poppins', sans-serif", googleImport: "Poppins" },
  { family: "'Lexend Variable', sans-serif", googleImport: "Lexend" },
  { family: "'Urbanist Variable', sans-serif", googleImport: "Urbanist" },
  { family: "'Rubik Variable', sans-serif", googleImport: "Rubik" },
  { family: "'Albert Sans Variable', sans-serif", googleImport: "Albert_Sans" },
  { family: "'Red Hat Display Variable', sans-serif", googleImport: "Red_Hat_Display" },
  { family: "'Satoshi Variable', sans-serif", googleImport: "Satoshi" },
  { family: "'Libre Franklin Variable', sans-serif", googleImport: "Libre_Franklin" },
  { family: "'Work Sans Variable', sans-serif", googleImport: "Work_Sans" },
  { family: "'Karla Variable', sans-serif", googleImport: "Karla" },
  { family: "'Cabin Variable', sans-serif", googleImport: "Cabin" },
  // Serif
  { family: "'Lora Variable', serif", googleImport: "Lora" },
  { family: "'Playfair Display Variable', serif", googleImport: "Playfair_Display" },
  { family: "'Noto Serif Variable', serif", googleImport: "Noto_Serif" },
  { family: "'Roboto Slab Variable', serif", googleImport: "Roboto_Slab" },
  { family: "'Merriweather', serif", googleImport: "Merriweather" },
  { family: "'Crimson Pro Variable', serif", googleImport: "Crimson_Pro" },
  { family: "'Bitter Variable', serif", googleImport: "Bitter" },
  { family: "'Fraunces Variable', serif", googleImport: "Fraunces" },
  { family: "'DM Serif Display', serif", googleImport: "DM_Serif_Display" },
  { family: "'Libre Baskerville', serif", googleImport: "Libre_Baskerville" },
  // Mono
  { family: "'JetBrains Mono Variable', monospace", googleImport: "JetBrains_Mono" },
  { family: "'Fira Code Variable', monospace", googleImport: "Fira_Code" },
]

const SHUFFLE_RADII = ["0", "0.3rem", "0.5rem", "0.625rem", "0.75rem", "1rem"]

const SPACING_OPTIONS = [
  { label: "Compact", value: "0.2rem" },
  { label: "Default", value: "0.25rem" },
  { label: "Relaxed", value: "0.3rem" },
  { label: "Spacious", value: "0.35rem" },
] as const

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function loadGoogleFont(googleImport: string) {
  const id = `gfont-${googleImport}`
  if (document.getElementById(id)) return
  const family = googleImport.replace(/_/g, "+")
  const link = document.createElement("link")
  link.id = id
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@100..900&display=swap`
  document.head.appendChild(link)
}

function applyFonts(fonts: { body: FontInfo; heading: FontInfo } | undefined) {
  if (!fonts) return
  const root = document.documentElement
  if (fonts.body) {
    loadGoogleFont(fonts.body.googleImport)
    root.style.setProperty("--font-sans", fonts.body.family)
  }
  if (fonts.heading) {
    loadGoogleFont(fonts.heading.googleImport)
    root.style.setProperty("--font-heading", fonts.heading.family)
  } else if (fonts.body) {
    // inherit: heading = body
    root.style.setProperty("--font-heading", `var(--font-sans)`)
  }
}

function applyTheme(cssVars: CssVars, fonts?: { body: FontInfo; heading: FontInfo }, spacing?: string) {
  const root = document.documentElement
  const isDark = root.classList.contains("dark")
  const vars = isDark ? cssVars.dark : cssVars.light
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, val)
  }
  applyFonts(fonts)
  if (spacing) {
    root.style.setProperty("--spacing-base", spacing)
  }
  ;(window as typeof window & { __themeVars?: CssVars }).__themeVars = cssVars
}

const NON_COLOR_KEYS = new Set(["radius"])

function stripNonColor(vars: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(vars).filter(([k]) => !NON_COLOR_KEYS.has(k))
  )
}

function buildLocalTheme(themeName: string): CssVars {
  const base = themesData.baseColors["zinc"] as CssVars
  const overrides = (themesData.colorThemes as Record<string, CssVars>)[themeName]
  const light = stripNonColor({ ...base.light, ...(overrides?.light ?? {}) })
  const dark = stripNonColor({ ...base.dark, ...(overrides?.dark ?? {}) })
  light["accent"] = light["primary"]
  light["accent-foreground"] = light["primary-foreground"]
  dark["accent"] = dark["primary"]
  dark["accent-foreground"] = dark["primary-foreground"]
  return { light, dark }
}

export function ThemeSwitcher({ defaultPreset, showUI = true }: { defaultPreset?: string; showUI?: boolean }) {
  const [open, setOpen] = useState(false)
  const [presetInput, setPresetInput] = useState(defaultPreset ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [activeSpacing, setActiveSpacing] = useState("0.25rem")
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const { type, value, cssVars, fonts, spacing } = JSON.parse(saved) as SavedTheme
        applyTheme(cssVars, fonts, spacing)
        if (type === "preset") setPresetInput(value)
        if (type === "theme") setActive(value)
        if (spacing) setActiveSpacing(spacing)
      } catch {}
      return
    }
    // No saved preference — apply defaultPreset from config
    if (defaultPreset) {
      setPresetInput(defaultPreset)
      fetch(`/api/theme?preset=${encodeURIComponent(defaultPreset)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.cssVars) {
            applyTheme(data.cssVars, data.fonts)
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ type: "preset", value: defaultPreset, cssVars: data.cssVars, fonts: data.fonts })
            )
          }
        })
        .catch(() => {})
    }
  }, [defaultPreset])

  function selectTheme(themeName: string) {
    const cssVars = buildLocalTheme(themeName)
    applyTheme(cssVars)
    setActive(themeName)
    setError(null)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ type: "theme", value: themeName, cssVars })
    )
  }

  function shuffleTheme() {
    const themeName = pick([...COLOR_THEMES])
    const cssVars = buildLocalTheme(themeName)
    const radius = pick(SHUFFLE_RADII)
    cssVars.light["radius"] = radius
    cssVars.dark["radius"] = radius
    const body = pick(SHUFFLE_FONTS)
    const fonts = { body, heading: null as FontInfo }
    const spacing = pick(SPACING_OPTIONS).value
    applyTheme(cssVars, fonts, spacing)
    setActive(themeName)
    setActiveSpacing(spacing)
    setError(null)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ type: "theme", value: themeName, cssVars, fonts, spacing })
    )
  }

  function selectSpacing(value: string) {
    setActiveSpacing(value)
    document.documentElement.style.setProperty("--spacing-base", value)
    // Update localStorage with new spacing
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved) as SavedTheme
        data.spacing = value
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {}
    }
  }

  async function applyPreset() {
    const id = presetInput.trim().replace(/^--preset\s+/, "")
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/theme?preset=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to load preset")
        return
      }
      applyTheme(data.cssVars, data.fonts)
      setActive(null)
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ type: "preset", value: id, cssVars: data.cssVars, fonts: data.fonts })
      )
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    {mounted && (
      <button
        onClick={() => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          setTimeout(() => {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
              try {
                const { cssVars, fonts, spacing } = JSON.parse(saved) as SavedTheme
                applyTheme(cssVars, fonts, spacing)
              } catch {}
            }
          }, 50)
        }}
        className="fixed bottom-6 right-16 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        aria-label="Toggle dark mode"
      >
        {resolvedTheme === "dark" ? <Sun size={24} /> : <Moon size={24} />}
      </button>
    )}
    {showUI && <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="fixed bottom-6 right-6 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          aria-label="Customize theme"
        >
          <Palette size={24} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-5" align="end" side="top">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Theme</p>
          <button
            onClick={shuffleTheme}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Shuffle theme"
            title="Shuffle"
          >
            <Shuffle size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-5">
          {COLOR_THEMES.map((name) => {
            const primary =
              (themesData.colorThemes as Record<string, CssVars>)[name as string]?.light
                ?.primary ?? "oklch(0.5 0.1 0)"
            return (
              <button
                key={name}
                title={name}
                onClick={() => selectTheme(name as string)}
                className={`h-8 w-8 rounded-full border-2 transition-all ${
                  active === name
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: primary }}
              />
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground mb-1.5">Spacing</p>
        <div className="grid grid-cols-4 gap-1.5 mb-5">
          {SPACING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectSpacing(opt.value)}
              className={`h-7 rounded-md text-xs transition-all ${
                activeSpacing === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mb-1.5">
          Preset ID from{" "}
          <span className="font-mono">ui.shadcn.com/create</span>
        </p>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={presetInput}
            onChange={(e) => setPresetInput(e.target.value)}
            placeholder="b5Jh0TSJ6 or --preset b5Jh0TSJ6"
            className="h-8 text-xs font-mono"
            onKeyDown={(e) => e.key === "Enter" && applyPreset()}
          />
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={applyPreset}
            disabled={loading || !presetInput.trim()}
          >
            {loading ? "…" : "Apply"}
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1.5">{error}</p>
        )}
      </PopoverContent>
    </Popover>}
    </>
  )
}
