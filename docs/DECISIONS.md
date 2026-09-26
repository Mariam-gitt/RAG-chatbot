# Decisions

Trade-offs made while building this project, why, and what to change
for larger-scale production use.

## Synchronous ingestion vs. a background job queue

**Decision**: `POST /api/documents` runs the entire
extract → chunk → embed → store pipeline synchronously, inside the
request handler.

**Why**: the spec asked for a clean, maintainable architecture "without
unnecessary complexity." A job queue (BullMQ + Redis, or similar) adds
a second running process, a new failure mode (a job silently stuck in
the queue), and infrastructure the project doesn't otherwise need. For
documents in the size range this app targets (a handful of MB, capped
at `MAX_FILE_SIZE_MB`), synchronous processing completes in a few
seconds to tens of seconds — acceptable for a request/response cycle.

**When to change it**: if documents are expected to be large (hundreds
of pages) or uploaded in bulk, or if the HTTP request timeout of your
hosting platform is shorter than ingestion can reliably take, move
ingestion to a background worker. The `Document.status` field
(`PROCESSING` → `READY`/`FAILED`) was designed with this in mind — the
API contract wouldn't need to change, only *what* sets `status` to
`READY` (a worker instead of the request handler).

## In-memory rate limiting vs. a shared store

**Decision**: `src/lib/security/rateLimit.ts` uses a plain
`Map<string, number[]>` in process memory.

**Why**: sufficient to stop one client from hammering the (paid,
per-token) OpenAI API through a single running instance of this app,
with zero added infrastructure.

