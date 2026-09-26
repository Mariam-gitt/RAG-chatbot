import { prisma } from "@/lib/prisma";
import { extractText } from "@/lib/extraction/extractText";
import { chunkDocument } from "@/lib/chunking/chunkText";
import { generateEmbeddings } from "@/lib/embeddings/generateEmbeddings";
import { toPgVectorLiteral } from "@/lib/embeddings/pgvector";
import { randomUUID } from "crypto";

export interface IngestDocumentInput {
  fileName: string;
  fileType: "pdf" | "txt";
  fileSize: number;
  buffer: Buffer;
}

/**
 * Full ingestion pipeline for one uploaded document:
 *   validate (done by the caller) -> extract -> chunk -> embed -> store
 *
 * Runs synchronously within the API request. That's a deliberate
 * simplicity trade-off — see docs/DECISIONS.md ("Synchronous ingestion
 * vs. background job queue") for why, and what to change for large-scale
 * production use.
 *
 * The Document row is created up-front with status=PROCESSING so it's
 * immediately visible in the UI, then flipped to READY or FAILED once
 * the pipeline finishes.
 */
export async function ingestDocument(input: IngestDocumentInput) {
  const document = await prisma.document.create({
    data: {
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      status: "PROCESSING",
    },
  });

  try {
    // 1. Extract text (and page boundaries, when the format has them).
    const extracted = await extractText(input.buffer, input.fileType);

    // 2. Split into overlapping chunks, tagged with their source page.
    const chunks = chunkDocument(extracted.pages);
    if (chunks.length === 0) {
      throw new Error("No text could be chunked from this document.");
    }

    // 3. Embed every chunk. Batched internally to limit API calls.
    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

    // 4. Store chunks + embeddings. Raw SQL is required only for the
    // `embedding` column (see src/lib/embeddings/pgvector.ts); everything
    // else could go through prisma.documentChunk.create as normal.
    await prisma.$transaction(
      chunks.map((chunk, i) => {
        const embedding = embeddings[i];
        if (!embedding) {
          throw new Error(`Missing embedding for chunk ${chunk.chunkIndex}`);
        }
        return prisma.$executeRaw`
          INSERT INTO "DocumentChunk"
            ("id", "documentId", "chunkIndex", "content", "pageNumber", "tokenCount", "embedding")
          VALUES
            (${randomUUID()}, ${document.id}, ${chunk.chunkIndex}, ${chunk.content},
             ${chunk.pageNumber}, ${chunk.tokenCount},
             ${toPgVectorLiteral(embedding)}::vector)
        `;
      })
    );

    return await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "READY",
        pageCount: extracted.pageCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown ingestion error";
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "FAILED", errorMessage: message },
    });
    throw err;
  }
}
