"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "next-themes"
import { FileSpreadsheet, Clock, AlertTriangle, Trash2, Download, Loader2 } from "lucide-react"
import { useSyncExternalStore, useEffect, useState } from "react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface FileRecord {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  tool: string
  status: string
  createdAt: string
}

interface ErrorLogItem {
  id: string
  tool: string
  message: string
  details: string | null
  createdAt: string
}

const toolLabelMap: Record<string, string> = {
  merge: "Merge",
  convert: "Convert",
  duplicates: "Duplicates",
  sort: "Sort",
  filter: "Filter",
  stats: "Stats",
  attendance: "Attendance",
  "download-excel": "Download",
  "download-images": "Images",
}

const toolColorMap: Record<string, string> = {
  merge: "bg-emerald-500/10 text-emerald-500",
  convert: "bg-amber-500/10 text-amber-500",
  duplicates: "bg-rose-500/10 text-rose-500",
  sort: "bg-cyan-500/10 text-cyan-500",
  filter: "bg-orange-500/10 text-orange-500",
  stats: "bg-indigo-500/10 text-indigo-500",
  attendance: "bg-sky-500/10 text-sky-500",
  "download-excel": "bg-violet-500/10 text-violet-500",
  "download-images": "bg-pink-500/10 text-pink-500",
}

const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const [fileHistory, setFileHistory] = useState<FileRecord[]>([])
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingErrors, setLoadingErrors] = useState(true)
  const [activeTab, setActiveTab] = useState<"appearance" | "history" | "errors">("appearance")

  useEffect(() => {
    fetchFileHistory()
    fetchErrorLogs()
  }, [])

  const fetchFileHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch("/api/tools/history")
      const data = await res.json()
      if (data.success) setFileHistory(data.records)
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false)
    }
  }

  const fetchErrorLogs = async () => {
    setLoadingErrors(true)
    try {
      const res = await fetch("/api/tools/errors")
      const data = await res.json()
      if (data.success) setErrorLogs(data.records)
    } catch {
      // ignore
    } finally {
      setLoadingErrors(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleDeleteRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/tools/history?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        toast.success("Record deleted")
        fetchFileHistory()
      } else {
        toast.error(data.error || "Failed to delete record")
      }
    } catch {
      toast.error("Failed to delete record")
    }
  }

  const handleClearAll = async () => {
    if (fileHistory.length === 0) return
    if (!confirm(`Delete all ${fileHistory.length} file records? This cannot be undone.`)) return
    try {
      const res = await fetch("/api/tools/history", { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message || "All records cleared")
        setFileHistory([])
      } else {
        toast.error(data.error || "Failed to clear history")
      }
    } catch {
      toast.error("Failed to clear history")
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Tab Navigation - sticky below the main header (h-14 = 56px) */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1 max-w-3xl">
          {(["appearance", "history", "errors"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "appearance" ? "Appearance" : tab === "history" ? "File History" : "Error Logs"}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "appearance" && (
          <motion.div
            key="appearance"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize the look and feel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="dark-mode">Dark Mode</Label>
                    <p className="text-xs text-muted-foreground">Toggle between light and dark theme</p>
                  </div>
                  <Switch
                    id="dark-mode"
                    checked={mounted ? theme === "dark" : true}
                    onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Animations</Label>
                    <p className="text-xs text-muted-foreground">Smooth transitions and effects</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>File Handling</CardTitle>
                <CardDescription>Configure file processing options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Maximum file size</span>
                  <Badge variant="secondary">50 MB</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Supported formats</span>
                  <div className="flex gap-1">
                    <Badge variant="secondary">.xlsx</Badge>
                    <Badge variant="secondary">.xls</Badge>
                    <Badge variant="secondary">.csv</Badge>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Auto-delete processed files</span>
                  <Badge variant="secondary">After 24h</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>File History</CardTitle>
                    <CardDescription>
                      {fileHistory.length > 0
                        ? `${fileHistory.length} ${fileHistory.length === 1 ? "record" : "records"}`
                        : "Recent file processing activity"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {fileHistory.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleClearAll} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Clear All
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={fetchFileHistory}>
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fileHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No files processed yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                    {fileHistory.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors group"
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
                            <Badge variant={file.status === "completed" ? "default" : "destructive"} className="text-[10px] h-4">
                              {file.status}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{formatSize(file.size)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {file.status === "completed" && (
                            <a
                              href={`/api/tools/download?file=${encodeURIComponent(file.filename)}`}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                              title="Download file"
                            >
                              <Download className="h-3 w-3" />
                            </a>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRecord(file.id)}
                            title="Delete record"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "errors" && (
          <motion.div
            key="errors"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Error Logs</CardTitle>
                    <CardDescription>View and troubleshoot processing errors</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchErrorLogs}>
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingErrors ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : errorLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No errors recorded</p>
                    <p className="text-xs text-muted-foreground mt-1">Everything is running smoothly!</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {errorLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          <Badge variant="destructive" className="text-[10px] h-4">
                            {toolLabelMap[log.tool] || log.tool}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-destructive">{log.message}</p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{log.details}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
