import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

/**
 * Find & Replace tool.
 *
 * Body (form data):
 *   file:        File
 *   find:        string  - text to search for
 *   replace:     string  - replacement text
 *   columns:     string  - JSON array of column names to scope (empty = all)
 *   matchMode:   string  - "contains" | "exact" | "startsWith" | "endsWith"
 *   caseSensitive: string - "true" | "false"
 *   useRegex:    string  - "true" | "false" (if true, `find` is treated as a regex pattern)
 *
 * Returns: stats (matches, cellsChanged, rowsAffected), preview of changes,
 *          and a downloadable output file.
 */
interface ChangePreview {
  row: number;
  column: string;
  before: string;
  after: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const find = (formData.get("find") as string) || "";
    const replace = (formData.get("replace") as string) || "";
    const columnsRaw = (formData.get("columns") as string) || "[]";
    const matchMode = (formData.get("matchMode") as string) || "contains";
    const caseSensitive = (formData.get("caseSensitive") as string) === "true";
    const useRegex = (formData.get("useRegex") as string) === "true";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!find) {
      return NextResponse.json({ error: "Find text is required" }, { status: 400 });
    }

    let scopeColumns: string[] = [];
    try {
      scopeColumns = JSON.parse(columnsRaw);
    } catch {
      return NextResponse.json({ error: "Invalid columns JSON" }, { status: 400 });
    }

    // Build the regex pattern
    let pattern: RegExp;
    try {
      const flags = caseSensitive ? "g" : "gi";
      if (useRegex) {
        pattern = new RegExp(find, flags);
      } else {
        let patternSrc: string;
        switch (matchMode) {
          case "exact":
            patternSrc = `^${escapeRegex(find)}$`;
            break;
          case "startsWith":
            patternSrc = `^${escapeRegex(find)}`;
            break;
          case "endsWith":
            patternSrc = `${escapeRegex(find)}$`;
            break;
          case "contains":
          default:
            patternSrc = escapeRegex(find);
            break;
        }
        pattern = new RegExp(patternSrc, flags);
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid regular expression pattern" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const allColumns = Object.keys(jsonData[0]);
    const targetColumns =
      scopeColumns.length > 0
        ? scopeColumns.filter((c) => allColumns.includes(c))
        : allColumns;

    if (targetColumns.length === 0) {
      return NextResponse.json(
        { error: "No matching columns found in scope" },
        { status: 400 }
      );
    }

    let totalMatches = 0;
    let cellsChanged = 0;
    let rowsAffected = new Set<number>();
    const changes: ChangePreview[] = [];

    // Process each row
    jsonData.forEach((row, rowIdx) => {
      for (const col of targetColumns) {
        const original = row[col];
        const originalStr = original === null || original === undefined ? "" : String(original);

        // Reset regex lastIndex (since we reuse it across cells)
        pattern.lastIndex = 0;
        const matches = originalStr.match(pattern);
        if (!matches || matches.length === 0) continue;

        // Count matches in this cell
        pattern.lastIndex = 0;
        const replaced = originalStr.replace(pattern, replace);

        if (replaced !== originalStr) {
          totalMatches += matches.length;
          cellsChanged += 1;
          rowsAffected.add(rowIdx);
          row[col] = replaced;

          if (changes.length < 50) {
            changes.push({
              row: rowIdx + 1, // 1-indexed for user display
              column: col,
              before: originalStr.length > 80 ? originalStr.slice(0, 77) + "..." : originalStr,
              after: replaced.length > 80 ? replaced.slice(0, 77) + "..." : replaced,
            });
          }
        }
      }
    });

    // Build output file
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(jsonData);
    XLSX.utils.book_append_sheet(newWb, newWs, "Replaced");

    const baseName = sanitizeFilename(
      path.basename(file.name, path.extname(file.name))
    );
    const outputName = `${baseName}_replaced_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "replace",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: jsonData.length,
      scopedColumns: targetColumns,
      matchMode: useRegex ? "regex" : matchMode,
      caseSensitive,
      totalMatches,
      cellsChanged,
      rowsAffected: rowsAffected.size,
      changes,
      preview: jsonData.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "replace", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
