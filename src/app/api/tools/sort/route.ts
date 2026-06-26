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
    const order = (formData.get("order") as string) || "asc"; // "asc" or "desc"

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

    // Check column exists
    if (!(column in jsonData[0])) {
      return NextResponse.json({ error: `Column "${column}" not found` }, { status: 400 });
    }

    // Sort the data
    const sortedData = [...jsonData].sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];

      // Handle empty values - put them at the end
      if (aVal === "" || aVal === null || aVal === undefined) return 1;
      if (bVal === "" || bVal === null || bVal === undefined) return -1;

      // Try numeric comparison first
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return order === "asc" ? aNum - bNum : bNum - aNum;
      }

      // Fall back to string comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return order === "asc" ? -1 : 1;
      if (aStr > bStr) return order === "asc" ? 1 : -1;
      return 0;
    });

    // Create output file
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(sortedData);
    XLSX.utils.book_append_sheet(newWb, newWs, "Sorted");

    const baseName = sanitizeFilename(path.basename(file.name, path.extname(file.name)));
    const outputName = `${baseName}_sorted_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "sort",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: sortedData.length,
      sortedBy: column,
      order,
      preview: sortedData.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "sort", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
