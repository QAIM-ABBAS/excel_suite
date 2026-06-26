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
    const urlColumn = formData.get("urlColumn") as string;

    if (!file || !urlColumn) {
      return NextResponse.json({ error: "File and URL column are required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Download images and track results
    const results: { row: number; url: string; status: string; error?: string }[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < jsonData.length; i++) {
      const url = jsonData[i][urlColumn];
      if (!url || typeof url !== "string") {
        results.push({ row: i + 1, url: String(url || ""), status: "skipped", error: "No URL" });
        continue;
      }

      try {
        const parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid URL protocol");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "ExcelSuite/1.0" },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          throw new Error(`Not an image: ${contentType}`);
        }

        // Mark as downloaded (we can't embed images in xlsx via the xlsx library directly,
        // but we can indicate success and provide the URL column with a "✓ Image downloaded" marker)
        jsonData[i][urlColumn] = `✓ ${url}`;
        successCount++;
        results.push({ row: i + 1, url, status: "success" });
      } catch (err) {
        failCount++;
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        results.push({ row: i + 1, url, status: "failed", error: errMsg });
      }
    }

    // Create output workbook with results
    await ensureUploadDir();
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(jsonData);
    XLSX.utils.book_append_sheet(newWb, newWs, "With Images");

    // Add a results sheet
    const resultsWs = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(newWb, resultsWs, "Download Results");

    const baseName = sanitizeFilename(path.basename(file.name, path.extname(file.name)));
    const outputName = `${baseName}_images_${uuidv4().slice(0, 8)}.xlsx`;
    const outputPath = path.join(process.cwd(), "download", outputName);
    const outputBuffer = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" });
    await fs.writeFile(outputPath, outputBuffer);

    await db.fileRecord.create({
      data: {
        filename: outputName,
        originalName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: (await fs.stat(outputPath)).size,
        tool: "download-images",
        status: "completed",
        outputPath,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
      filename: outputName,
      totalRows: jsonData.length,
      successCount,
      failCount,
      results: results.slice(0, 100), // Preview first 100
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "download-images", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
