import { describe, it, expect } from "vitest";
import { chunkDocument } from "@/lib/chunking/chunkText";
import type { ExtractedPage } from "@/lib/types";

describe("chunkDocument", () => {
  it("returns a single chunk for text shorter than chunkSize", () => {
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: "short text" }];
    const chunks = chunkDocument(pages, { chunkSize: 1000, overlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("short text");
    expect(chunks[0]?.pageNumber).toBe(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
  });

  it("splits long text into overlapping chunks", () => {
    const longText = Array.from({ length: 50 }, (_, i) => `sentence-${i}`).join(" ");
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: longText }];
    const chunks = chunkDocument(pages, { chunkSize: 100, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    // chunkIndex must be a contiguous, increasing sequence
    chunks.forEach((chunk, i) => expect(chunk.chunkIndex).toBe(i));

    // Overlap means the tail of one chunk should reappear near the start
    // of the next chunk — verify at least one shared word between
    // consecutive chunks so context isn't lost at the boundary.
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentWords = new Set(chunks[i]!.content.split(" "));
      const nextWords = chunks[i + 1]!.content.split(" ");
      const hasOverlap = nextWords.some((w) => currentWords.has(w));
      expect(hasOverlap).toBe(true);
    }
  });

  it("keeps chunkIndex global and increasing across multiple pages", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: "page one content here" },
      { pageNumber: 2, text: "page two content here" },
    ];
    const chunks = chunkDocument(pages, { chunkSize: 1000, overlap: 100 });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.pageNumber).toBe(1);
    expect(chunks[1]?.pageNumber).toBe(2);
    expect(chunks[1]?.chunkIndex).toBe(1);
  });

  it("skips empty pages without producing empty chunks", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: "   " },
      { pageNumber: 2, text: "real content" },
    ];
    const chunks = chunkDocument(pages, { chunkSize: 1000, overlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.pageNumber).toBe(2);
  });

  it("records a token count estimate for every chunk", () => {
    const pages: ExtractedPage[] = [{ pageNumber: null, text: "some txt content" }];
    const chunks = chunkDocument(pages, { chunkSize: 1000, overlap: 100 });
    expect(chunks[0]?.tokenCount).toBeGreaterThan(0);
  });
});
