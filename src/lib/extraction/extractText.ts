import type { ExtractedDocument, ExtractedPage } from "@/lib/types";

/**
 * Extracts plain text from an uploaded file buffer, preserving page
 * boundaries when the format has them (PDF). This is the only module
 * that knows about file-format-specific parsing — everything downstream
 * (chunking, embedding) works with plain ExtractedPage[] and doesn't
 * care whether the source was a PDF or a .txt file.
 */
export async function extractText(
  buffer: Buffer,
  extension: "pdf" | "txt" | "md"
): Promise<ExtractedDocument> {
  if (extension === "txt" || extension === "md") {
    return extractFromTxt(buffer);
  }
  return extractFromPdf(buffer);
}

function extractFromTxt(buffer: Buffer): ExtractedDocument {
  const text = buffer.toString("utf-8").trim();
  if (!text) {
    throw new Error("The text file has no readable content.");
  }
  // Plain text has no page concept, so we model it as a single page with
  // pageNumber = null (the UI shows no page badge for these chunks).
  const page: ExtractedPage = { pageNumber: null, text };
  return { pages: [page], pageCount: null };
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractedDocument> {
  // pdf-parse is a thin wrapper around pdf.js. It doesn't split text by
  // page out of the box, but it accepts a `pagerender` hook that runs
  // once per page — we use that to build our own per-page text array
  // instead of pulling in a heavier PDF library.
  const pdfParse = (await import("pdf-parse")).default;

  const pages: ExtractedPage[] = [];

  try {
    const result = await pdfParse(buffer, {
      pagerender: async (pageData: PdfPageData) => {
        const textContent = await pageData.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        pages.push({ pageNumber: pages.length + 1, text: pageText });
        // pdf-parse concatenates whatever we return into its own
        // `.text` field; we don't use that field, but must return a string.
        return pageText;
      },
    });

    const nonEmptyPages = pages.filter((p) => p.text.trim().length > 0);

    if (nonEmptyPages.length === 0) {
      throw new Error(
        "No extractable text found in this PDF. It may be a scanned/image-only document."
      );
    }

    return { pages: nonEmptyPages, pageCount: result.numpages };
  } catch (err) {
    if (err instanceof Error && err.message.includes("No extractable text")) {
      throw err;
    }
    throw new Error(
      `Failed to parse PDF: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}

// Minimal shape of the object pdf-parse/pdf.js passes into `pagerender`.
// pdf-parse ships without types, so we declare just what we use.
interface PdfPageData {
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
}
