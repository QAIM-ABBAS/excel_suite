import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function GET(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("file");

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    // Prevent path traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), "download", sanitizedFilename);

    // Verify the file is within the download directory
    if (!filePath.startsWith(path.join(process.cwd(), "download"))) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await fs.readFile(filePath);
    const ext = path.extname(sanitizedFilename).toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === ".xlsx") {
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (ext === ".csv") {
      contentType = "text/csv";
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${sanitizedFilename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
