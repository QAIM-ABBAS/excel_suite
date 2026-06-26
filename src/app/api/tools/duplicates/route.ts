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
    const column = formData.get("column") as string;
    const keepOccurrence = (formData.get("keepOccurrence") as string) || "first"; // "first" or "last"

    if (!file || !column) {
      return NextResponse.json({ error: "File and column are required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const seen = new Map<unknown, number>();
    const duplicates: number[] = [];

    // First pass: find duplicates
    jsonData.forEach((row, index) => {
      const value = row[column];
      if (seen.has(value)) {
        duplicates.push(index);
      }
      seen.set(value, index);
    });

    // Second pass: filter based on keepOccurrence
    const valueCounts = new Map<unknown, number[]>();
    jsonData.forEach((row, index) => {
      const value = row[column];
      if (!valueCounts.has(value)) valueCounts.set(value, []);
      valueCounts.get(value)!.push(index);
    });

    const keepIndices = new Set<number>();
    valueCounts.forEach((indices) => {
      if (keepOccurrence === "first") {
        keepIndices.add(indices[0]);
      } else {
        keepIndices.add(indices[indices.length - 1]);
      }
    });

    const cleanedData = jsonData.filter((_, index) => keepIndices.has(index));
    const deletedCount = jsonData.length - cleanedData.length;

    // Create output file
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(cleanedData);
    XLSX.utils.book_append_sheet(newWb, newWs, "Cleaned");

    const baseName = sanitizeFilename(path.basename(file.name, path.extname(file.name)));
    const outputName = `${baseName}_cleaned_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "duplicates",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: jsonData.length,
      duplicateRows: deletedCount,
      remainingRows: cleanedData.length,
      preview: {
        deleted: duplicates.slice(0, 10).map((i) => jsonData[i]),
        remaining: cleanedData.slice(0, 5),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "duplicates", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
