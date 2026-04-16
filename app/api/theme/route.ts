import { NextRequest, NextResponse } from "next/server"
import themesData from "@/lib/themes-data.json"

const RADII: Record<string, string> = {
  default: "0.625rem",
  none: "0",
  small: "0.45rem",
  medium: "0.625rem",
  large: "0.875rem",
}

const FONTS: Record<string, { family: string; googleImport: string }> = {
  geist: { family: "'Geist Variable', sans-serif", googleImport: "Geist" },
  inter: { family: "'Inter Variable', sans-serif", googleImport: "Inter" },
  "noto-sans": { family: "'Noto Sans Variable', sans-serif", googleImport: "Noto_Sans" },
  "nunito-sans": { family: "'Nunito Sans Variable', sans-serif", googleImport: "Nunito_Sans" },
  figtree: { family: "'Figtree Variable', sans-serif", googleImport: "Figtree" },
  roboto: { family: "'Roboto Variable', sans-serif", googleImport: "Roboto" },
  raleway: { family: "'Raleway Variable', sans-serif", googleImport: "Raleway" },
  "dm-sans": { family: "'DM Sans Variable', sans-serif", googleImport: "DM_Sans" },
  "public-sans": { family: "'Public Sans Variable', sans-serif", googleImport: "Public_Sans" },
  outfit: { family: "'Outfit Variable', sans-serif", googleImport: "Outfit" },
  oxanium: { family: "'Oxanium Variable', sans-serif", googleImport: "Oxanium" },
  manrope: { family: "'Manrope Variable', sans-serif", googleImport: "Manrope" },
  "space-grotesk": { family: "'Space Grotesk Variable', sans-serif", googleImport: "Space_Grotesk" },
  montserrat: { family: "'Montserrat Variable', sans-serif", googleImport: "Montserrat" },
  "ibm-plex-sans": { family: "'IBM Plex Sans Variable', sans-serif", googleImport: "IBM_Plex_Sans" },
  "source-sans-3": { family: "'Source Sans 3 Variable', sans-serif", googleImport: "Source_Sans_3" },
  "instrument-sans": { family: "'Instrument Sans Variable', sans-serif", googleImport: "Instrument_Sans" },
  "jetbrains-mono": { family: "'JetBrains Mono Variable', monospace", googleImport: "JetBrains_Mono" },
  "geist-mono": { family: "'Geist Mono Variable', monospace", googleImport: "Geist_Mono" },
  lora: { family: "'Lora Variable', serif", googleImport: "Lora" },
  merriweather: { family: "'Merriweather', serif", googleImport: "Merriweather" },
  "playfair-display": { family: "'Playfair Display Variable', serif", googleImport: "Playfair_Display" },
  "noto-serif": { family: "'Noto Serif Variable', serif", googleImport: "Noto_Serif" },
  "roboto-slab": { family: "'Roboto Slab Variable', serif", googleImport: "Roboto_Slab" },
}

async function decodePresetId(presetId: string) {
  try {
    const mod = await import("shadcn/preset")
    return mod.decodePreset(presetId)
  } catch {
    return null
  }
}

type ThemesData = {
  baseColors: Record<string, { light: Record<string, string>; dark: Record<string, string> }>
  colorThemes: Record<string, { light: Record<string, string>; dark: Record<string, string> }>
}

const data = themesData as ThemesData

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const presetId = searchParams.get("preset")

  if (!presetId) {
    return NextResponse.json({ error: "Missing preset param" }, { status: 400 })
  }

  const decoded = await decodePresetId(presetId)
  if (!decoded) {
    return NextResponse.json({ error: "Invalid preset ID" }, { status: 400 })
  }

  const d = decoded as Record<string, string>
  const base = data.baseColors[d.baseColor] ?? data.baseColors["zinc"]
  const themeOverrides = data.colorThemes[d.theme] ?? null

  const light = { ...base.light, ...(themeOverrides?.light ?? {}) }
  const dark = { ...base.dark, ...(themeOverrides?.dark ?? {}) }

  if (d.menuAccent === "bold") {
    light["accent"] = light["primary"]
    light["accent-foreground"] = light["primary-foreground"]
    dark["accent"] = dark["primary"]
    dark["accent-foreground"] = dark["primary-foreground"]
  }

  // Apply radius
  const radiusValue = RADII[d.radius] ?? RADII["default"]
  light["radius"] = radiusValue
  dark["radius"] = radiusValue

  // Font info
  const bodyFont = FONTS[d.font] ?? null
  const headingFont = d.fontHeading === "inherit" ? null : (FONTS[d.fontHeading] ?? null)

  return NextResponse.json({
    decoded,
    cssVars: { light, dark },
    fonts: {
      body: bodyFont,
      heading: headingFont,
    },
  })
}
