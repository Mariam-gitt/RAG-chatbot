import OpenAI from "openai";
import { config } from "@/lib/config";

// Server-only clients — the API keys are read from server-only env vars
// (never NEXT_PUBLIC_*), so this module must only be imported from server
// code (API routes, other lib/* modules), never from a "use client"
// component.
let chatClient: OpenAI | null = null;
let openAIEmbeddingClient: OpenAI | null = null;

/**
 * Client for chat/generation calls. Groq's API is wire-compatible with
 * OpenAI's (same request/response shapes, same SDK), so switching
 * CHAT_PROVIDER=groq just points the same `openai` SDK at Groq's base URL
 * instead of adding a second SDK dependency for one endpoint.
 */
export function getChatClient(): OpenAI {
  if (!chatClient) {
    chatClient = new OpenAI({
      apiKey: config.chat.apiKey(),
      baseURL: config.chat.provider === "groq" ? "https://api.groq.com/openai/v1" : undefined,
    });
  }
  return chatClient;
}

/**
 * OpenAI's own client, used only when EMBEDDING_PROVIDER=openai. When
 * EMBEDDING_PROVIDER=gemini, embeddings/generateEmbeddings.ts calls
 * Gemini's REST API directly instead (its request format isn't
 * OpenAI-compatible, unlike Groq's chat API).
 */
export function getOpenAIEmbeddingClient(): OpenAI {
  if (!openAIEmbeddingClient) {
    openAIEmbeddingClient = new OpenAI({ apiKey: config.embedding.apiKey() });
  }
  return openAIEmbeddingClient;
}
