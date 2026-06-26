"use client"

import { useAppStore, type ToolView } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GitMerge, ArrowLeftRight, CopyX, UserCheck, Download, ImageDown, FileSpreadsheet, Clock, ArrowRight } from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"

const tools = [
  {
    id: "merge" as ToolView,
    title: "Merge Files",
    description: "Combine multiple Excel or CSV files into one",
    icon: GitMerge,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    id: "convert" as ToolView,
    title: "CSV ⇄ Excel",
    description: "Convert between CSV and Excel formats",
    icon: ArrowLeftRight,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    id: "duplicates" as ToolView,
    title: "Remove Duplicates",
    description: "Find and remove duplicate rows from your data",
    icon: CopyX,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
  {
    id: "attendance" as ToolView,
    title: "Attendance Checker",
    description: "Calculate attendance statistics from spreadsheets",
    icon: UserCheck,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
  },
  {
    id: "download-excel" as ToolView,
    title: "Download Excel",
    description: "Download Excel files from a URL",
    icon: Download,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    id: "download-images" as ToolView,
    title: "Download Images",
    description: "Embed images into Excel from URLs",
    icon: ImageDown,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

interface FileRecord {
  id: string
  filename: string
  originalName: string
  tool: string
  status: string
  createdAt: string
}

const toolLabelMap: Record<string, string> = {
  merge: "Merge",
  convert: "Convert",
  duplicates: "Duplicates",
  attendance: "Attendance",
  "download-excel": "Download",
  "download-images": "Images",
}

const toolColorMap: Record<string, string> = {
  merge: "bg-emerald-500/10 text-emerald-500",
  convert: "bg-amber-500/10 text-amber-500",
  duplicates: "bg-rose-500/10 text-rose-500",
  attendance: "bg-sky-500/10 text-sky-500",
  "download-excel": "bg-violet-500/10 text-violet-500",
  "download-images": "bg-pink-500/10 text-pink-500",
}

export function DashboardView() {
  const { setCurrentView } = useAppStore()
  const [recentFiles, setRecentFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/tools/history")
      .then(res => res.json())
      .then(data => {
        if (data.success) setRecentFiles(data.records.slice(0, 5))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to Excel Suite</h2>
        <p className="text-muted-foreground">Select a tool to get started</p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {tools.map((tool) => (
          <motion.div key={tool.id} variants={item}>
            <Card
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-primary/20 group"
              onClick={() => setCurrentView(tool.id)}
            >
              <CardHeader className="pb-3">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tool.bg} ${tool.color} group-hover:scale-110 transition-transform`}>
                  <tool.icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base">{tool.title}</CardTitle>
                <CardDescription className="mt-1">{tool.description}</CardDescription>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Files Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Recent Files</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView("settings")} className="text-xs">
            View All <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-lg border border-border/50 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : recentFiles.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-6 text-center">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">
              No recent files. Start using a tool to see your history here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentFiles.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3 hover:bg-muted/30 transition-colors"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toolColorMap[file.tool] || "bg-muted text-muted-foreground"}`}>
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.originalName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {toolLabelMap[file.tool] || file.tool}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{formatDate(file.createdAt)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border-emerald-500/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-emerald-500 font-medium">Files Processed</p>
            <p className="text-2xl font-bold mt-1">{recentFiles.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-sky-500/5 to-sky-500/0 border-sky-500/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-sky-500 font-medium">Tools Available</p>
            <p className="text-2xl font-bold mt-1">6</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/5 to-violet-500/0 border-violet-500/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-violet-500 font-medium">Max File Size</p>
            <p className="text-2xl font-bold mt-1">50 MB</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
