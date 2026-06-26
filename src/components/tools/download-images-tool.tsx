"use client"

import { useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { ImageDown, Download, CheckCircle2, Loader2, AlertTriangle, RotateCcw, Image as ImageIcon, XCircle } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface ImagesResult {
  downloadUrl: string
  filename: string
  totalRows: number
  successCount: number
  failCount: number
  results: { row: number; url: string; status: string; error?: string }[]
}

export function DownloadImagesTool() {
  const [file, setFile] = useState<File | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [selectedColumn, setSelectedColumn] = useState("")
  const [maxImageSize, setMaxImageSize] = useState("200")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImagesResult | null>(null)
  const [viewMode, setViewMode] = useState<"all" | "success" | "failed">("all")

  const handleFileSelected = async (files: File[]) => {
    const selected = files[0]
    setFile(selected)
    setResult(null)
    setIsLoadingColumns(true)

    try {
      const formData = new FormData()
      formData.append("file", selected)

      const response = await fetch("/api/tools/columns", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()
      if (data.success && data.sheets.length > 0) {
        setColumns(data.sheets[0].columns)
        setSelectedColumn(data.sheets[0].columns[0] || "")
      }
    } catch {
      toast.error("Failed to read file columns")
    } finally {
      setIsLoadingColumns(false)
    }
  }

  const handleProcess = async () => {
    if (!file || !selectedColumn) {
      toast.error("Please select a file and URL column")
      return
    }

    setIsProcessing(true)
    setProgress(10)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("urlColumn", selectedColumn)

      // Simulate progress during download
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 3, 85))
      }, 1000)

      const response = await fetch("/api/tools/download-images", {
        method: "POST",
        body: formData,
      })

      clearInterval(progressInterval)
      setProgress(90)

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Failed to process images")

      setProgress(100)
      setResult(data)
      toast.success(`Processed ${data.successCount} images successfully!`)
      if (data.failCount > 0) {
        toast.warning(`${data.failCount} images failed to download`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process images")
    } finally {
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const resetTool = () => {
    setFile(null)
    setColumns([])
    setSelectedColumn("")
    setResult(null)
  }

  const filteredResults = result?.results.filter(r => {
    if (viewMode === "success") return r.status === "success"
    if (viewMode === "failed") return r.status === "failed"
    return true
  }) || []

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
                <ImageDown className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Download Images into Excel</CardTitle>
                <CardDescription>Embed images from URLs into your spreadsheet</CardDescription>
              </div>
            </div>
            {file && (
              <Button variant="ghost" size="sm" onClick={resetTool} className="h-7 text-xs">
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone multiple={false} onFilesSelected={handleFileSelected} />

          {isLoadingColumns && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading file columns...
            </div>
          )}

          {columns.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="space-y-2">
                <Label>Select Image URL Column</Label>
                <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select column containing image URLs" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-3">
                <p className="text-xs text-pink-600 dark:text-pink-400">
                  <strong>How it works:</strong> The tool will iterate through each row, download the image from the URL in the selected column, and mark successful downloads. Supported formats: JPG, PNG, WEBP.
                </p>
              </div>
            </motion.div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Downloading images and processing...</p>
            </div>
          )}

          <Button onClick={handleProcess} disabled={isProcessing || !file || !selectedColumn} className="w-full">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Images...
              </>
            ) : (
              <>
                <ImageDown className="mr-2 h-4 w-4" />
                Process Images
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className="border-pink-500/20 bg-pink-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-pink-500" />
                  <CardTitle className="text-base">Images Processed</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <ImageIcon className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Total Rows</p>
                    </div>
                    <p className="text-lg font-semibold">{result.totalRows}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      <p className="text-xs text-muted-foreground">Success</p>
                    </div>
                    <p className="text-lg font-semibold text-emerald-500">{result.successCount}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <XCircle className="h-3 w-3 text-rose-500" />
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                    <p className="text-lg font-semibold text-rose-500">{result.failCount}</p>
                  </div>
                </div>

                {result.failCount > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      {result.failCount} image(s) failed to download. The corresponding rows have been preserved with original URLs.
                    </p>
                  </div>
                )}

                {/* Results table with filter */}
                {result.results.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                      <button
                        onClick={() => setViewMode("all")}
                        className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                          viewMode === "all" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        All ({result.results.length})
                      </button>
                      <button
                        onClick={() => setViewMode("success")}
                        className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                          viewMode === "success" ? "bg-background shadow-sm text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Success ({result.successCount})
                      </button>
                      <button
                        onClick={() => setViewMode("failed")}
                        className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                          viewMode === "failed" ? "bg-background shadow-sm text-rose-600 dark:text-rose-400" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Failed ({result.failCount})
                      </button>
                    </div>
                    <div className="max-h-60 overflow-auto rounded-lg border border-border/50 bg-muted/30">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border/50">
                            <th className="text-left px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Row</th>
                            <th className="text-left px-2 py-1.5 text-[10px] text-muted-foreground font-medium">URL</th>
                            <th className="text-left px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResults.slice(0, 50).map((r, i) => (
                            <tr key={i} className="border-b border-border/30">
                              <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{r.row}</td>
                              <td className="px-2 py-1.5 truncate max-w-[200px]" title={r.url}>{r.url}</td>
                              <td className="px-2 py-1.5">
                                {r.status === "success" ? (
                                  <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    Success
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[9px] bg-rose-500/10 text-rose-600 dark:text-rose-400" title={r.error}>
                                    Failed
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <Button asChild className="w-full">
                  <a href={result.downloadUrl} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download Excel with Images
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
