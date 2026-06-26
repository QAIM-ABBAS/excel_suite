import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

/**
 * Transpose / Reshape
 *
 * Modes:
 *   - "transpose":  classic rows <-> columns swap (matrix transpose)
 *   - "unpivot":    wide-to-long. `idColumns` stay fixed; all other columns
 *                   become (variable, value) pairs.
 *
 * Form data:
 *   file:         File
 *   mode:         "transpose" | "unpivot"
 *   idColumns:    string (JSON array)  (unpivot only) columns to keep fixed
 *   varName:      string               (unpivot only) name for variable column, default "variable"
 *   valueName:    string               (unpivot only) name for value column, default "value"
 */

interface UnpivotRow {
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mode = (formData.get("mode") as string) || "transpose";
    const idColumnsRaw = formData.get("idColumns") as string | null;
    const varName = (formData.get("varName") as string) || "variable";
    const valueName = (formData.get("valueName") as string) || "value";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (mode !== "transpose" && mode !== "unpivot") {
      return NextResponse.json(
        { error: "Invalid mode. Use 'transpose' or 'unpivot'." },
        { status: 400 }
      );
    }

    let idColumns: string[] = [];
    if (mode === "unpivot") {
      try {
        idColumns = idColumnsRaw ? JSON.parse(idColumnsRaw) : [];
      } catch {
        return NextResponse.json({ error: "Invalid idColumns JSON" }, { status: 400 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const columns = Object.keys(jsonData[0]);
    let resultRows: Record<string, unknown>[] = [];
    let outputColumns: string[] = [];

    if (mode === "transpose") {
      // Build matrix transpose: original columns become rows, original rows become columns
      // First column of output: "Column" (original column names)
      // Each subsequent column: "Row 1", "Row 2", ...
      const headers = ["Column", ...jsonData.map((_, idx) => `Row ${idx + 1}`)];
      outputColumns = headers;
      for (const col of columns) {
        const row: Record<string, unknown> = { Column: col };
        jsonData.forEach((r, idx) => {
          row[`Row ${idx + 1}`] = r[col];
        });
        resultRows.push(row);
      }
    } else {
      // unpivot (wide-to-long)
      if (idColumns.length === 0) {
        return NextResponse.json(
          { error: "Select at least one ID column to keep fixed for unpivot" },
          { status: 400 }
        );
      }
      for (const c of idColumns) {
        if (!columns.includes(c)) {
          return NextResponse.json(
            { error: `ID column "${c}" not found` },
            { status: 400 }
          );
        }
      }
      const valueColumns = columns.filter((c) => !idColumns.includes(c));
      if (valueColumns.length === 0) {
        return NextResponse.json(
          { error: "No value columns to unpivot (all columns are ID columns)" },
          { status: 400 }
        );
      }
      for (const row of jsonData) {
        for (const vCol of valueColumns) {
          const newRow: Record<string, unknown> = {};
          for (const idc of idColumns) {
            newRow[idc] = row[idc];
          }
          newRow[varName] = vCol;
          newRow[valueName] = row[vCol];
          resultRows.push(newRow as UnpivotRow);
        }
      }
      outputColumns = [...idColumns, varName, valueName];
    }

    // Build output file
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(resultRows);
    XLSX.utils.book_append_sheet(newWb, newWs, mode === "transpose" ? "Transposed" : "Unpivoted");

    const baseName = sanitizeFilename(path.basename(file.name, path.extname(file.name)));
    const suffix = mode === "transpose" ? "transposed" : "unpivoted";
    const outputName = `${baseName}_${suffix}_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "transpose",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      mode,
      inputRows: jsonData.length,
      inputColumns: columns.length,
      outputRows: resultRows.length,
      outputColumns,
      preview: resultRows.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "transpose", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
