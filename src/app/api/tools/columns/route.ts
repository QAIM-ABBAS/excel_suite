import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    const sheets = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      return { name, columns, rowCount: jsonData.length };
    });

    return NextResponse.json({
      success: true,
      sheets,
      preview:
        sheets.length > 0 && sheets[0].rowCount > 0
          ? (() => {
              const ws = wb.Sheets[sheets[0].name];
              return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }).slice(0, 5);
            })()
          : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
