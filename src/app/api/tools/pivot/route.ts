import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

/**
 * Pivot / Group-By Aggregator
 * Groups rows by one or more "group by" columns and aggregates one or more
 * value columns using a chosen aggregation function (sum, avg, count,
 * count_distinct, min, max, first, last).
 *
 * Body (form data):
 *   file:        File            (xlsx/csv)
 *   groupBy:     string          JSON array of column names
 *   aggregations: string         JSON array of { column, function, alias? }
 *
 * Output: a new spreadsheet with one row per unique group, plus aggregated columns.
 */
type AggFn = "sum" | "avg" | "count" | "count_distinct" | "min" | "max" | "first" | "last";

interface Aggregation {
  column: string;
  function: AggFn;
  alias?: string;
}

function aggregate(values: unknown[], fn: AggFn): number | string {
  const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);

  switch (fn) {
    case "count":
      return nonEmpty.length;

    case "count_distinct":
      return new Set(nonEmpty.map((v) => String(v))).size;

    case "first":
      return nonEmpty.length > 0 ? formatValue(nonEmpty[0]) : "";

    case "last":
      return nonEmpty.length > 0 ? formatValue(nonEmpty[nonEmpty.length - 1]) : "";

    case "sum":
    case "avg":
    case "min":
    case "max": {
      const nums = nonEmpty.map((v) => Number(v)).filter((n) => !isNaN(n) && isFinite(n));
      if (nums.length === 0) return 0;
      if (fn === "sum") return Number(nums.reduce((a, b) => a + b, 0).toFixed(4));
      if (fn === "avg") return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
      if (fn === "min") return Math.min(...nums);
      if (fn === "max") return Math.max(...nums);
      return 0;
    }

    default:
      return "";
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const groupByRaw = formData.get("groupBy") as string | null;
    const aggregationsRaw = formData.get("aggregations") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    let groupBy: string[] = [];
    let aggregations: Aggregation[] = [];
    try {
      groupBy = groupByRaw ? JSON.parse(groupByRaw) : [];
      aggregations = aggregationsRaw ? JSON.parse(aggregationsRaw) : [];
    } catch {
      return NextResponse.json({ error: "Invalid groupBy or aggregations JSON" }, { status: 400 });
    }

    if (groupBy.length === 0) {
      return NextResponse.json({ error: "Select at least one column to group by" }, { status: 400 });
    }
    if (aggregations.length === 0) {
      return NextResponse.json({ error: "Add at least one aggregation" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Validate columns exist
    const allCols = new Set(Object.keys(jsonData[0]));
    for (const c of groupBy) {
      if (!allCols.has(c)) {
        return NextResponse.json({ error: `Group-by column "${c}" not found` }, { status: 400 });
      }
    }
    for (const a of aggregations) {
      if (a.function !== "count" && !allCols.has(a.column)) {
        return NextResponse.json({ error: `Aggregation column "${a.column}" not found` }, { status: 400 });
      }
    }

    // Build groups keyed by composite key of group-by values
    const groups = new Map<string, { key: Record<string, unknown>; rows: Record<string, unknown>[] }>();
    for (const row of jsonData) {
      const keyValues: Record<string, unknown> = {};
      const keyParts: string[] = [];
      for (const g of groupBy) {
        keyValues[g] = row[g];
        keyParts.push(formatValue(row[g]));
      }
      const key = keyParts.join("\u0001"); // unit separator to avoid collisions
      if (!groups.has(key)) {
        groups.set(key, { key: keyValues, rows: [] });
      }
      groups.get(key)!.rows.push(row);
    }

    // Build aggregated rows
    const resultRows: Record<string, unknown>[] = [];
    for (const { key, rows } of groups.values()) {
      const out: Record<string, unknown> = { ...key };
      for (const agg of aggregations) {
        const col = agg.column;
        const values = rows.map((r) => r[col]);
        const aggValue = aggregate(values, agg.function);
        const alias =
          agg.alias && agg.alias.trim() !== ""
            ? agg.alias
            : `${col}_${agg.function}`;
        out[alias] = aggValue;
      }
      resultRows.push(out);
    }

    // Sort groups by first group-by column for deterministic output
    const firstGroupCol = groupBy[0];
    resultRows.sort((a, b) => {
      const av = String(a[firstGroupCol] ?? "");
      const bv = String(b[firstGroupCol] ?? "");
      const an = Number(av);
      const bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return av.localeCompare(bv);
    });

    // Build output file
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(resultRows);
    XLSX.utils.book_append_sheet(newWb, newWs, "Pivot");

    const baseName = sanitizeFilename(path.basename(file.name, path.extname(file.name)));
    const outputName = `${baseName}_pivot_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "pivot",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: jsonData.length,
      groupCount: resultRows.length,
      groupBy,
      aggregations,
      preview: resultRows.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "pivot", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
