import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";

export async function GET() {
  try {
    const records = await db.fileRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ success: true, records });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // Delete a single record by id
      const record = await db.fileRecord.findUnique({ where: { id } });
      if (!record) {
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      }

      // Try to delete the actual file from disk
      if (record.outputPath) {
        try {
          await fs.unlink(record.outputPath);
        } catch {
          // File may already be deleted, ignore
        }
      }

      await db.fileRecord.delete({ where: { id } });
      return NextResponse.json({ success: true, message: "Record deleted" });
    } else {
      // Delete all records
      const records = await db.fileRecord.findMany();

      // Delete all associated files from disk
      for (const record of records) {
        if (record.outputPath) {
          try {
            await fs.unlink(record.outputPath);
          } catch {
            // ignore
          }
        }
      }

      await db.fileRecord.deleteMany();
      return NextResponse.json({ success: true, message: `Cleared ${records.length} records` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
