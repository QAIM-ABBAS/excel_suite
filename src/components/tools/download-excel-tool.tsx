"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Download, Loader2, CheckCircle2, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface DownloadResult {
  downloadUrl: string
  filename: string
  size: number
}

export function DownloadExcelTool() {
  const [url, setUrl] = useState("")
  const [filename, setFilename] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<DownloadResult | null>(null)

  const handleDownload = async () => {
    if (!url) {
      toast.error("Please enter a URL")
      return
    }

    setIsProcessing(true)
    setProgress(10)
    setResult(null)

    try {
      // Simulate progress while downloading
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 80))
      }, 500)

      const response = await fetch("/api/tools/download-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename: filename || undefined }),
      })

      clearInterval(progressInterval)
      setProgress(90)

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Download failed")

      setProgress(100)
      setResult(data)
      toast.success("File downloaded successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed")
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Download Excel from URL</CardTitle>
              <CardDescription>Download spreadsheet files from the web</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">File URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/data.xlsx"
                  className="h-9 pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filename">Custom Filename (optional)</Label>
            <Input
              id="filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="my-data"
              className="h-9"
            />
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Downloading file...</p>
            </div>
          )}

          <Button onClick={handleDownload} disabled={isProcessing || !url} className="w-full">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download File
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-violet-500" />
                  <CardTitle className="text-base">Download Complete</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Filename</p>
                    <p className="text-sm font-medium truncate">{result.filename}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Size</p>
                    <p className="text-sm font-medium">{(result.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <a href={result.downloadUrl} download>
                    <Download className="mr-2 h-4 w-4" />
                    Save to Device
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
