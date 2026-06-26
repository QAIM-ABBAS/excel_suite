import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs/promises";

export async function GET(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("file");
    const rows = parseInt(request.nextUrl.searchParams.get("rows") || "50", 10);

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    // Prevent path traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), "download", sanitizedFilename);

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

    let wb: XLSX.WorkBook;
    if (ext === ".csv") {
      wb = XLSX.read(buffer, { type: "buffer", raw: false });
    } else {
      wb = XLSX.read(buffer, { type: "buffer" });
    }

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

    return NextResponse.json({
      success: true,
      sheetName,
      totalRows: jsonData.length,
      columns,
      data: jsonData.slice(0, rows),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
