/**
 * pgvector expects its input literal as the text form "[0.1,0.2,0.3]".
 * Prisma's `Unsupported("vector(1536)")` type means Prisma Client can't
 * bind a JS number[] to that column directly, so every read/write of the
 * embedding column goes through raw SQL using this formatting helper.
 * Centralising it here means there's exactly one place that has to agree
 * with the column's dimensionality.
 */
export function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
