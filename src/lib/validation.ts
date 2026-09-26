import { z } from "zod";
import { config } from "@/lib/config";

// --- Upload validation ------------------------------------------------

export interface FileValidationInput {
  fileName: string;
  fileSize: number; // bytes
  buffer: Buffer;
}

export type FileValidationResult =
  | { valid: true; extension: "pdf" | "txt" }
  | { valid: false; error: string };

/**
 * Validates an uploaded file BEFORE we spend any time/money extracting
 * text or calling OpenAI. Checked, in order: extension, size, emptiness.
 * Malformed-content checks (e.g. a corrupt PDF) happen later in the
 * extraction step, since that's the only place that actually knows how
 * to parse the format.
 */
export function validateUploadedFile(input: FileValidationInput): FileValidationResult {
  const extension = input.fileName.split(".").pop()?.toLowerCase();

  if (!extension || !config.uploads.allowedExtensions.includes(extension as "pdf" | "txt")) {
    return { valid: false, error: "Only .pdf and .txt files are supported." };
  }

  if (input.fileSize <= 0 || input.buffer.length === 0) {
    return { valid: false, error: "The uploaded file is empty." };
  }

  if (input.fileSize > config.uploads.maxFileSizeBytes) {
    const maxMb = config.uploads.maxFileSizeBytes / (1024 * 1024);
    return { valid: false, error: `File exceeds the ${maxMb}MB size limit.` };
  }

  return { valid: true, extension: extension as "pdf" | "txt" };
}

// --- API request validation --------------------------------------------

export const chatRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question cannot be empty.")
    .max(2000, "Question is too long (max 2000 characters)."),
  conversationId: z.string().cuid().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
