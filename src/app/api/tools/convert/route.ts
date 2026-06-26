import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const targetFormat = (formData.get("targetFormat") as string) || "xlsx";
    const sheetName = (formData.get("sheetName") as string) || undefined;
    const delimiter = (formData.get("delimiter") as string) || ",";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase();

    // Read with delimiter support for CSV
    const readOpts: XLSX.ParsingOptions = { type: "buffer" };
    if (ext === ".csv" && delimiter !== ",") {
      readOpts.raw = false;
      readOpts.codepage = 65001;
    }
    const wb = XLSX.read(buffer, readOpts);

    // If CSV with custom delimiter, re-parse manually
    if (ext === ".csv" && delimiter !== ",") {
      const text = buffer.toString("utf-8");
      const rows = parseCsvWithDelimiter(text, delimiter);
      if (rows.length > 0) {
        const newWs = XLSX.utils.aoa_to_sheet(rows);
        wb.SheetNames = ["Sheet1"];
        wb.Sheets = { Sheet1: newWs };
      }
    }

    const sheets = wb.SheetNames;
    const targetSheet = sheetName || sheets[0];

    if (!sheets.includes(targetSheet)) {
      return NextResponse.json(
        { error: `Sheet "${targetSheet}" not found. Available: ${sheets.join(", ")}` },
        { status: 400 }
      );
    }

    const ws = wb.Sheets[targetSheet];

    await ensureUploadDir();

    let outputName: string;
    let outputPath: string;
    let mimeType: string;

    if (targetFormat === "csv") {
      // Excel to CSV
      const csvContent = XLSX.utils.sheet_to_csv(ws, { FS: delimiter });
      const baseName = sanitizeFilename(path.basename(file.name, ext));
      outputName = `${baseName}_${uuidv4().slice(0, 8)}.csv`;
      outputPath = path.join(process.cwd(), "download", outputName);
      await fs.writeFile(outputPath, csvContent);
      mimeType = "text/csv";
    } else {
      // CSV to Excel
      const newWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWb, ws, targetSheet);
      const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
      const baseName = sanitizeFilename(path.basename(file.name, ext));
      outputName = `${baseName}_${uuidv4().slice(0, 8)}.xlsx`;
      outputPath = path.join(process.cwd(), "download", outputName);
      await fs.writeFile(outputPath, outputBuffer);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType,
        size: (await fs.stat(outputPath)).size,
        tool: "convert",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      sheets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "convert", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Simple CSV parser that respects quoted fields and custom delimiter
function parseCsvWithDelimiter(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.length > 1 || currentRow[0] !== "") {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }
  // last field
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}
