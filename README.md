# RAG Document Chatbot

Ask questions and get answers grounded in your own uploaded PDF/TXT
documents, with citations back to the source page. Built with Next.js
(App Router), PostgreSQL + pgvector, Prisma, and the OpenAI API.

See `docs/` for full architecture, database, RAG-pipeline, code
walkthrough, learning guide, request-flow diagrams, and the reasoning
behind key decisions. Start with `docs/ARCHITECTURE.md`.

## Prerequisites

- Node.js 18.18+ (Next.js 15 requirement)
- A PostgreSQL database with the ability to run
  `CREATE EXTENSION vector;` (see "PostgreSQL / pgvector setup" below)
- An OpenAI API key

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in at minimum `DATABASE_URL` plus one chat provider and one
   embedding provider. **Can't pay for OpenAI yet?** Both providers are
   swappable independently, no code changes needed:

   | | Free option (no card) | Paid option |
   |---|---|---|
   | Chat/generation | `CHAT_PROVIDER="groq"` + `GROQ_API_KEY` from [console.groq.com](https://console.groq.com) | `CHAT_PROVIDER="openai"` + `OPENAI_API_KEY` |
   | Embeddings | `EMBEDDING_PROVIDER="gemini"` + `GEMINI_API_KEY` from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `EMBEDDING_PROVIDER="openai"` + `OPENAI_API_KEY` |

   You can mix providers freely (e.g. Groq for chat + OpenAI for
   embeddings) — each is picked independently. See
   `docs/DECISIONS.md`, "Pluggable chat/embedding providers," for why
   Groq alone isn't enough (it has no embeddings endpoint) and the free
   Groq+Gemini combo was chosen as the default-friendly pairing. See
   `.env.example` for every variable and its default.

3. **PostgreSQL / pgvector setup**

   pgvector needs to be installed on your Postgres server (not just
   enabled per-database) before the app's migration can run.

   - **Docker (simplest)** — use an image with pgvector preinstalled:
     ```bash
     docker run -d --name rag-postgres \
       -e POSTGRES_PASSWORD=password \
       -e POSTGRES_DB=rag_chatbot \
       -p 5432:5432 \
       pgvector/pgvector:pg16
     ```
     Then set `DATABASE_URL="postgresql://postgres:password@localhost:5432/rag_chatbot"`.

   - **Managed Postgres** (Supabase, Neon, RDS, etc.) — most modern
     providers support pgvector; enable it from their dashboard/docs
     (usually a single "extensions" toggle or `CREATE EXTENSION vector;`
     if they allow superuser access).

   - **Self-managed Postgres** — install the `pgvector` extension for
     your OS/Postgres version from the
     [pgvector repo](https://github.com/pgvector/pgvector#installation),
     then the migration below handles `CREATE EXTENSION`.

4. **Run the database migration**

   ```bash
   npx prisma migrate deploy
   ```

   This creates the `vector` extension, all four tables, and the
   IVFFlat similarity index (see `docs/DATABASE.md`).

5. **Generate the Prisma Client**

   ```bash
   npx prisma generate
   ```

   (Included automatically by `npm install` in most setups via a
   `postinstall` hook in newer Prisma versions, but run it explicitly if
   you see a "did not initialize yet" error.)

6. **Run the app**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, upload a PDF or TXT file, and once its
   status shows `READY`, ask a question about it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the unit test suite (vitest) |
| `npm run lint` | Next.js ESLint |
| `npx prisma migrate deploy` | Apply migrations (production-safe) |
| `npx prisma migrate dev` | Create+apply a new migration (dev only) |

## Project structure

See `docs/ARCHITECTURE.md` for the full breakdown. Short version:

```
src/app/            → pages + API routes (thin HTTP layer)
src/components/     → React UI
src/lib/            → all real logic: extraction, chunking, embeddings,
                       retrieval, prompting, generation, persistence
src/__tests__/      → vitest unit tests for the pure logic in lib/
prisma/             → schema + migrations
docs/               → architecture, database, pipeline, and decision docs
```

## Testing

```bash
npm test
```

21 unit tests covering: chunking behavior (boundaries, overlap,
multi-page indexing), upload/request validation, prompt construction
(delimiters, source numbering), and grounded vs. insufficient-context
answer handling. These are all pure-function tests — no database or
OpenAI API calls are made, so they run instantly and don't need
`.env` configured.

## Limitations

See `docs/DECISIONS.md` for the full reasoning behind each of these:

- **No authentication** — anyone who can reach the app sees all
  documents and conversations. Not suitable for multi-tenant or
  sensitive-document use without adding auth first.
- **Synchronous ingestion** — large documents block the upload request
  until fully processed; no background job queue.
- **In-memory rate limiting** — resets on restart and doesn't
  coordinate across multiple server instances.
- **No streaming** — chat answers arrive as one complete response, not
  token-by-token.
- **Approximate token counts** — chunk sizing uses a character-based
  heuristic, not an exact tokenizer.
- **PDF text only** — scanned/image-only PDFs with no text layer will
  fail to ingest (no OCR).
- One documented, non-critical dependency advisory (outdated `postcss`
  bundled inside Next.js's own build tooling) — see `docs/DECISIONS.md`.

## Recommended reading order for `/docs`

1. `docs/ARCHITECTURE.md` — the big picture
2. `docs/RAG_PIPELINE.md` — how a question actually gets answered
3. `docs/DATABASE.md` — schema and the pgvector specifics
4. `docs/CODE_WALKTHROUGH.md` — file-by-file reference
5. `docs/REQUEST_FLOWS.md` — sequence diagrams for the three main requests
6. `docs/LEARNING_GUIDE.md` — RAG concepts tied to this code, for study/viva prep
7. `docs/EXAM_PREP_QA.md` — likely viva/exam questions with answers referencing the code
8. `docs/DECISIONS.md` — why things were built this way, and what to change to scale
