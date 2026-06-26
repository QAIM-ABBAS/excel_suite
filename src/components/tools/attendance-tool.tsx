"use client"

import { useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { UserCheck, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface AttendanceReport {
  rollNumber: string
  totalClasses: number
  presentCount: number
  absentCount: number
  attendancePercentage: string
  details?: { class: string; status: string }[]
}

export function AttendanceTool() {
  const [file, setFile] = useState<File | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [selectedColumn, setSelectedColumn] = useState("")
  const [rollNumber, setRollNumber] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(false)
  const [progress, setProgress] = useState(0)
  const [report, setReport] = useState<AttendanceReport | null>(null)

  const handleFileSelected = async (files: File[]) => {
    const selected = files[0]
    setFile(selected)
    setReport(null)
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

  const handleCheck = async () => {
    if (!file || !selectedColumn || !rollNumber) {
      toast.error("Please fill in all fields")
      return
    }

    setIsProcessing(true)
    setProgress(20)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("column", selectedColumn)
      formData.append("rollNumber", rollNumber)

      setProgress(50)

      const response = await fetch("/api/tools/attendance", {
        method: "POST",
        body: formData,
      })

      setProgress(80)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Failed to check attendance")

      setProgress(100)
      setReport(data.report)
      toast.success("Attendance report generated!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to check attendance")
    } finally {
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const percentage = report ? parseFloat(report.attendancePercentage) : 0
  const statusColor = percentage >= 75 ? "text-emerald-500" : percentage >= 50 ? "text-amber-500" : "text-rose-500"

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Attendance Checker</CardTitle>
              <CardDescription>Calculate attendance statistics from spreadsheets</CardDescription>
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
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="space-y-2">
                <Label>Roll Number Column</Label>
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
            </motion.div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rollNumber">Student Roll Number</Label>
            <Input
              id="rollNumber"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="Enter roll number..."
              className="h-9"
            />
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Checking attendance...</p>
            </div>
          )}

          <Button onClick={handleCheck} disabled={isProcessing || !file || !selectedColumn || !rollNumber} className="w-full">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <UserCheck className="mr-2 h-4 w-4" />
                Check Attendance
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {report && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-sky-500" />
                  <CardTitle className="text-base">Attendance Report</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-4">
                  <p className={`text-5xl font-bold ${statusColor}`}>{report.attendancePercentage}%</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {percentage >= 75 ? "Good Standing" : percentage >= 50 ? "Needs Improvement" : "Critical"}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-background p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Classes</p>
                    <p className="text-xl font-semibold">{report.totalClasses}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <p className="text-xs text-muted-foreground">Present</p>
                    <p className="text-xl font-semibold text-emerald-500">{report.presentCount}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <p className="text-xs text-muted-foreground">Absent</p>
                    <p className="text-xl font-semibold text-rose-500">{report.absentCount}</p>
                  </div>
                </div>

                {/* Progress bar showing attendance */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Attendance Rate</span>
                    <span>{report.attendancePercentage}%</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        percentage >= 75 ? "bg-emerald-500" : percentage >= 50 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                    />
                  </div>
                </div>

                {report.details && report.details.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Detailed Breakdown</Label>
                    <div className="max-h-48 overflow-auto rounded-lg border border-border/50 bg-muted/30 p-2">
                      <div className="space-y-1">
                        {report.details.map((d, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{d.class}</span>
                            <span className={d.status.toLowerCase() === "present" || d.status.toLowerCase() === "p" ? "text-emerald-500" : "text-rose-500"}>
                              {d.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
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
