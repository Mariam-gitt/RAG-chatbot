// Centralised, validated environment configuration.
//
// Every other module reads tunable values (chunk size, top-K, model names)
// from here instead of calling `process.env` directly. That keeps env-var
// parsing and defaults in exactly one place.

function requireEnv(name: string): string {
  // Fails fast at startup/first-use instead of failing deep inside a
  // request with a confusing "undefined is not a function" error.
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

type ChatProvider = "openai" | "groq";
type EmbeddingProvider = "openai" | "gemini";

function readProvider<T extends string>(envVar: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[envVar] as T | undefined;
  return raw && (allowed as readonly string[]).includes(raw) ? raw : fallback;
}

// Both providers are swappable independently via env vars, so a project
// can start on free tiers (Groq for chat, Gemini for embeddings) and move
// to OpenAI later — or mix and match — without touching application code.
// See docs/DECISIONS.md, "Pluggable chat/embedding providers."
const chatProvider = readProvider<ChatProvider>("CHAT_PROVIDER", ["openai", "groq"], "openai");
const embeddingProvider = readProvider<EmbeddingProvider>(
  "EMBEDDING_PROVIDER",
  ["openai", "gemini"],
  "openai"
);

export const config = {
  chat: {
    provider: chatProvider,
    model:
      process.env.CHAT_MODEL ||
      // (chatProvider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini"),
      (chatProvider === "groq" ? "openai/gpt-oss-120b" : "gpt-4o-mini"),
    // Lazily-read so this module can be imported without throwing until a
    // key is actually needed (e.g. on the client, or before .env is set).
    apiKey: () => requireEnv(chatProvider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY"),
  },

  embedding: {
    provider: embeddingProvider,
    model:
      process.env.EMBEDDING_MODEL ||
      (embeddingProvider === "gemini" ? "gemini-embedding-001" : "text-embedding-3-small"),
    // Must match the `vector(N)` dimension in prisma/schema.prisma and the
    // migration. Both OpenAI's text-embedding-3-small and Gemini's
    // gemini-embedding-001 support 1536, so the default schema works with
    // either provider unchanged — only change this (and re-migrate) if you
    // pick a model/dimension combination other than the defaults below.
    dimensions: intEnv("EMBEDDING_DIMENSIONS", 1536),
    apiKey: () => requireEnv(embeddingProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"),
  },

  rag: {
    topK: intEnv("RAG_TOP_K", 5),
    chunkSize: intEnv("RAG_CHUNK_SIZE", 1000), // characters
    chunkOverlap: intEnv("RAG_CHUNK_OVERLAP", 150), // characters
  },

  uploads: {
    maxFileSizeBytes: intEnv("MAX_FILE_SIZE_MB", 10) * 1024 * 1024,
    allowedExtensions: ["pdf", "txt"] as const,
  },

  rateLimit: {
    maxRequests: intEnv("RATE_LIMIT_MAX_REQUESTS", 20),
    windowMs: intEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  },
};
