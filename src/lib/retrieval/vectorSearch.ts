import { prisma } from "@/lib/prisma";
import { toPgVectorLiteral } from "@/lib/embeddings/pgvector";
import { config } from "@/lib/config";
import type { RetrievedChunk } from "@/lib/types";

// Raw row shape returned by the similarity-search SQL below.
interface ChunkSearchRow {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
  distance: number; // cosine distance, 0 = identical, 2 = opposite
}

/**
 * Finds the top-K chunks whose embeddings are closest to `queryEmbedding`
 * by cosine distance, using pgvector's `<=>` operator (which the
 * `DocumentChunk_embedding_idx` ivfflat index in the initial migration
 * accelerates). Only chunks belonging to a READY document are searched,
 * so a document that's still being ingested (or failed) never shows up
 * as a partial/broken source.
 */
export async function findSimilarChunks(
  queryEmbedding: number[],
  topK: number = config.rag.topK
): Promise<RetrievedChunk[]> {
  const vectorLiteral = toPgVectorLiteral(queryEmbedding);

  const rows = await prisma.$queryRaw<ChunkSearchRow[]>`
    SELECT
      c."id"          AS "chunkId",
      c."documentId"  AS "documentId",
      d."fileName"    AS "documentName",
      c."pageNumber"  AS "pageNumber",
      c."chunkIndex"  AS "chunkIndex",
      c."content"     AS "content",
      c."embedding" <=> ${vectorLiteral}::vector AS "distance"
    FROM "DocumentChunk" c
    JOIN "Document" d ON d."id" = c."documentId"
    WHERE d."status" = 'READY'
    ORDER BY c."embedding" <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `;

  return rows.map((row: ChunkSearchRow) => ({
    chunkId: row.chunkId,
    documentId: row.documentId,
    documentName: row.documentName,
    pageNumber: row.pageNumber,
    chunkIndex: row.chunkIndex,
    content: row.content,
    // Cosine distance -> similarity so callers/UI deal in "higher is
    // better" (0..1) instead of "lower is better" (0..2).
    similarity: 1 - row.distance / 2,
  }));
}
