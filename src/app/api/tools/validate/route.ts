import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

/**
 * Data Validation / Quality Check
 *
 * Scans a spreadsheet for common data-quality issues and returns a
 * structured report. Optionally persists a multi-sheet Excel report.
 *
 * Form data:
 *   file:           File               (xlsx/csv)
 *   checks:         string (JSON)     array of check names to run
 *   primaryKey:     string             column name to check for duplicates
 *   emailColumns:   string (JSON)     array of column names to validate as email
 *   urlColumns:     string (JSON)     array of column names to validate as URL
 *   dateColumns:    string (JSON)     array of column names to validate as date
 *
 * Available checks:
 *   empty_cells, mixed_types, duplicate_keys, email_format, url_format,
 *   date_format, constant_columns, whitespace, unique_counts, outliers
 */

type CheckName =
  | "empty_cells"
  | "mixed_types"
  | "duplicate_keys"
  | "email_format"
  | "url_format"
  | "date_format"
  | "constant_columns"
  | "whitespace"
  | "unique_counts"
  | "outliers";

interface Issue {
  row: number;
  column: string;
  value: unknown;
  message: string;
  severity: "info" | "warning" | "error";
}

interface ColumnReport {
  column: string;
  totalCells: number;
  emptyCells: number;
  whitespaceOnly: number;
  uniqueValues: number;
  detectedType: "number" | "text" | "date" | "boolean" | "mixed";
  isConstant: boolean;
  min?: number | string;
  max?: number | string;
  mean?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?Z?)?$/;

function detectType(values: unknown[]): "number" | "text" | "date" | "boolean" | "mixed" {
  const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return "text";
  let nums = 0;
  let texts = 0;
  let dates = 0;
  let bools = 0;
  for (const v of nonEmpty) {
    if (typeof v === "number" || (!isNaN(Number(v)) && v !== "" && typeof v !== "boolean")) {
      nums++;
      continue;
    }
    if (typeof v === "boolean" || v === "true" || v === "false") {
      bools++;
      continue;
    }
    if (v instanceof Date || (typeof v === "string" && DATE_RE.test(v))) {
      dates++;
      continue;
    }
    texts++;
  }
  const total = nonEmpty.length;
  if (nums === total) return "number";
  if (texts === total) return "text";
  if (dates === total) return "date";
  if (bools === total) return "boolean";
  return "mixed";
}

