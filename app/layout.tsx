import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "StratSquad · 多智能体游戏策略小组",
  description: "Agentic workflow for game industry strategy briefs (orchestrator + sub-agents + judge)",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans" className="dark">
      <body className="font-sans antialiased bg-canvas text-ink-primary">{children}</body>
    </html>
  )
}
