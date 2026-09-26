import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUploadedFile } from "@/lib/validation";
import { ingestDocument } from "@/lib/documents/ingestDocument";
import { checkRateLimit, getClientKey } from "@/lib/security/rateLimit";

// This route only orchestrates HTTP concerns (parsing the request,
// mapping errors to status codes). All real logic lives in
// src/lib/documents/ingestDocument.ts and src/lib/validation.ts, so it
// can be unit-tested without spinning up Next.js.

export async function GET() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      status: true,
      pageCount: true,
      errorMessage: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
  });
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const validation = validateUploadedFile({
    fileName: file.name,
    fileSize: file.size,
    buffer,
  });

  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const document = await ingestDocument({
      fileName: file.name,
      fileType: validation.extension,
      fileSize: file.size,
      buffer,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    // ingestDocument already recorded the failure on the Document row
    // (status=FAILED, errorMessage set) — we still return a 500 so the
    // client's upload UI shows an immediate error too.
    const message = err instanceof Error ? err.message : "Ingestion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
