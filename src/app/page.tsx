"use client"

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useAppStore } from "@/lib/store"
import { DashboardView } from "@/components/dashboard-view"
import { MergeTool } from "@/components/tools/merge-tool"
import { ConvertTool } from "@/components/tools/convert-tool"
import { DuplicatesTool } from "@/components/tools/duplicates-tool"
import { AttendanceTool } from "@/components/tools/attendance-tool"
import { DownloadExcelTool } from "@/components/tools/download-excel-tool"
import { DownloadImagesTool } from "@/components/tools/download-images-tool"
import { SettingsView } from "@/components/settings-view"
import { AboutView } from "@/components/about-view"
import { Separator } from "@/components/ui/separator"

export default function Home() {
  const { currentView } = useAppStore()

  const renderView = () => {
    switch (currentView) {
      case "dashboard": return <DashboardView />
      case "merge": return <MergeTool />
      case "convert": return <ConvertTool />
      case "duplicates": return <DuplicatesTool />
      case "attendance": return <AttendanceTool />
      case "download-excel": return <DownloadExcelTool />
      case "download-images": return <DownloadImagesTool />
      case "settings": return <SettingsView />
      case "about": return <AboutView />
      default: return <DashboardView />
    }
  }

  const getTitle = () => {
    switch (currentView) {
      case "dashboard": return "Dashboard"
      case "merge": return "Merge Files"
      case "convert": return "CSV ⇄ Excel Converter"
      case "duplicates": return "Remove Duplicates"
      case "attendance": return "Attendance Checker"
      case "download-excel": return "Download Excel from URL"
      case "download-images": return "Download Images into Excel"
      case "settings": return "Settings"
      case "about": return "About"
      default: return "Dashboard"
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b border-border/50 px-4 lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-base font-semibold">{getTitle()}</h1>
        </header>
        <div className="flex-1 p-4 lg:p-6">
          {renderView()}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
