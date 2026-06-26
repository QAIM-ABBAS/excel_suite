"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileSpreadsheet } from "lucide-react"

export function AboutView() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Excel Automation Suite</CardTitle>
              <p className="text-sm text-muted-foreground">Version 1.0.0</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A comprehensive suite of tools for automating Excel and CSV file operations.
            Built with modern web technologies for speed and reliability.
          </p>
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Features</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Merge multiple Excel/CSV files</li>
              <li>Convert between CSV and Excel formats</li>
              <li>Remove duplicate rows</li>
              <li>Check attendance statistics</li>
              <li>Download Excel files from URLs</li>
              <li>Embed images into Excel spreadsheets</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
