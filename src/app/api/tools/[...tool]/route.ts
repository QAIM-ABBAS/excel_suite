import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile, stat, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

const UPLOAD_DIR = path.join(process.cwd(), "tmp-uploads");
const CLI_PATH = path.join(process.cwd(), "mini-services", "api-service", "cli.py");
const PYTHON = "python3";

async function ensureUploadDir() {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch {}
}

interface SavedFile {
  tempPath: string;
  originalName: string;
  size: number;
}

async function saveUploadedFile(file: File): Promise<SavedFile> {
  await ensureUploadDir();
  const buffer = Buffer.from(await file.arrayBuffer());
  const uid = randomUUID().slice(0, 8);
  const ext = path.extname(file.name) || ".xlsx";
  const tempName = `upload_${uid}${ext}`;
  const tempPath = path.join(UPLOAD_DIR, tempName);
  await writeFile(tempPath, buffer);
  return { tempPath, originalName: file.name, size: buffer.length };
}

async function saveMultipleFiles(files: File[]): Promise<SavedFile[]> {
  const saved: SavedFile[] = [];
  for (const file of files) {
    saved.push(await saveUploadedFile(file));
  }
  return saved;
}

async function cleanupFiles(files: SavedFile[]) {
  for (const f of files) {
    try { await unlink(f.tempPath); } catch {}
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string[] }> }
) {
  const { tool: toolParts } = await params;
  const toolName = toolParts.join("/");

  try {
    const contentType = request.headers.get("content-type") || "";

    let args: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const savedFiles: SavedFile[] = [];

      // Save all uploaded files
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          const saved = await saveUploadedFile(value);
          savedFiles.push(saved);
          
          if (key === "files") {
            // Multiple files for merge
            if (!args.files) args.files = [];
            (args.files as string[]).push(saved.tempPath);
          } else if (key === "file") {
            args.filepath = saved.tempPath;
            args.originalName = saved.originalName;
          }
        } else {
          // Regular form field
          let parsedValue: unknown = value;
          
          // Try to parse JSON fields
          if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
            try {
              parsedValue = JSON.parse(value);
            } catch {}
          }
          
          args[key] = parsedValue;
        }
      }

      // Handle merge tool with multiple files
      if (toolName === "merge" && savedFiles.length >= 2) {
        args.files = savedFiles.map(f => f.tempPath);
      }

      // Build args and run Python CLI
      const result = await runPythonCLI(toolName, args);
      
      // Cleanup temp files
      await cleanupFiles(savedFiles);
      
      return NextResponse.json(result);
    } else if (contentType.includes("application/json")) {
      // JSON body (e.g., download-excel)
      const body = await request.json();
      args = { ...body };
      
      const result = await runPythonCLI(toolName, args);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string[] }> }
) {
  const { tool: toolParts } = await params;
  const toolName = toolParts.join("/");
  const url = new URL(request.url);

  try {
    if (toolName === "download") {
      // File download - serve from download directory
      const filename = url.searchParams.get("file");
      if (!filename) {
        return NextResponse.json({ error: "Filename is required" }, { status: 400 });
      }

      const safeName = path.basename(filename);
      const filePath = path.join(process.cwd(), "download", safeName);

      try {
        await stat(filePath);
      } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const buffer = await readFile(filePath);
      const ext = path.extname(safeName).toLowerCase();
      let contentType = "application/octet-stream";
      if (ext === ".xlsx") {
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (ext === ".csv") {
        contentType = "text/csv";
      }

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${safeName}"`,
          "Content-Length": buffer.length.toString(),
        },
      });
    } else if (toolName === "preview") {
      // Preview file
      const filename = url.searchParams.get("file");
      const rows = parseInt(url.searchParams.get("rows") || "50", 10);
      
      const result = await runPythonCLI("preview", { file: filename, rows });
      return NextResponse.json(result);
    } else if (toolName === "history") {
      const result = await runPythonCLI("history_get", {});
      return NextResponse.json(result);
    } else if (toolName === "errors") {
      const result = await runPythonCLI("errors_get", {});
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: `Unknown GET endpoint: ${toolName}` }, { status: 404 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string[] }> }
) {
  const { tool: toolParts } = await params;
  const toolName = toolParts.join("/");
  const url = new URL(request.url);

  try {
    if (toolName === "history") {
      const id = url.searchParams.get("id") || "";
      const result = await runPythonCLI("history_delete", { id });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runPythonCLI(tool: string, args: Record<string, unknown>): Promise<unknown> {
  // Write args to a temp file
  const argsFile = path.join(UPLOAD_DIR, `args_${randomUUID().slice(0, 8)}.json`);
  await ensureUploadDir();
  await writeFile(argsFile, JSON.stringify(args));

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON, [CLI_PATH, tool, argsFile], {
      timeout: 60000, // 60 second timeout
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    if (stderr && process.env.NODE_ENV === "development") {
      console.error(`[Python CLI ${tool}]`, stderr.slice(0, 500));
    }

    try {
      return JSON.parse(stdout);
    } catch {
      return { error: "Failed to parse Python output", raw: stdout.slice(0, 200) };
    }
  } finally {
    // Cleanup args file
    try { await unlink(argsFile); } catch {}
  }
}