function detectOutliers(values: number[]): number[] {
  if (values.length < 4) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const q1 = sorted[Math.floor(mid / 2)];
  const q3 = sorted[mid + Math.floor((sorted.length - mid) / 2)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return values
    .map((v, idx) => ({ v, idx, isOutlier: v < lower || v > upper }))
    .filter((x) => x.isOutlier)
    .map((x) => x.idx);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const checksRaw = formData.get("checks") as string | null;
    const primaryKey = (formData.get("primaryKey") as string | null) || "";
    const emailColumnsRaw = formData.get("emailColumns") as string | null;
    const urlColumnsRaw = formData.get("urlColumns") as string | null;
    const dateColumnsRaw = formData.get("dateColumns") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    let checks: CheckName[] = [];
    try {
      checks = checksRaw ? JSON.parse(checksRaw) : [];
    } catch {
      return NextResponse.json({ error: "Invalid checks JSON" }, { status: 400 });
    }
    if (checks.length === 0) {
      checks = [
        "empty_cells",
        "mixed_types",
        "duplicate_keys",
        "email_format",
        "url_format",
        "date_format",
        "constant_columns",
        "whitespace",
        "unique_counts",
        "outliers",
      ];
    }

    const emailColumns: string[] = emailColumnsRaw ? JSON.parse(emailColumnsRaw) : [];
    const urlColumns: string[] = urlColumnsRaw ? JSON.parse(urlColumnsRaw) : [];
    const dateColumns: string[] = dateColumnsRaw ? JSON.parse(dateColumnsRaw) : [];

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const columns = Object.keys(jsonData[0]);
    const issues: Issue[] = [];
    const columnReports: ColumnReport[] = [];

    // Per-column analysis
    for (const col of columns) {
      const values = jsonData.map((r) => r[col]);
      const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);
      const emptyCells = values.length - nonEmpty.length;
      const whitespaceOnly = values.filter(
        (v) => typeof v === "string" && v !== "" && v.trim() === ""
      ).length;
      const uniqueSet = new Set(nonEmpty.map((v) => String(v)));
      const detectedType = detectType(values);

      // Min/max/mean for numeric columns
      let min: number | string | undefined;
      let max: number | string | undefined;
      let mean: number | undefined;
      if (detectedType === "number") {
        const nums = nonEmpty.map((v) => Number(v)).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          min = Math.min(...nums);
          max = Math.max(...nums);
          mean = Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
        }
      } else if (nonEmpty.length > 0) {
        min = String(nonEmpty.reduce((a, b) => (String(a) < String(b) ? a : b)));
        max = String(nonEmpty.reduce((a, b) => (String(a) > String(b) ? a : b)));
      }

      const isConstant = nonEmpty.length > 0 && uniqueSet.size === 1;

      columnReports.push({
        column: col,
        totalCells: values.length,
        emptyCells,
        whitespaceOnly,
        uniqueValues: uniqueSet.size,
        detectedType,
        isConstant,
        min,
        max,
        mean,
      });

      // Empty cells
      if (checks.includes("empty_cells")) {
        values.forEach((v, idx) => {
          if (v === "" || v === null || v === undefined) {
            issues.push({
              row: idx + 1,
              column: col,
              value: v,
              message: "Empty cell",
              severity: "info",
            });
          }
        });
      }

      // Whitespace-only
      if (checks.includes("whitespace")) {
        values.forEach((v, idx) => {
          if (typeof v === "string" && v !== "" && v.trim() === "") {
            issues.push({
              row: idx + 1,
              column: col,
              value: v,
              message: "Whitespace-only cell",
              severity: "warning",
            });
          }
        });
      }

      // Mixed types
      if (checks.includes("mixed_types") && detectedType === "mixed") {
        values.forEach((v, idx) => {
          if (v === "" || v === null || v === undefined) return;
          const isNum = typeof v === "number" || (!isNaN(Number(v)) && v !== "" && typeof v !== "boolean");
          if (!isNum) {
            issues.push({
              row: idx + 1,
              column: col,
              value: v,
              message: `Non-numeric value in mostly-numeric column (detected type: mixed)`,
              severity: "warning",
            });
          }
        });
      }

      // Constant columns
      if (checks.includes("constant_columns") && isConstant) {
        issues.push({
          row: 0,
          column: col,
          value: nonEmpty[0],
          message: `Column is constant — every non-empty cell is "${String(nonEmpty[0])}"`,
          severity: "info",
        });
      }

      // Outliers (numeric only)
      if (checks.includes("outliers") && detectedType === "number") {
        const nums = values.map((v) => Number(v));
        const outlierIndices = detectOutliers(nums);
        for (const idx of outlierIndices) {
          issues.push({
            row: idx + 1,
            column: col,
            value: nums[idx],
            message: "Statistical outlier (outside 1.5 × IQR)",
            severity: "warning",
          });
        }
      }

      // Email format
      if (checks.includes("email_format") && emailColumns.includes(col)) {
        values.forEach((v, idx) => {
          if (v === "" || v === null || v === undefined) return;
          if (!EMAIL_RE.test(String(v))) {
            issues.push({
              row: idx + 1,
              column: col,
              value: v,
              message: "Invalid email format",
              severity: "error",
            });
          }
        });
      }

      // URL format
      if (checks.includes("url_format") && urlColumns.includes(col)) {
        values.forEach((v, idx) => {
          if (v === "" || v === null || v === undefined) return;
          if (!URL_RE.test(String(v))) {
            issues.push({
              row: idx + 1,
              column: col,
              value: v,
              message: "Invalid URL format",
              severity: "error",
            });
          }
        });
      }

      // Date format
      if (checks.includes("date_format") && dateColumns.includes(col)) {
        values.forEach((v, idx) => {
          if (v === "" || v === null || v === undefined) return;
          if (!(v instanceof Date) && !DATE_RE.test(String(v))) {
            issues.push({
              row: idx + 1,
              column: col,
              value: v,
              message: "Invalid date format (expected YYYY-MM-DD)",
              severity: "error",
            });
          }
        });
      }
    }

    // Duplicate keys
    if (checks.includes("duplicate_keys") && primaryKey) {
      if (!columns.includes(primaryKey)) {
        return NextResponse.json(
          { error: `Primary key column "${primaryKey}" not found` },
          { status: 400 }
        );
      }
      const seen = new Map<string, number[]>();
      jsonData.forEach((row, idx) => {
        const v = String(row[primaryKey] ?? "");
        if (v === "") return;
        if (!seen.has(v)) seen.set(v, []);
        seen.get(v)!.push(idx + 1);
      });
      for (const [value, rows] of seen.entries()) {
        if (rows.length > 1) {
          issues.push({
            row: rows[0],
            column: primaryKey,
            value,
            message: `Duplicate primary key "${value}" appears in rows: ${rows.join(", ")}`,
            severity: "error",
          });
        }
      }
    }

    // Summary
    const summary = {
      totalRows: jsonData.length,
      totalColumns: columns.length,
      totalCells: jsonData.length * columns.length,
      emptyCells: columnReports.reduce((sum, c) => sum + c.emptyCells, 0),
      uniqueIssues: issues.length,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      infos: issues.filter((i) => i.severity === "info").length,
      constantColumns: columnReports.filter((c) => c.isConstant).length,
      mixedTypeColumns: columnReports.filter((c) => c.detectedType === "mixed").length,
    };

    const overallScore = Math.max(
      0,
      Math.round(
        100 -
          ((summary.errors * 5 +
            summary.warnings * 2 +
            summary.infos * 0.5) /
            Math.max(1, summary.totalCells)) *
            100
      )
    );

    // Build Excel report
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Total Rows", Value: summary.totalRows },
      { Metric: "Total Columns", Value: summary.totalColumns },
      { Metric: "Total Cells", Value: summary.totalCells },
      { Metric: "Empty Cells", Value: summary.emptyCells },
      { Metric: "Constant Columns", Value: summary.constantColumns },
      { Metric: "Mixed-Type Columns", Value: summary.mixedTypeColumns },
      { Metric: "Errors", Value: summary.errors },
      { Metric: "Warnings", Value: summary.warnings },
      { Metric: "Info", Value: summary.infos },
      { Metric: "Total Issues", Value: summary.uniqueIssues },
      { Metric: "Quality Score", Value: `${overallScore}/100` },
    ]);
    XLSX.utils.book_append_sheet(newWb, summarySheet, "Summary");

    // Sheet 2: Column Reports
    const colSheet = XLSX.utils.json_to_sheet(
      columnReports.map((c) => ({
        Column: c.column,
        Type: c.detectedType,
        "Total Cells": c.totalCells,
        "Empty Cells": c.emptyCells,
        "Whitespace-only": c.whitespaceOnly,
        "Unique Values": c.uniqueValues,
        Constant: c.isConstant ? "Yes" : "No",
        Min: c.min ?? "",
        Max: c.max ?? "",
        Mean: c.mean ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(newWb, colSheet, "Columns");

    // Sheet 3: Issues
    const issueSheet = XLSX.utils.json_to_sheet(
      issues.slice(0, 1000).map((i) => ({
        Row: i.row,
        Column: i.column,
        Value: String(i.value),
        Severity: i.severity,
        Message: i.message,
      }))
    );
    XLSX.utils.book_append_sheet(newWb, issueSheet, "Issues");

    const baseName = sanitizeFilename(path.basename(file.name, path.extname(file.name)));
    const outputName = `${baseName}_validation_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "validate",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      summary,
      overallScore,
      columnReports,
      issues: issues.slice(0, 200),
      checksRun: checks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "validate", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
