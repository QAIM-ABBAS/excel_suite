import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

interface ColumnStats {
  column: string;
  type: "numeric" | "text" | "mixed" | "empty";
  count: number;
  distinct: number;
  missing: number;
  // Numeric-only stats
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  median?: number;
  stdDev?: number;
  // Text stats
  minLength?: number;
  maxLength?: number;
  // Top values (most frequent)
  topValues?: { value: string; count: number }[];
}

/**
 * Compute statistical summary for every column in a spreadsheet.
 * Optionally produces a downloadable Excel summary report.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const generateReport = (formData.get("generateReport") as string) === "true";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const columns = Object.keys(jsonData[0]);
    const stats: ColumnStats[] = [];

    const totalCount = jsonData.length;

    for (const col of columns) {
      const values = jsonData.map((row) => row[col]);
      const nonEmpty = values.filter(
        (v) => v !== "" && v !== null && v !== undefined
      );
      const numericValues = nonEmpty
        .map((v) => Number(v))
        .filter((n) => !isNaN(n) && isFinite(n));

      const distinctSet = new Set(nonEmpty.map((v) => String(v)));
      const missing = totalCount - nonEmpty.length;

      // Decide column type
      let type: ColumnStats["type"] = "empty";
      if (nonEmpty.length === 0) {
        type = "empty";
      } else if (numericValues.length === nonEmpty.length) {
        type = "numeric";
      } else if (numericValues.length === 0) {
        type = "text";
      } else {
        type = "mixed";
      }

      const stat: ColumnStats = {
        column: col,
        type,
        count: nonEmpty.length,
        distinct: distinctSet.size,
        missing,
      };

      if (type === "numeric" || (type === "mixed" && numericValues.length > 0)) {
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const avg = sum / numericValues.length;
        const sorted = [...numericValues].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const mid = Math.floor(sorted.length / 2);
        const median =
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        const variance =
          numericValues.reduce((acc, v) => acc + (v - avg) ** 2, 0) /
          numericValues.length;
        const stdDev = Math.sqrt(variance);
        stat.sum = Number(sum.toFixed(4));
        stat.avg = Number(avg.toFixed(4));
        stat.min = min;
        stat.max = max;
        stat.median = Number(median.toFixed(4));
        stat.stdDev = Number(stdDev.toFixed(4));
      }

      if (type === "text" || type === "mixed") {
        const lengths = nonEmpty.map((v) => String(v).length);
        stat.minLength = Math.min(...lengths);
        stat.maxLength = Math.max(...lengths);
      }

      // Top 5 most frequent values
      const freq = new Map<string, number>();
      for (const v of nonEmpty) {
        const key = String(v);
        freq.set(key, (freq.get(key) || 0) + 1);
      }
      const top = Array.from(freq.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      stat.topValues = top;

      stats.push(stat);
    }

    // Optionally build a downloadable summary report
    let downloadUrl: string | undefined;
    let reportFilename: string | undefined;
    if (generateReport) {
      await ensureUploadDir();
      const reportWb = XLSX.utils.book_new();

      // Sheet 1: Column summary
      const summaryRows = stats.map((s) => ({
        Column: s.column,
        Type: s.type,
        Count: s.count,
        Distinct: s.distinct,
        Missing: s.missing,
        Sum: s.sum ?? "",
        Average: s.avg ?? "",
        Min: s.min ?? "",
        Max: s.max ?? "",
        Median: s.median ?? "",
        "Std Dev": s.stdDev ?? "",
        "Min Length": s.minLength ?? "",
        "Max Length": s.maxLength ?? "",
      }));
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(reportWb, summaryWs, "Summary");

      // Sheet 2: Top values per column
      const topRows: Record<string, unknown>[] = [];
      for (const s of stats) {
        for (const tv of s.topValues || []) {
          topRows.push({
            Column: s.column,
            Value: tv.value,
            Count: tv.count,
            "Percent of Filled": `${((tv.count / s.count) * 100).toFixed(1)}%`,
          });
        }
      }
      if (topRows.length > 0) {
        const topWs = XLSX.utils.json_to_sheet(topRows);
        XLSX.utils.book_append_sheet(reportWb, topWs, "Top Values");
      }

      const baseName = sanitizeFilename(
        path.basename(file.name, path.extname(file.name))
      );
      reportFilename = `${baseName}_stats_${uuidv4().slice(0, 8)}.xlsx`;
      const outputPath = path.join(process.cwd(), "download", reportFilename);
      const outputBuffer = XLSX.write(reportWb, { type: "buffer", bookType: "xlsx" });
      await fs.writeFile(outputPath, outputBuffer);

      downloadUrl = `/api/tools/download?file=${encodeURIComponent(reportFilename)}`;

      await db.fileRecord.create({
        data: {
          filename: reportFilename,
          originalName: file.name,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: (await fs.stat(outputPath)).size,
          tool: "stats",
          status: "completed",
          outputPath,
        },
      });
    }

    return NextResponse.json({
      success: true,
      totalRows: totalCount,
      totalColumns: columns.length,
      stats,
      downloadUrl,
      filename: reportFilename,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "stats", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
