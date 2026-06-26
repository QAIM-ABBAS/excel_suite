import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const column = formData.get("column") as string;
    const rollNumber = formData.get("rollNumber") as string;

    if (!file || !column || !rollNumber) {
      return NextResponse.json({ error: "File, column, and roll number are required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (jsonData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Filter rows matching the roll number
    const studentRows = jsonData.filter((row) => String(row[column]).trim() === rollNumber.trim());

    if (studentRows.length === 0) {
      return NextResponse.json({ error: `No records found for roll number: ${rollNumber}` }, { status: 404 });
    }

    // Look for the student's records
    // We need to determine present/absent - check all columns except the roll number column
    const allColumns = Object.keys(jsonData[0]);
    const classColumns = allColumns.filter((col) => col !== column);

    if (classColumns.length > 0) {
      // Each column (except roll number) represents a class/date
      const studentRecord = studentRows[0];
      const total = classColumns.length;
      let present = 0;

      for (const col of classColumns) {
        const val = String(studentRecord[col] || "").trim().toLowerCase();
        if (val === "present" || val === "p" || val === "1" || val === "yes" || val === "true") {
          present++;
        }
      }

      const absentCount = total - present;

      const report = {
        rollNumber,
        totalClasses: total,
        presentCount: present,
        absentCount,
        attendancePercentage: total > 0 ? ((present / total) * 100).toFixed(2) : "0.00",
        details: classColumns.map((col) => ({
          class: col,
          status: String(studentRecord[col] || "N/A"),
        })),
      };

      return NextResponse.json({ success: true, report });
    }

    // Fallback: simple row-based counting
    const totalClasses = jsonData.length;
    const presentCount = studentRows.length;
    const absentCount = totalClasses - presentCount;

    const report = {
      rollNumber,
      totalClasses,
      presentCount,
      absentCount,
      attendancePercentage: totalClasses > 0 ? ((presentCount / totalClasses) * 100).toFixed(2) : "0.00",
    };

    return NextResponse.json({ success: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.errorLog.create({
      data: { tool: "attendance", message, details: String(error) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
