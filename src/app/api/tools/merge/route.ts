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
    const files = formData.getAll("files") as File[];
    const outputFormat = (formData.get("outputFormat") as string) || "xlsx";
    const outputFilename = sanitizeFilename((formData.get("outputFilename") as string) || "merged");

    if (!files || files.length < 2) {
      return NextResponse.json({ error: "At least 2 files are required" }, { status: 400 });
    }

    await ensureUploadDir();

    // Parse all files
    const allData: Record<string, string[]>[] = [];
    const headers: string[][] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name).toLowerCase();

      let wb: XLSX.WorkBook;
      if (ext === ".csv") {
        wb = XLSX.read(buffer, { type: "buffer", raw: true });
      } else {
        wb = XLSX.read(buffer, { type: "buffer" });
      }

      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

      if (jsonData.length > 0) {
        headers.push(Object.keys(jsonData[0]));
        allData.push(...jsonData);
      }
    }

    // Check for header mismatches
    const baseHeaders = headers[0] || [];
    const hasMismatch = headers.some(
      (h) => h.length !== baseHeaders.length || h.some((col, i) => col !== baseHeaders[i])
    );

    // Create merged workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(allData);
    XLSX.utils.book_append_sheet(wb, ws, "Merged");

    // Save output file
    const outputExt = outputFormat === "csv" ? ".csv" : ".xlsx";
    const outputName = `${outputFilename}_${uuidv4().slice(0, 8)}${outputExt}`;
    const outputPath = path.join(process.cwd(), "download", outputName);

    if (outputFormat === "csv") {
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      await fs.writeFile(outputPath, csvContent);
    } else {
      const outputBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      await fs.writeFile(outputPath, outputBuffer);
    }

    // Save to database
    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: `${outputFilename}${outputExt}`,
        mimeType:
          outputFormat === "csv"
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "merge",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: allData.length,
      headers: baseHeaders,
      hasMismatch,
      mismatchWarning: hasMismatch
        ? "Some files have different headers. Data was merged using all available columns."
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "merge", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
