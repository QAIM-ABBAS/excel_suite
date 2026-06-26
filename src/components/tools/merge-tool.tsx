"use client"

import { useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { GitMerge, Download, Trash2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface MergeResult {
  downloadUrl: string
  filename: string
  totalRows: number
  headers: string[]
  hasMismatch: boolean
  mismatchWarning?: string
}

function FileSpreadsheetIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M8 13h2"/>
      <path d="M14 13h2"/>
      <path d="M8 17h2"/>
      <path d="M14 17h2"/>
    </svg>
  )
}

export function MergeTool() {
  const [files, setFiles] = useState<File[]>([])
  const [outputFormat, setOutputFormat] = useState("xlsx")
  const [outputFilename, setOutputFilename] = useState("merged")
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<MergeResult | null>(null)

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles])
    setResult(null)
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setResult(null)
  }

  const handleMerge = async () => {
    if (files.length < 2) {
      toast.error("Please upload at least 2 files to merge")
      return
    }

    setIsProcessing(true)
    setProgress(10)

    try {
      const formData = new FormData()
      files.forEach(file => formData.append("files", file))
      formData.append("outputFormat", outputFormat)
      formData.append("outputFilename", outputFilename)

      setProgress(40)

      const response = await fetch("/api/tools/merge", {
        method: "POST",
        body: formData,
      })

      setProgress(80)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Merge failed")
      }

      setProgress(100)
      setResult(data)
      toast.success(`Merged ${files.length} files successfully! ${data.totalRows} total rows.`)

      if (data.hasMismatch) {
        toast.warning("Headers differ between files - data was merged using all columns")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed")
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <GitMerge className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Merge Excel / CSV Files</CardTitle>
              <CardDescription>Combine multiple files into one</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            multiple
            onFilesSelected={handleFilesSelected}
            label="Drop Excel or CSV files here"
            description="Upload 2 or more files to merge"
          />

          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <Label className="text-sm font-medium">Uploaded Files ({files.length})</Label>
                {files.map((file, index) => (
                  <motion.div
                    key={`${file.name}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <FileSpreadsheetIcon />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {(file.size / 1024).toFixed(1)} KB
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(index)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Output Format</Label>
              <RadioGroup value={outputFormat} onValueChange={setOutputFormat} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="xlsx" id="xlsx" />
                  <Label htmlFor="xlsx" className="text-sm">Excel (.xlsx)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="csv" id="csv" />
                  <Label htmlFor="csv" className="text-sm">CSV (.csv)</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filename">Output Filename</Label>
              <Input
                id="filename"
                value={outputFilename}
                onChange={(e) => setOutputFilename(e.target.value)}
                placeholder="merged"
                className="h-9"
              />
            </div>
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Processing...</p>
            </div>
          )}

          <Button
            onClick={handleMerge}
            disabled={isProcessing || files.length < 2}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge {files.length} Files
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <CardTitle className="text-base">Merge Complete</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.hasMismatch && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">{result.mismatchWarning}</p>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                    <p className="text-lg font-semibold">{result.totalRows}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Columns</p>
                    <p className="text-lg font-semibold">{result.headers.length}</p>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <a href={result.downloadUrl} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download Merged File
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
