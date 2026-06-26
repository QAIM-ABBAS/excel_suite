"use client"

import { useAppStore, type ToolView } from "@/lib/store"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import {
  LayoutDashboard, GitMerge, ArrowLeftRight, CopyX,
  UserCheck, Download, ImageDown, Settings, Info,
  Sun, Moon, FileSpreadsheet, ArrowUpDown
} from "lucide-react"

const mainNav = [
  { id: "dashboard" as ToolView, label: "Dashboard", icon: LayoutDashboard },
]

const toolNav = [
  { id: "merge" as ToolView, label: "Merge Files", icon: GitMerge },
  { id: "convert" as ToolView, label: "CSV ⇄ Excel", icon: ArrowLeftRight },
  { id: "duplicates" as ToolView, label: "Remove Duplicates", icon: CopyX },
  { id: "sort" as ToolView, label: "Data Sorter", icon: ArrowUpDown },
  { id: "attendance" as ToolView, label: "Attendance Checker", icon: UserCheck },
  { id: "download-excel" as ToolView, label: "Download Excel", icon: Download },
  { id: "download-images" as ToolView, label: "Download Images", icon: ImageDown },
]

const bottomNav = [
  { id: "settings" as ToolView, label: "Settings", icon: Settings },
  { id: "about" as ToolView, label: "About", icon: Info },
]

// Track whether the component has mounted on the client (avoids hydration mismatch with theme)
const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot
    () => false  // server snapshot
  )
}

export function AppSidebar() {
  const { currentView, setCurrentView } = useAppStore()
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  const isDark = mounted ? (theme === "dark" || (!theme && true)) : true

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border/50 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold">Excel Suite</span>
            <span className="text-[10px] text-muted-foreground">Automation Tools</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={currentView === item.id}
                    onClick={() => setCurrentView(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolNav.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={currentView === item.id}
                    onClick={() => setCurrentView(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50">
        <SidebarMenu>
          {bottomNav.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={currentView === item.id}
                onClick={() => setCurrentView(item.id)}
                tooltip={item.label}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(isDark ? "light" : "dark")}
              tooltip="Toggle Theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
