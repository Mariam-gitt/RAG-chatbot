import { getChatClient } from "@/lib/openai";
import { config } from "@/lib/config";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/rag/buildPrompt";
import type { ChatAnswer, RetrievedChunk, SourceReference } from "@/lib/types";

const INSUFFICIENT_MARKER = "INSUFFICIENT_CONTEXT:";

/**
 * Pure post-processing of the model's raw text into a ChatAnswer. Kept
 * separate from the OpenAI call itself so this logic — the part that
 * actually decides "was this grounded, should sources be shown" — can be
 * unit-tested without mocking a network call. See
 * src/__tests__/generateAnswer.test.ts.
 */
export function parseModelResponse(rawAnswer: string, chunks: RetrievedChunk[]): ChatAnswer {
  const trimmed = rawAnswer.trim();
  const isGrounded = chunks.length > 0 && !trimmed.startsWith(INSUFFICIENT_MARKER);

  const answer = trimmed.startsWith(INSUFFICIENT_MARKER)
    ? trimmed.slice(INSUFFICIENT_MARKER.length).trim()
    : trimmed;

  const sources: SourceReference[] = isGrounded
    ? chunks.map((chunk) => ({
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        snippet: chunk.content.slice(0, 240),
      }))
    : [];

  return { answer, sources, isGrounded };
}

/**
 * Calls the chat model with the grounded system prompt + retrieved
 * context, then post-processes the raw text into a ChatAnswer:
 *  - strips the internal INSUFFICIENT_CONTEXT: marker from the text the
 *    user sees, but records it as `isGrounded: false`
 *  - only returns `sources` when the answer was actually grounded, so
 *    the UI never shows source cards next to "I don't know" (an
 *    "insufficient context" answer citing sources would be misleading).
 */
export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[]
): Promise<ChatAnswer> {
  const client = getChatClient();

  const completion = await client.chat.completions.create({
    model: config.chat.model,
    temperature: 0.2, // low temperature: favor faithfulness over creativity
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(question, chunks) },
    ],
  });

  const rawAnswer = completion.choices[0]?.message?.content ?? "";
  return parseModelResponse(rawAnswer, chunks);
}
