# basecn — New Project Setup

Duplicate this folder, then follow the checklist below.

## Checklist

### 1. `basecn.config.ts`
- [ ] `name` — app/brand name shown on the login card
- [ ] `tagline` — subtitle shown below the name
- [ ] `defaultPreset` — paste your preset ID from ui.shadcn.com/create (controls colors, font, radius)
- [ ] `showThemeSwitcher` — set to `false` for production builds

### 2. Favicon
Replace `app/favicon.ico` with your own.

### 3. Project name
Update `name` in `package.json`.

### 4. Install & run
```bash
npm install
npm run dev
```

---

Generated preset IDs can be copied directly from:
`npx shadcn@latest init --preset YOUR_ID --template next`
or from the URL at ui.shadcn.com/create after customising.
