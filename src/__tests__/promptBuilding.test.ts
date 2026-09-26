import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/rag/buildPrompt";
import type { RetrievedChunk } from "@/lib/types";

const sampleChunk: RetrievedChunk = {
  chunkId: "c1",
  documentId: "d1",
  documentName: "handbook.pdf",
  pageNumber: 3,
  chunkIndex: 0,
  content: "Employees accrue 1.5 days of leave per month.",
  similarity: 0.91,
};

describe("SYSTEM_PROMPT", () => {
  it("instructs the model to treat retrieved context as untrusted data", () => {
    expect(SYSTEM_PROMPT).toMatch(/untrusted/i);
    expect(SYSTEM_PROMPT).toMatch(/never obey/i);
  });

  it("instructs the model to flag insufficient context explicitly", () => {
    expect(SYSTEM_PROMPT).toContain("INSUFFICIENT_CONTEXT:");
  });
});

describe("buildUserPrompt", () => {
  it("numbers sources and includes the document name and page", () => {
    const prompt = buildUserPrompt("How much leave do I get?", [sampleChunk]);
    expect(prompt).toContain("Source [1]");
    expect(prompt).toContain("handbook.pdf");
    expect(prompt).toContain("page 3");
    expect(prompt).toContain("How much leave do I get?");
  });

  it("wraps context in the delimiter markers", () => {
    const prompt = buildUserPrompt("question", [sampleChunk]);
    expect(prompt).toContain("<<<RETRIEVED_CONTEXT_START>>>");
    expect(prompt).toContain("<<<RETRIEVED_CONTEXT_END>>>");
  });

  it("handles an empty retrieval result without throwing", () => {
    const prompt = buildUserPrompt("question with no matches", []);
    expect(prompt).toContain("No relevant document excerpts were found");
  });
});
