"use client"

import { useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { ArrowLeftRight, Download, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface ConvertResult {
  downloadUrl: string
  filename: string
  sheets: string[]
}

export function ConvertTool() {
  const [file, setFile] = useState<File | null>(null)
  const [targetFormat, setTargetFormat] = useState("xlsx")
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ConvertResult | null>(null)

  const handleFileSelected = async (files: File[]) => {
    const selected = files[0]
    setFile(selected)
    setResult(null)

    // Get sheet names
    try {
      const formData = new FormData()
      formData.append("file", selected)

      const response = await fetch("/api/tools/columns", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()
      if (data.success) {
        setSheets(data.sheets.map((s: { name: string }) => s.name))
        setSelectedSheet(data.sheets[0]?.name || "")
      }
    } catch {
      // Ignore - sheet selection is optional
    }
  }

  const handleConvert = async () => {
    if (!file) {
      toast.error("Please upload a file first")
      return
    }

    setIsProcessing(true)
    setProgress(20)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("targetFormat", targetFormat)
      if (selectedSheet) formData.append("sheetName", selectedSheet)

      setProgress(50)

      const response = await fetch("/api/tools/convert", {
        method: "POST",
        body: formData,
      })

      setProgress(80)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Conversion failed")

      setProgress(100)
      setResult(data)
      toast.success("File converted successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conversion failed")
    } finally {
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const detectedFormat = file?.name.endsWith(".csv") ? "CSV" : "Excel"
  const canConvert = targetFormat === "xlsx" ? "CSV → Excel" : "Excel → CSV"

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">CSV ⇄ Excel Converter</CardTitle>
              <CardDescription>Convert between CSV and Excel formats</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            multiple={false}
            onFilesSelected={handleFileSelected}
            label="Drop an Excel or CSV file here"
            description="Supports .xlsx, .xls, and .csv files"
          />

          {file && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{detectedFormat} format • {(file.size / 1024).toFixed(1)} KB</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Convert To</Label>
            <RadioGroup value={targetFormat} onValueChange={setTargetFormat} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="xlsx" id="to-xlsx" />
                <Label htmlFor="to-xlsx" className="text-sm">Excel (.xlsx)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="to-csv" />
                <Label htmlFor="to-csv" className="text-sm">CSV (.csv)</Label>
              </div>
            </RadioGroup>
          </div>

          {sheets.length > 1 && targetFormat === "csv" && (
            <div className="space-y-2">
              <Label>Select Sheet</Label>
              <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {sheets.map(sheet => (
                    <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Converting...</p>
            </div>
          )}

          <Button onClick={handleConvert} disabled={isProcessing || !file} className="w-full">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Convert {canConvert}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-base">Conversion Complete</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <a href={result.downloadUrl} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download Converted File
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
