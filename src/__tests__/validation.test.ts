import { describe, it, expect } from "vitest";
import { validateUploadedFile, chatRequestSchema } from "@/lib/validation";

describe("validateUploadedFile", () => {
  it("rejects unsupported extensions", () => {
    const result = validateUploadedFile({
      fileName: "doc.docx",
      fileSize: 100,
      buffer: Buffer.from("hello"),
    });
    expect(result.valid).toBe(false);
  });

  it("rejects empty files", () => {
    const result = validateUploadedFile({
      fileName: "doc.txt",
      fileSize: 0,
      buffer: Buffer.from(""),
    });
    expect(result.valid).toBe(false);
  });

  it("rejects files over the size limit", () => {
    const result = validateUploadedFile({
      fileName: "doc.txt",
      fileSize: 999 * 1024 * 1024,
      buffer: Buffer.from("hello"),
    });
    expect(result.valid).toBe(false);
  });

  it("accepts a valid small txt file", () => {
    const result = validateUploadedFile({
      fileName: "notes.txt",
      fileSize: 5,
      buffer: Buffer.from("hello"),
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.extension).toBe("txt");
  });

  it("accepts a valid pdf extension", () => {
    const result = validateUploadedFile({
      fileName: "report.PDF",
      fileSize: 5,
      buffer: Buffer.from("hello"),
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.extension).toBe("pdf");
  });
});

describe("chatRequestSchema", () => {
  it("rejects an empty question", () => {
    const result = chatRequestSchema.safeParse({ question: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a question over the max length", () => {
    const result = chatRequestSchema.safeParse({ question: "a".repeat(3000) });
    expect(result.success).toBe(false);
  });

  it("accepts a valid question without a conversationId", () => {
    const result = chatRequestSchema.safeParse({ question: "What is in the document?" });
    expect(result.success).toBe(true);
  });
});
