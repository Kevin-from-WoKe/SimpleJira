import { ThemeSwitcher } from "@/components/theme-switcher"
import { LoginForm } from "@/components/login-form"
import config from "@/basecn.config"

export default function Page() {
  return (
    <>
      <LoginForm />
      <ThemeSwitcher defaultPreset={config.defaultPreset} showUI={config.showThemeSwitcher} />
    </>
  )
}
