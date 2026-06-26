import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

/**
 * Filter conditions supported by the Data Filter tool.
 * Each condition is { column, operator, value }.
 * Multiple conditions are joined by `combineWith` (AND / OR).
 */
type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_or_equal"
  | "less_or_equal"
  | "is_empty"
  | "is_not_empty";

interface FilterCondition {
  column: string;
  operator: Operator;
  value?: string;
}

function applyCondition(row: Record<string, unknown>, cond: FilterCondition): boolean {
  const cell = row[cond.column];
  const cellStr = cell === null || cell === undefined ? "" : String(cell);

  switch (cond.operator) {
    case "equals": {
      const a = Number(cell);
      const b = Number(cond.value);
      if (!isNaN(a) && !isNaN(b) && cond.value !== "") return a === b;
      return cellStr === (cond.value ?? "");
    }
    case "not_equals": {
      const a = Number(cell);
      const b = Number(cond.value);
      if (!isNaN(a) && !isNaN(b) && cond.value !== "") return a !== b;
      return cellStr !== (cond.value ?? "");
    }
    case "contains":
      return cellStr.toLowerCase().includes((cond.value ?? "").toLowerCase());
    case "not_contains":
      return !cellStr.toLowerCase().includes((cond.value ?? "").toLowerCase());
    case "starts_with":
      return cellStr.toLowerCase().startsWith((cond.value ?? "").toLowerCase());
    case "ends_with":
      return cellStr.toLowerCase().endsWith((cond.value ?? "").toLowerCase());
    case "greater_than": {
      const a = Number(cell);
      const b = Number(cond.value);
      if (isNaN(a) || isNaN(b)) return cellStr > (cond.value ?? "");
      return a > b;
    }
    case "less_than": {
      const a = Number(cell);
      const b = Number(cond.value);
      if (isNaN(a) || isNaN(b)) return cellStr < (cond.value ?? "");
      return a < b;
    }
    case "greater_or_equal": {
      const a = Number(cell);
      const b = Number(cond.value);
      if (isNaN(a) || isNaN(b)) return cellStr >= (cond.value ?? "");
      return a >= b;
    }
    case "less_or_equal": {
      const a = Number(cell);
      const b = Number(cond.value);
      if (isNaN(a) || isNaN(b)) return cellStr <= (cond.value ?? "");
      return a <= b;
    }
    case "is_empty":
      return cellStr.trim() === "";
    case "is_not_empty":
      return cellStr.trim() !== "";
    default:
      return true;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const conditionsRaw = formData.get("conditions") as string | null;
    const combineWith = (formData.get("combineWith") as string) || "AND";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    let conditions: FilterCondition[] = [];
    try {
      conditions = conditionsRaw ? JSON.parse(conditionsRaw) : [];
    } catch {
      return NextResponse.json({ error: "Invalid conditions JSON" }, { status: 400 });
    }

    if (conditions.length === 0) {
      return NextResponse.json({ error: "At least one filter condition is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    for (const c of conditions) {
      if (!(c.column in jsonData[0])) {
        return NextResponse.json(
          { error: `Column "${c.column}" not found in the file` },
          { status: 400 }
        );
      }
    }

    const matcher = (row: Record<string, unknown>) => {
      const results = conditions.map((c) => applyCondition(row, c));
      return combineWith === "OR" ? results.some(Boolean) : results.every(Boolean);
    };

    const filtered = jsonData.filter(matcher);

    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs =
      filtered.length > 0
        ? XLSX.utils.json_to_sheet(filtered)
        : XLSX.utils.json_to_sheet([{}]);
    XLSX.utils.book_append_sheet(newWb, newWs, "Filtered");

    const baseName = sanitizeFilename(
      path.basename(file.name, path.extname(file.name))
    );
    const outputName = `${baseName}_filtered_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "filter",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: jsonData.length,
      matchedRows: filtered.length,
      removedRows: jsonData.length - filtered.length,
      conditions,
      combineWith,
      preview: filtered.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "filter", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
