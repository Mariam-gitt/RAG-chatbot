import { getOpenAIEmbeddingClient } from "@/lib/openai";
import { config } from "@/lib/config";

// Whether a piece of text is the thing being searched FOR (a question) or
// the thing being searched THROUGH (a document chunk). Gemini's embedding
// model is trained to place these two kinds of text differently in vector
// space for better retrieval — matching a query against documents works
// better than treating both the same way. OpenAI's model ignores this
// distinction, so it's a no-op for that provider.
type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// OpenAI's embeddings endpoint accepts a batch of strings per request;
// batching keeps ingestion of a multi-page document to a handful of API
// calls instead of one call per chunk.
const OPENAI_BATCH_SIZE = 96;

// Gemini's free tier is rate-limited (100 requests/minute as of writing),
// so batches are kept smaller and requests are sent one at a time rather
// than fired in parallel.
const GEMINI_BATCH_SIZE = 20;

/**
 * Generates one embedding vector per input string, preserving order
 * (result[i] corresponds to texts[i]). Dispatches to OpenAI or Gemini
 * based on EMBEDDING_PROVIDER (see src/lib/config.ts) — everything that
 * calls this function stays provider-agnostic.
 */
export async function generateEmbeddings(
  texts: string[],
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (config.embedding.provider === "gemini") {
    return generateGeminiEmbeddings(texts, taskType);
  }
  return generateOpenAIEmbeddings(texts);
}

/** Convenience wrapper for embedding a single string. Defaults to the
 * "query" task type since the one-string call site is almost always the
 * user's question (see chat/answerQuestion.ts). */
export async function generateEmbedding(
  text: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_QUERY"
): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text], taskType);
  if (!embedding) {
    throw new Error("Failed to generate embedding.");
  }
  return embedding;
}

async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIEmbeddingClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENAI_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: config.embedding.model,
      input: batch,
    });
    // OpenAI returns results in the same order as the input array.
    for (const item of response.data) {
      embeddings.push(item.embedding);
    }
  }

  return embeddings;
}

async function generateGeminiEmbeddings(
  texts: string[],
  taskType: EmbeddingTaskType
): Promise<number[][]> {
  const embeddings: number[][] = [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.embedding.model}:batchEmbedContents`;

  for (let i = 0; i < texts.length; i += GEMINI_BATCH_SIZE) {
    const batch = texts.slice(i, i + GEMINI_BATCH_SIZE);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Gemini authenticates via this header rather than a Bearer token.
        "x-goog-api-key": config.embedding.apiKey(),
      },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${config.embedding.model}`,
          content: { parts: [{ text }] },
          taskType,
          // Matryoshka representation learning lets Gemini's embedding
          // model produce a smaller vector on request without retraining
          // or losing much quality — asking for exactly the schema's
          // dimensionality here means the DB schema needs no changes.
          outputDimensionality: config.embedding.dimensions,
        })),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini embeddings request failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { embeddings: { values: number[] }[] };
    for (const item of data.embeddings) {
      embeddings.push(item.values);
    }
  }

  return embeddings;
}
