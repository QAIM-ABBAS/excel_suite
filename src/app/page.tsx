"use client"

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { useAppStore } from "@/lib/store"
import { DashboardView } from "@/components/dashboard-view"
import { MergeTool } from "@/components/tools/merge-tool"
import { ConvertTool } from "@/components/tools/convert-tool"
import { DuplicatesTool } from "@/components/tools/duplicates-tool"
import { SortTool } from "@/components/tools/sort-tool"
import { AttendanceTool } from "@/components/tools/attendance-tool"
import { DownloadExcelTool } from "@/components/tools/download-excel-tool"
import { DownloadImagesTool } from "@/components/tools/download-images-tool"
import { SettingsView } from "@/components/settings-view"
import { AboutView } from "@/components/about-view"
import { Separator } from "@/components/ui/separator"
import { GitMerge, ArrowLeftRight, CopyX, UserCheck, Download, ImageDown, LayoutDashboard, Settings, Info, ArrowUpDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { ToolView } from "@/lib/store"

const viewMeta: Record<ToolView, { title: string; description: string; icon: typeof LayoutDashboard }> = {
  dashboard: { title: "Dashboard", description: "Overview and quick access to tools", icon: LayoutDashboard },
  merge: { title: "Merge Files", description: "Combine multiple files into one", icon: GitMerge },
  convert: { title: "CSV ⇄ Excel Converter", description: "Convert between formats", icon: ArrowLeftRight },
  duplicates: { title: "Remove Duplicates", description: "Clean duplicate rows", icon: CopyX },
  sort: { title: "Data Sorter", description: "Sort data by column", icon: ArrowUpDown },
  attendance: { title: "Attendance Checker", description: "Check student attendance", icon: UserCheck },
  "download-excel": { title: "Download Excel from URL", description: "Fetch files from the web", icon: Download },
  "download-images": { title: "Download Images into Excel", description: "Embed images into spreadsheets", icon: ImageDown },
  settings: { title: "Settings", description: "Preferences and history", icon: Settings },
  about: { title: "About", description: "About Excel Suite", icon: Info },
}

export default function Home() {
  const { currentView } = useAppStore()
  const meta = viewMeta[currentView] || viewMeta.dashboard

  const renderView = () => {
    switch (currentView) {
      case "dashboard": return <DashboardView />
      case "merge": return <MergeTool />
      case "convert": return <ConvertTool />
      case "duplicates": return <DuplicatesTool />
      case "sort": return <SortTool />
      case "attendance": return <AttendanceTool />
      case "download-excel": return <DownloadExcelTool />
      case "download-images": return <DownloadImagesTool />
      case "settings": return <SettingsView />
      case "about": return <AboutView />
      default: return <DashboardView />
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 backdrop-blur-md px-4 lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2 min-w-0">
            <meta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold truncate">{meta.title}</h1>
              <Separator orientation="vertical" className="hidden sm:block h-4" />
              <span className="hidden sm:block text-xs text-muted-foreground truncate">{meta.description}</span>
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  )
}
