# Exam / Viva Prep — Q&A

Likely questions about this codebase, with answers referencing the
actual files.

### Q: What does RAG stand for, and why not just ask the LLM directly?

Retrieval-Augmented Generation. The LLM alone only knows what it saw
during training — it has never seen your uploaded documents. RAG
retrieves relevant snippets from *your* data at question time
(`findSimilarChunks` in `src/lib/retrieval/vectorSearch.ts`) and hands
them to the model as context, so answers can be grounded in documents
the model was never trained on.

### Q: Why do we chunk documents instead of embedding the whole thing at once?

Two reasons. First, embedding models and chat models have context
limits. Second — and more important for retrieval quality — embedding
an entire multi-page document as one vector would blur many unrelated
topics into a single point in vector space, making similarity search
nearly useless. Smaller, focused chunks (`chunkDocument` in
`src/lib/chunking/chunkText.ts`) each represent one coherent idea, so
similarity search can find the *specific* relevant passage instead of
just "a document that's generally related."

### Q: Why is there overlap between chunks?

If chunk boundaries fell exactly at sentence or idea boundaries every
time, overlap wouldn't be needed. In practice, an idea can straddle a
chunk boundary. `chunkPageText` in `chunkText.ts` repeats the last
`RAG_CHUNK_OVERLAP` characters of one chunk at the start of the next,
so a straddling idea is still fully present in at least one whole
chunk.

### Q: What is an embedding, concretely?

A fixed-length array of numbers (1536 of them here, from OpenAI's
`text-embedding-3-small`) that represents a piece of text's meaning.
Texts with similar meaning produce vectors that are close together in
that 1536-dimensional space, even if they share no exact words.

### Q: Why cosine similarity instead of Euclidean distance?

Cosine similarity measures the *angle* between two vectors, ignoring
their magnitude — so it isn't skewed by one text being longer than
another. It's the standard choice for text embeddings, and it's what
pgvector's `<=>` operator computes.

### Q: What is pgvector, and why use it instead of comparing vectors in JavaScript?

pgvector is a PostgreSQL extension adding a native `vector` column type
and similarity operators. Doing the comparison inside the database (one
SQL query, `src/lib/retrieval/vectorSearch.ts`) means you don't have to
pull every stored embedding into your application and loop over them in
JavaScript — the database's own index (IVFFlat, see
`docs/DATABASE.md`) does the heavy lifting, and it scales far better as
the number of chunks grows.

### Q: Why does `DocumentChunk.embedding` use `Unsupported("vector(1536)")` in Prisma?

Prisma doesn't have a built-in TypeScript type for pgvector's `vector`
column. `Unsupported(...)` tells Prisma's migration engine to create
the column with that exact Postgres type anyway, while marking it as
something Prisma Client's normal typed API can't read/write. That's why
`ingestDocument.ts` inserts embeddings with `prisma.$executeRaw` and
`vectorSearch.ts` queries them with `prisma.$queryRaw` instead of the
usual `prisma.documentChunk.create(...)`.

### Q: How does the system decide an answer is "grounded"?

The system prompt (`SYSTEM_PROMPT` in `src/lib/rag/buildPrompt.ts`)
instructs the model to prefix its answer with `INSUFFICIENT_CONTEXT:`
when the retrieved chunks don't actually answer the question.
`parseModelResponse()` in `src/lib/rag/generateAnswer.ts` checks for
that prefix (and also treats zero retrieved chunks as automatically
ungrounded, even without the marker, as a defensive fallback) and only
attaches `sources` to grounded answers.

### Q: How are citations produced — is there a separate step that matches quotes to sources?

No separate matching step is needed. The `sources` attached to a
grounded answer are exactly the chunks that were retrieved and sent to
the model as context (`RetrievedChunk[]` → `SourceReference[]` in
`generateAnswer.ts`). Since the model is instructed to answer only from
that context, the chunks it was given *are* its sources by
construction.

### Q: What is prompt injection, and how is it defended against here?

Prompt injection is when untrusted text placed into a prompt is crafted
to look like an instruction, trying to hijack the model's behavior —
relevant here because uploaded document content becomes part of the
prompt. The defense (`SYSTEM_PROMPT` in `buildPrompt.ts`) is to wrap
retrieved context in fixed delimiter markers and explicitly tell the
model everything inside them is data, never instructions, even if it
looks like a command. This is a real but not airtight defense — see
`docs/RAG_PIPELINE.md`'s "Limits" paragraph and `docs/DECISIONS.md`.

### Q: Why is ingestion synchronous instead of using a background job queue?

A queue (e.g. BullMQ + Redis) adds a second running process and new
failure modes for a benefit that only matters at a scale this project
doesn't target. For the file sizes this app allows, extract → chunk →
embed → store completes well within one HTTP request. See
`docs/DECISIONS.md`, "Synchronous ingestion vs. a background job queue."

### Q: What happens if two people upload documents (or ask questions) from different machines — does your rate limiter still work correctly?

Only if there's a single running instance of the app. The rate limiter
(`src/lib/security/rateLimit.ts`) is an in-memory `Map`, so each running
process enforces its own limit independently. Behind a load balancer
with multiple instances, a client could get through more requests than
intended. Documented as a known limitation with the fix (a shared store
like Redis) in `docs/DECISIONS.md`.

### Q: Why are `Message.sources` stored as JSON instead of a foreign key to `DocumentChunk`?

If sources were a foreign key and the source document were later
deleted, you'd have to choose between losing the citation
(`onDelete: SetNull`) or never being able to delete a cited document.
Storing a JSON snapshot (`documentId`, `documentName`, `pageNumber`,
`chunkIndex`, `snippet`) at the time the answer was generated keeps chat
history fully readable even after the source document is gone. See
`docs/DATABASE.md`.

### Q: Why per-page chunking instead of chunking the whole extracted text as one string?

Chunking per page first guarantees a chunk's `pageNumber` is always
unambiguous — if you chunked the concatenated full-document text
instead, a single chunk could span two different pages, and you'd have
no clean way to say "this citation is on page 4" versus "pages 4–5."

### Q: What's the difference between `similarity` and `distance` in the retrieval code?

pgvector's `<=>` operator returns cosine *distance* (0 = identical
direction, 2 = completely opposite). `findSimilarChunks` converts that
to `similarity = 1 - distance / 2` purely so the rest of the codebase
(and any future UI) can reason in "higher number = better match" terms
instead of "lower number = better match."

### Q: Where is the OpenAI API key used, and how do you know it can't leak to the browser?

`src/lib/openai.ts` reads it via `config.openaiApiKey()`
(`src/lib/config.ts`, which reads `process.env.OPENAI_API_KEY` — no
`NEXT_PUBLIC_` prefix). Only server-side files import `openai.ts`: API
route handlers and other `src/lib/` modules. No `"use client"`
component ever imports it, so it's never included in the JavaScript
bundle sent to the browser.