**When to change it**: this does **not** work correctly across
multiple instances (e.g. behind a load balancer, or serverless
functions that don't share memory) — each instance enforces the limit
independently, so a client could get `maxRequests × instanceCount`
requests through. Replace with a shared store (Redis with a
sliding-window or token-bucket script, or a managed rate-limiting
service) before scaling horizontally.

## Character-based chunking vs. a real tokenizer

**Decision**: `chunkText.ts` measures chunk size in characters, and
estimates token count as `characters / 4`.

**Why**: avoids adding a tokenizer dependency (e.g. `tiktoken`) purely
for chunk-sizing purposes. The `chars/4` heuristic is a widely-used
approximation for English text and is only used for a rough
prompt-budgeting estimate (`TextChunk.tokenCount`), not for anything
that requires precision (billing, hard context-window limits).

**When to change it**: if you need exact token counts (e.g. to pack
chunks as close to a model's context limit as possible without going
over), add `tiktoken` (or the equivalent for your chosen model) and
replace `estimateTokenCount`.

## No LangChain / no agent framework

**Decision**: the RAG pipeline is hand-written (extraction, chunking,
embeddings, retrieval, prompting are each a small, direct module) with
no orchestration framework.

**Why**: the spec explicitly asked for this, and it keeps the core
mechanism visible — every step in `docs/RAG_PIPELINE.md` corresponds to
one function you can open and read, rather than a framework's internal
chain abstraction. For a project of this scope, a framework would add
a dependency and an abstraction layer without saving meaningful code.

**When to change it**: if the app grows to need many chained LLM calls,
multiple retrieval strategies, or agent-style tool use, a framework's
tooling (tracing, retries, structured output parsing) starts to pay for
itself. That's a much larger app than this one.

## Prompt-level prompt-injection defense (not a content filter)

**Decision**: the defense against malicious instructions embedded in
uploaded documents is entirely prompt-level (delimiters + explicit
system-prompt instructions) — see `docs/RAG_PIPELINE.md`.

**Why**: a code-level content filter (e.g. regex-blocking phrases like
"ignore previous instructions") is both easy to evade (endless
rephrasings) and prone to false positives (legitimate documents that
happen to discuss prompt injection, or contain quoted instructions).
The prompt-level defense is the same technique model providers
themselves recommend, and this app's blast radius if it fails is
limited — no tool-calling, code execution, or outbound actions are
wired to model output, so a successful injection can produce a
misleading *answer* at worst.

## Streaming was not implemented

**Decision**: `/api/chat` returns a single JSON response after the full
answer is generated, rather than streaming tokens as they're produced.

**Why**: the spec's core requirements were about correctness and
groundedness of RAG answers, not response latency perception. Streaming
adds meaningful complexity — the API route would need to return a
`ReadableStream`, the client would need to incrementally append partial
text, and citation/source data (which currently arrives as one JSON
payload) would need a different delivery mechanism since sources aren't
known until the full retrieval step completes (which happens *before*
generation anyway, so sources could actually be sent first — but this
still requires restructuring the response format).

**When to change it**: if response latency (a few seconds for
`gpt-4o-mini` to generate a full answer) is a real UX problem, add
streaming: `generateAnswer` would call
`client.chat.completions.create({..., stream: true})` and yield chunks;
the API route would return a `Response` with a streamed body; the
client would read it with the Fetch `ReadableStream` API and append
text incrementally.

## No authentication

**Decision**: there is no login, user accounts, or per-user document
isolation — anyone who can reach the app sees all uploaded documents
and all conversations.

**Why**: out of scope for the spec, which focused on the RAG pipeline
itself. Adding auth is an orthogonal concern (NextAuth.js, Clerk, or a
custom session system) that doesn't change how retrieval or generation
work.

**When to change it**: before deploying anywhere documents might be
sensitive or multi-tenant. At minimum, add a `userId` (or `orgId`)
column to `Document` and `Conversation`, and filter every query by it.

## Pluggable chat/embedding providers

**Decision**: `src/lib/config.ts` reads `CHAT_PROVIDER`
(`"openai"` | `"groq"`) and `EMBEDDING_PROVIDER`
(`"openai"` | `"gemini"`) independently, and `src/lib/openai.ts` /
`src/lib/embeddings/generateEmbeddings.ts` branch on them.

**Why**: OpenAI's API isn't free — a real constraint for a student or
hobby project. Two free, no-credit-card alternatives cover the two
things this app needs:

- **Groq** for chat/generation. Its API is wire-compatible with
  OpenAI's Chat Completions format, so `getChatClient()` reuses the
  same `openai` npm package and just points `baseURL` at
  `https://api.groq.com/openai/v1` — no second SDK dependency needed.
- **Gemini** for embeddings. Groq's API has **no embeddings endpoint**
  at all (confirmed against its own API reference — chat, audio,
  batches, files, fine-tuning, but no `/embeddings`), so Groq alone
  can't fully replace OpenAI here. Google's `gemini-embedding-001`
  has a genuine free tier and, via Matryoshka Representation Learning,
  can be asked for exactly 1536 output dimensions — matching this
  project's schema (`vector(1536)`) with zero migration changes.

Because Gemini's embedding model is trained on an asymmetric
retrieval objective, `generateEmbeddings()` also threads through a
`taskType` (`RETRIEVAL_DOCUMENT` for chunks, `RETRIEVAL_QUERY` for the
user's question) — OpenAI's model ignores this, so it's a no-op on
that path.

**Trade-offs**: Gemini's free tier is more rate-limited (100
requests/minute) than OpenAI's paid tier, so embedding a very large
document takes longer (batched at 20 chunks/request instead of 96).
Groq's free tier is also rate-limited per-minute; both are generous
enough for interactive, single-user use but not for high-volume
production traffic.

**When to change it**: switch back to `CHAT_PROVIDER="openai"` /
`EMBEDDING_PROVIDER="openai"` once billing is set up, or once free-tier
rate limits become a bottleneck — no code changes needed, just the
`.env` values.

## Known dependency vulnerability (documented, not silently ignored)

**Decision**: `next@15.5.26` (the latest stable patch of the 15.x line
at build time) still bundles an outdated internal `postcss@8.4.31`,
which `npm audit` flags as moderate severity (a source-map path
disclosure issue relevant to PostCSS's own comment-parsing, not to this
app's request handling). This is a transitive dependency *inside*
Next.js's own build tooling, not a direct dependency of this project —
the project's own `postcss` (used by Tailwind) is already on the
patched `8.5.28`.

**Why not fixed here**: the only way to remove it entirely is upgrading
to Next.js 16, a major version bump that changes several APIs (this
project was written against Next 15's App Router conventions) and
wasn't attempted in this pass to avoid destabilizing reviewed, tested
code without the ability to fully re-verify a major-version migration.

**When to change it**: before a production deployment, evaluate
upgrading to Next.js 16 (check the official upgrade guide for breaking
changes to route handlers, `next.config.js` options, and middleware),
or confirm the specific advisory doesn't apply to your deployment
environment.
