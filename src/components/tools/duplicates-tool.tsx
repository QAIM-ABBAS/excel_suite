"use client"

import { useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { CopyX, Download, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface DuplicatesResult {
  downloadUrl: string
  filename: string
  totalRows: number
  duplicateRows: number
  remainingRows: number
  preview: {
    deleted: Record<string, unknown>[]
    remaining: Record<string, unknown>[]
  }
}

export function DuplicatesTool() {
  const [file, setFile] = useState<File | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [selectedColumn, setSelectedColumn] = useState("")
  const [keepOccurrence, setKeepOccurrence] = useState("first")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<DuplicatesResult | null>(null)
  const [preview, setPreview] = useState<Record<string, unknown>[]>([])

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
        setPreview(data.preview || [])
      }
    } catch {
      toast.error("Failed to read file columns")
    } finally {
      setIsLoadingColumns(false)
    }
  }

  const handleRemoveDuplicates = async () => {
    if (!file || !selectedColumn) {
      toast.error("Please select a file and column")
      return
    }

    setIsProcessing(true)
    setProgress(20)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("column", selectedColumn)
      formData.append("keepOccurrence", keepOccurrence)

      setProgress(50)

      const response = await fetch("/api/tools/duplicates", {
        method: "POST",
        body: formData,
      })

      setProgress(80)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Failed to remove duplicates")

      setProgress(100)
      setResult(data)
      toast.success(`Removed ${data.duplicateRows} duplicate rows!`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove duplicates")
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
              <CopyX className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Remove Duplicates</CardTitle>
              <CardDescription>Find and remove duplicate rows from your data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            multiple={false}
            onFilesSelected={handleFileSelected}
            label="Drop an Excel or CSV file here"
          />

          {isLoadingColumns && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading file columns...
            </div>
          )}

          {columns.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="space-y-2">
                <Label>Select Column to Check Duplicates</Label>
                <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Keep Occurrence</Label>
                <RadioGroup value={keepOccurrence} onValueChange={setKeepOccurrence} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="first" id="keep-first" />
                    <Label htmlFor="keep-first" className="text-sm">First</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="last" id="keep-last" />
                    <Label htmlFor="keep-last" className="text-sm">Last</Label>
                  </div>
                </RadioGroup>
              </div>

              {preview.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Data Preview</Label>
                  <div className="max-h-48 overflow-auto rounded-lg border border-border/50 bg-muted/30 p-2">
                    <div className="space-y-1">
                      {preview.slice(0, 5).map((row, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          {Object.entries(row).slice(0, 4).map(([key, val]) => (
                            <span key={key} className="truncate">
                              <span className="text-muted-foreground">{key}:</span> {String(val)}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Removing duplicates...</p>
            </div>
          )}

          <Button onClick={handleRemoveDuplicates} disabled={isProcessing || !file || !selectedColumn} className="w-full">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CopyX className="mr-2 h-4 w-4" />
                Remove Duplicates
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className="border-rose-500/20 bg-rose-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-rose-500" />
                  <CardTitle className="text-base">Duplicates Removed</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                    <p className="text-lg font-semibold">{result.totalRows}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Duplicates</p>
                    <p className="text-lg font-semibold text-rose-500">{result.duplicateRows}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-lg font-semibold text-emerald-500">{result.remainingRows}</p>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <a href={result.downloadUrl} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download Cleaned File
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
