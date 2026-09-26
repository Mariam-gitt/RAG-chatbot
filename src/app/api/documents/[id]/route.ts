import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // onDelete: Cascade on DocumentChunk.documentId removes all of the
    // document's chunks (and their embeddings) automatically.
    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
