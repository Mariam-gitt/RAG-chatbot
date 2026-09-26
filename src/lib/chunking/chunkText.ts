import { config } from "@/lib/config";
import type { ExtractedPage, TextChunk } from "@/lib/types";

// Very rough token estimate (no tokenizer dependency): ~4 characters per
// token is a commonly-used approximation for English text and is good
// enough for prompt-budgeting purposes here.
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits one page's text into overlapping chunks of roughly `chunkSize`
 * characters, breaking on whitespace so words aren't cut in half.
 * Overlap means the tail of one chunk repeats at the start of the next,
 * so an idea that spans a chunk boundary isn't lost to either chunk.
 */
function chunkPageText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= chunkSize) {
    return normalized.length > 0 ? [normalized] : [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    // Prefer to break on a space so we don't split a word across chunks.
    if (end < normalized.length) {
      const lastSpace = normalized.lastIndexOf(" ", end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) break;

    // Step forward by (chunkSize - overlap) so the next chunk starts
    // `overlap` characters before where this one ended.
    start = end - overlap;
    if (start <= 0 || start >= normalized.length) break;
  }

  return chunks;
}

/**
 * Chunks an entire extracted document (all pages) into a flat, globally
 * ordered list of TextChunks, each still tagged with the page it came
 * from. Page order is preserved; chunkIndex increases monotonically
 * across the whole document so chunks can be displayed/retrieved in
 * original reading order.
 */
export function chunkDocument(
  pages: ExtractedPage[],
  options?: { chunkSize?: number; overlap?: number }
): TextChunk[] {
  const chunkSize = options?.chunkSize ?? config.rag.chunkSize;
  const overlap = options?.overlap ?? config.rag.chunkOverlap;

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const pageChunks = chunkPageText(page.text, chunkSize, overlap);
    for (const content of pageChunks) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content,
        pageNumber: page.pageNumber,
        tokenCount: estimateTokenCount(content),
      });
    }
  }

  return chunks;
}
