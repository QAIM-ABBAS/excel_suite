import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const records = await db.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ success: true, records });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch error logs" }, { status: 500 });
  }
}
