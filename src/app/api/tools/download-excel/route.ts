import { NextRequest, NextResponse } from "next/server";
import { ensureUploadDir, sanitizeFilename } from "@/lib/file-utils";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, filename } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP/HTTPS URLs are allowed" }, { status: 400 });
    }

    // Download the file
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "ExcelSuite/1.0" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length > 50 * 1024 * 1024) {
        throw new Error("Downloaded file exceeds 50MB limit");
      }

      await ensureUploadDir();

      // Determine filename
      const urlFilename = path.basename(parsedUrl.pathname) || "download";
      const outputName = `${sanitizeFilename(filename || urlFilename)}_${uuidv4().slice(0, 8)}${path.extname(urlFilename) || ".xlsx"}`;
      const outputPath = path.join(process.cwd(), "download", outputName);

      await fs.writeFile(outputPath, buffer);

      await db.fileRecord.create({
        data: {
          filename: outputName,
          originalName: filename || urlFilename,
          mimeType: contentType,
          size: buffer.length,
          tool: "download-excel",
          status: "completed",
          outputPath,
        },
      });

      return NextResponse.json({
        success: true,
        downloadUrl: `/api/tools/download?file=${encodeURIComponent(outputName)}`,
        filename: outputName,
        size: buffer.length,
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      throw fetchError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "download-excel", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
