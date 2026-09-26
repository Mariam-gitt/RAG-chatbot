# Code Walkthrough

For every non-trivial file: what it does, why it exists, its
inputs/outputs, its important functions, what calls it, and what it
calls. Trivial/boilerplate files (`layout.tsx`, config files) are
skipped; everything that carries real logic is here.

---

## `src/lib/config.ts`

**What/why**: single place that reads `process.env` and applies
defaults, so every other module imports typed, defaulted config
instead of calling `process.env.X` directly (which would scatter
parsing/defaulting logic everywhere and make it easy for two modules to
disagree on a default).

**Exports**: `config` object — `openaiApiKey()` (a function, not a
value, so importing this module doesn't crash when `OPENAI_API_KEY`
isn't set yet — it only throws when actually called), `embeddingModel`,
`embeddingDimensions`, `chatModel`, `rag.{topK,chunkSize,chunkOverlap}`,
`uploads.{maxFileSizeBytes,allowedExtensions}`, `rateLimit.{maxRequests,windowMs}`.

**Called by**: almost every other `lib/` module.
**Calls**: nothing (leaf module).

---

## `src/lib/prisma.ts`

**What/why**: exports a single shared `PrismaClient` instance. Next.js
hot-reloads server modules in dev, which would otherwise instantiate a
new `PrismaClient` (and a new DB connection pool) on every save; caching
it on `globalThis` survives the reload.

**Exports**: `prisma`.
**Called by**: every module that touches the database.
**Calls**: `@prisma/client`.

---

## `src/lib/openai.ts`

**What/why**: exports the two LLM clients used by this app. Server-only —
the API keys never reach the browser because this file is only ever
imported by other server-side modules (API routes, `lib/*`), never by a
`"use client"` component.

**Exports**:
- `getChatClient()` — an `openai` SDK client for chat/generation, pointed
  at OpenAI or Groq depending on `CHAT_PROVIDER` (Groq's API is
  wire-compatible with OpenAI's, so no second SDK is needed — see
  `docs/DECISIONS.md`, "Pluggable chat/embedding providers").
- `getOpenAIEmbeddingClient()` — OpenAI's client, used only when
  `EMBEDDING_PROVIDER=openai` (Gemini embeddings are called directly via
  `fetch` in `embeddings/generateEmbeddings.ts` instead, since Gemini's
  request format isn't OpenAI-compatible).

**Called by**: `embeddings/generateEmbeddings.ts`, `rag/generateAnswer.ts`.
**Calls**: `config.chat.apiKey()` / `config.embedding.apiKey()`.

---

## `src/lib/types.ts`

**What/why**: shared TypeScript interfaces used across lib, API routes,
and client components (`RetrievedChunk`, `SourceReference`,
`ChatAnswer`, `ExtractedPage`, `ExtractedDocument`, `TextChunk`). Having
one definition of "what a source looks like" avoids each layer
inventing a slightly different shape.

**Called by**: nearly everything (type-only import, no runtime cost).

---

## `src/lib/validation.ts`

**What/why**: all input validation in one place, checked *before* any
expensive work (extraction, embeddings, OpenAI calls) happens.

**Functions**:
- `validateUploadedFile({fileName, fileSize, buffer})` → checks
  extension (`.pdf`/`.txt` only), non-zero size, and the configured max
  size, in that order. Does **not** check whether the file content is
  well-formed (a corrupt PDF passes this check) — that's deliberately
  left to `extractText`, the only module that actually knows how to
  parse the format, so validation logic doesn't need to duplicate
  parser internals.
- `chatRequestSchema` (a zod schema) — validates `{question, conversationId?}`:
  non-empty trimmed question, max 2000 characters, optional cuid
  conversation id.

**Called by**: `app/api/documents/route.ts` (POST), `app/api/chat/route.ts`.
**Calls**: `config.uploads.*`.
**Tests**: `src/__tests__/validation.test.ts`.

---

## `src/lib/extraction/extractText.ts`

**What/why**: the only format-aware module — turns a raw file buffer
into `ExtractedDocument { pages: ExtractedPage[], pageCount }`.
Everything downstream works with plain text + optional page numbers and
doesn't know or care whether the source was a PDF or `.txt`.

**Functions**:
- `extractText(buffer, extension)` — dispatches to one of the two below.
- `extractFromTxt(buffer)` — UTF-8 decode, trim, wrap as one page with
  `pageNumber: null`. Throws if the result is empty.
- `extractFromPdf(buffer)` — uses `pdf-parse`'s `pagerender` hook (which
  fires once per page while `pdf.js` parses the file) to build our own
  per-page text array. Filters out blank pages; throws a clear error if
  *no* page has extractable text (e.g. a scanned/image-only PDF with no
  OCR layer), and wraps any parser exception in a more actionable
  message.

**Inputs**: `Buffer`, `"pdf" | "txt"`.
**Outputs**: `ExtractedDocument`.
**Called by**: `documents/ingestDocument.ts`.
**Calls**: `pdf-parse` (dynamically imported, PDF path only).

---

## `src/lib/chunking/chunkText.ts`

**What/why**: pure function (no I/O), which is exactly why it's the
most thoroughly unit-tested module in the project — chunking bugs are
subtle (off-by-one boundaries, lost text, wrong page tags) and easy to
verify in isolation.

**Functions**:
- `estimateTokenCount(text)` — `chars / 4` heuristic, no tokenizer
  dependency.
- `chunkPageText(text, chunkSize, overlap)` — splits **one page's**
  normalized text into overlapping substrings, breaking on the nearest
  preceding space so words aren't split.
- `chunkDocument(pages, options?)` — the exported entry point. Runs
  `chunkPageText` per page, tags each resulting chunk with that page's
  number, and assigns a `chunkIndex` that increases monotonically
  across the whole document (not reset per page).

**Inputs**: `ExtractedPage[]`, optional `{chunkSize, overlap}` override.
**Outputs**: `TextChunk[]`.
**Called by**: `documents/ingestDocument.ts`.
**Calls**: `config.rag.{chunkSize,chunkOverlap}` (defaults only).
**Tests**: `src/__tests__/chunking.test.ts` (5 tests: short text, long
text overlap, multi-page indexing, empty-page skipping, token estimate).

---

## `src/lib/embeddings/generateEmbeddings.ts`

**What/why**: wraps embedding generation with batching, and dispatches to
OpenAI or Gemini based on `EMBEDDING_PROVIDER` — every caller stays
provider-agnostic.

**Functions**:
- `generateEmbeddings(texts, taskType?)` — batches into groups of 96
  (OpenAI) or 20 (Gemini's more rate-limited free tier), preserves input
  order in the output. `taskType` (`RETRIEVAL_DOCUMENT` /
  `RETRIEVAL_QUERY`) only affects Gemini, whose model is trained to place
  queries and documents differently in vector space for better retrieval.
- `generateEmbedding(text, taskType?)` — single-string convenience
  wrapper (used for embedding the user's question; defaults to
  `RETRIEVAL_QUERY`).

**Called by**: `documents/ingestDocument.ts` (documents, default
`RETRIEVAL_DOCUMENT`), `chat/answerQuestion.ts` (the question).
**Calls**: `openai.ts` (OpenAI path) or Gemini's REST API directly via
`fetch` (Gemini path), `config.embedding.*`.

---

## `src/lib/embeddings/pgvector.ts`

**What/why**: exactly one function, because exactly one thing needs to
agree with the column's dimensionality and pgvector's literal format.

**Functions**: `toPgVectorLiteral(embedding: number[])` → `"[0.1,0.2,...]"`.

**Called by**: `documents/ingestDocument.ts`, `retrieval/vectorSearch.ts`.

---

## `src/lib/documents/ingestDocument.ts`

**What/why**: the ingestion orchestrator — the single function that
calls extraction → chunking → embedding → storage in order, and is the
*only* place that decides how a `Document` row's status transitions.

**Functions**: `ingestDocument({fileName, fileType, fileSize, buffer})`:
1. Creates the `Document` row with `status: "PROCESSING"`.
2. `extractText` → `chunkDocument` → `generateEmbeddings`.
3. Inserts all chunks in one `prisma.$transaction` of raw
   `INSERT ... ::vector` statements (all-or-nothing: a mid-way failure
   never leaves a document with some chunks embedded and some missing).
4. On success: updates the `Document` to `status: "READY"` with
   `pageCount`. On any thrown error: updates it to `status: "FAILED"`
   with `errorMessage`, then re-throws so the API route also returns an
   error response.

**Inputs**: `IngestDocumentInput`. **Outputs**: the updated `Document` row.
**Called by**: `app/api/documents/route.ts` (POST).
**Calls**: `prisma`, `extractText`, `chunkDocument`, `generateEmbeddings`, `toPgVectorLiteral`.

---

## `src/lib/retrieval/vectorSearch.ts`

**What/why**: the one place that knows the actual SQL for similarity
search, so retrieval logic isn't duplicated anywhere else.

**Functions**: `findSimilarChunks(queryEmbedding, topK?)` — raw
`$queryRaw` join of `DocumentChunk` and `Document`, filtered to
`status = 'READY'`, ordered by pgvector's `<=>` cosine distance,
limited to `topK`. Converts distance → similarity before returning.

**Inputs**: `number[]`, optional `topK` (defaults to `config.rag.topK`).
**Outputs**: `RetrievedChunk[]`.
**Called by**: `chat/answerQuestion.ts`.
**Calls**: `prisma`, `toPgVectorLiteral`.

---

## `src/lib/rag/buildPrompt.ts`

**What/why**: the only place the system prompt and context-formatting
logic live, so the "how do we ground the model and defend against
prompt injection" logic is auditable in one file rather than inlined
into the generation call.

**Exports**:
- `SYSTEM_PROMPT` — the fixed instruction set (answer only from
  context, flag insufficient context with a specific marker, treat
  context as untrusted data, number sources).
- `buildUserPrompt(question, chunks)` — formats chunks as
  `Source [n] (from "doc.pdf", page 3): ...`, wraps them in
  `<<<RETRIEVED_CONTEXT_START/END>>>` markers, and appends the
  question. Handles the zero-chunks case explicitly.

**Called by**: `rag/generateAnswer.ts`.
**Tests**: `src/__tests__/promptBuilding.test.ts`.

---

## `src/lib/rag/generateAnswer.ts`

**What/why**: calls the chat model and turns its raw text into the
structured `ChatAnswer` the rest of the app uses — critically, this is
where "was this answer actually grounded" gets decided.

**Functions**:
- `generateAnswer(question, chunks)` — calls
  `chat.completions.create` with `SYSTEM_PROMPT` + `buildUserPrompt(...)`
  at `temperature: 0.2`, then delegates to `parseModelResponse`.
- `parseModelResponse(rawAnswer, chunks)` — **pure function**,
  deliberately separated from the network call so it can be unit-tested
  without mocking OpenAI. Detects the `INSUFFICIENT_CONTEXT:` prefix,
  strips it from the user-visible text, sets `isGrounded` accordingly
  (also `false` when zero chunks were retrieved, even without the
  marker — a defensive fallback), and only attaches `sources` when
  `isGrounded` is true.

**Inputs**: `string`, `RetrievedChunk[]`. **Outputs**: `ChatAnswer`.
**Called by**: `chat/answerQuestion.ts`.
**Calls**: `openai.ts`, `buildPrompt.ts`.
**Tests**: `src/__tests__/generateAnswer.test.ts` (grounded case,
insufficient-context case, zero-chunks case).

---

## `src/lib/chat/answerQuestion.ts`

**What/why**: the question-answering orchestrator, mirroring
`ingestDocument.ts`'s role on the other side of the pipeline.

**Functions**: `answerQuestion({question, conversationId?})`:
1. Finds the existing `Conversation` or creates one (titled from the
   first 80 characters of the question).
2. Persists the user's `Message`.
3. `generateEmbedding(question)` → `findSimilarChunks` → `generateAnswer`.
4. Persists the assistant's `Message` (with `sources` as JSON).
5. Returns `{conversationId, messageId, answer, sources, isGrounded}`.

**Called by**: `app/api/chat/route.ts`.
**Calls**: `prisma`, `generateEmbedding`, `findSimilarChunks`, `generateAnswer`.

---

## `src/lib/security/rateLimit.ts`

**What/why**: minimal in-memory sliding-window limiter, keyed by client
IP, so a single client can't hammer the (paid, per-token) OpenAI API
through this app. See `docs/DECISIONS.md` for why this is intentionally
not production-grade for multi-instance deployments.

**Functions**: `checkRateLimit(clientKey)`, `getClientKey(request)`
(reads `x-forwarded-for` / `x-real-ip`).
**Called by**: `app/api/documents/route.ts` (POST), `app/api/chat/route.ts`.

---

## API routes (`src/app/api/**/route.ts`)

Each route is intentionally thin:

- **`documents/route.ts`**: `GET` lists documents (with chunk counts);
  `POST` rate-limits, parses `multipart/form-data`, validates the file,
  calls `ingestDocument`, returns 201/400/429/500 as appropriate.
- **`documents/[id]/route.ts`**: `DELETE` removes a `Document` (cascade
  deletes its chunks).
- **`chat/route.ts`**: `POST` rate-limits, validates with
  `chatRequestSchema`, calls `answerQuestion`, returns its result.
- **`conversations/route.ts`**: `GET` lists conversations.
- **`conversations/[id]/route.ts`**: `GET` returns one conversation with
  its full message history.

None of these files import OpenAI or write raw SQL directly — that
separation is what makes the `lib/` modules independently unit-testable.

---

## Frontend (`src/components/*`, `src/app/page.tsx`)

- **`page.tsx`**: top-level client component; owns the `documents` list
  state and re-fetches it after upload/delete. Renders a sidebar
  (`DocumentUpload` + `DocumentList`) and the `ChatWindow`.
- **`DocumentUpload.tsx`**: file input → `POST /api/documents` (as
  `FormData`) → calls `onUploaded()` to refresh the parent's list.
- **`DocumentList.tsx`**: renders status badges (`PROCESSING` /
  `READY` / `FAILED`) and a delete button per document.
- **`ChatWindow.tsx`**: owns message state and `conversationId`
  internally; `POST /api/chat` on submit, appends the returned answer
  (with its sources) to the message list.
- **`MessageBubble.tsx`** / **`SourceCard.tsx`**: presentational only.

---

## Two end-to-end traces (as requested by the spec)

**Upload → extraction → chunking → embedding → DB**:
`DocumentUpload.tsx` (file input)
→ `POST /api/documents` (`app/api/documents/route.ts`)
→ `validateUploadedFile` (`lib/validation.ts`)
→ `ingestDocument` (`lib/documents/ingestDocument.ts`), which calls, in order:
→ `extractText` (`lib/extraction/extractText.ts`)
→ `chunkDocument` (`lib/chunking/chunkText.ts`)
→ `generateEmbeddings` (`lib/embeddings/generateEmbeddings.ts`)
→ raw SQL `INSERT` into `DocumentChunk` (back in `ingestDocument.ts`)
→ `Document` row updated to `READY`.

**Question → embedding → retrieval → context → LLM → answer → sources**:
`ChatWindow.tsx` (submit)
→ `POST /api/chat` (`app/api/chat/route.ts`)
→ `chatRequestSchema.safeParse` (`lib/validation.ts`)
→ `answerQuestion` (`lib/chat/answerQuestion.ts`), which calls, in order:
→ `generateEmbedding` (`lib/embeddings/generateEmbeddings.ts`)
→ `findSimilarChunks` (`lib/retrieval/vectorSearch.ts`)
→ `buildUserPrompt` (`lib/rag/buildPrompt.ts`)
→ `generateAnswer` → `parseModelResponse` (`lib/rag/generateAnswer.ts`)
→ `Message` rows persisted (back in `answerQuestion.ts`)
→ JSON response → `MessageBubble` + `SourceCard` render the answer and its sources.
