"use client"

import { useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { ImageDown, Download, CheckCircle2, Loader2, AlertTriangle } from "lucide-react"
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
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImagesResult | null>(null)

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

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
              <ImageDown className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Download Images into Excel</CardTitle>
              <CardDescription>Embed images from URLs into your spreadsheet</CardDescription>
            </div>
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
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
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
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                    <p className="text-lg font-semibold">{result.totalRows}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <p className="text-xs text-muted-foreground">Success</p>
                    <p className="text-lg font-semibold text-emerald-500">{result.successCount}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className="text-lg font-semibold text-rose-500">{result.failCount}</p>
                  </div>
                </div>

                {result.failCount > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      {result.failCount} image(s) failed to download. The corresponding rows have been preserved with original URLs.
                    </p>
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
