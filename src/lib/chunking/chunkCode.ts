import { config } from "@/lib/config";
import type { ExtractedPage, TextChunk } from "@/lib/types";

/**
 * Chunker for source code. Unlike chunkDocument (built for prose, which
 * squashes all whitespace), this keeps line breaks and indentation, and
 * prefers to cut at blank lines so functions tend to stay together.
 * Every chunk starts with the file path so the path is searchable too.
 */
export function chunkCode(pages: ExtractedPage[], filePath: string): TextChunk[] {
  const max = config.rag.chunkSize;
  const header = `// File: ${filePath}\n`;
  const chunks: TextChunk[] = [];

  const push = (body: string) => {
    if (!body.trim()) return;
    const content = header + body.trimEnd();
    chunks.push({
      chunkIndex: chunks.length,
      content,
      pageNumber: null,
      tokenCount: Math.ceil(content.length / 4),
    });
  };

  for (const page of pages) {
    let current = "";
    for (const rawLine of page.text.split(/\r?\n/)) {
      // Hard-split absurdly long lines (e.g. minified code).
      const parts: string[] = [];
      for (let i = 0; i < rawLine.length || i === 0; i += max) {
        parts.push(rawLine.slice(i, i + max));
      }

      for (const line of parts) {
        const tooBig = current.length + line.length + 1 > max;
        const goodBreak = line.trim() === "" && current.length > max * 0.6;
        if (current && (tooBig || goodBreak)) {
          push(current);
          current = "";
        }
        current += line + "\n";
      }
    }
    push(current);
  }

  return chunks;
}
