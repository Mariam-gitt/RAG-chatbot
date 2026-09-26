import { describe, it, expect } from "vitest";
import { parseModelResponse } from "@/lib/rag/generateAnswer";
import type { RetrievedChunk } from "@/lib/types";

const chunk: RetrievedChunk = {
  chunkId: "c1",
  documentId: "d1",
  documentName: "policy.pdf",
  pageNumber: 2,
  chunkIndex: 0,
  content: "Refunds are processed within 14 business days.",
  similarity: 0.88,
};

describe("parseModelResponse", () => {
  it("marks a normal answer as grounded and attaches sources", () => {
    const result = parseModelResponse("Refunds take 14 business days.", [chunk]);
    expect(result.isGrounded).toBe(true);
    expect(result.sources).toHaveLength(1);
    expect(result.answer).toBe("Refunds take 14 business days.");
  });

  it("strips the INSUFFICIENT_CONTEXT marker and omits sources", () => {
    const result = parseModelResponse(
      "INSUFFICIENT_CONTEXT: The documents don't mention shipping times.",
      [chunk]
    );
    expect(result.isGrounded).toBe(false);
    expect(result.sources).toHaveLength(0);
    expect(result.answer).not.toContain("INSUFFICIENT_CONTEXT:");
    expect(result.answer).toContain("shipping times");
  });

  it("treats an answer with zero retrieved chunks as ungrounded even without the marker", () => {
    const result = parseModelResponse("Here is a general answer.", []);
    expect(result.isGrounded).toBe(false);
    expect(result.sources).toHaveLength(0);
  });
});
