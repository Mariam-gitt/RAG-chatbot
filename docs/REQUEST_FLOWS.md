# Request Flows

Sequence diagrams for the two main flows, matching the actual function
calls (see `docs/CODE_WALKTHROUGH.md` for the file-by-file detail).

## Upload a document

```mermaid
sequenceDiagram
    participant U as Browser (DocumentUpload.tsx)
    participant R as POST /api/documents
    participant V as validateUploadedFile
    participant I as ingestDocument
    participant E as extractText
    participant C as chunkDocument
    participant M as generateEmbeddings
    participant DB as PostgreSQL

    U->>R: multipart/form-data { file }
    R->>R: checkRateLimit(clientIP)
    R->>V: validate(fileName, size, buffer)
    alt invalid
        V-->>R: { valid: false, error }
        R-->>U: 400 { error }
    else valid
        V-->>R: { valid: true, extension }
        R->>I: ingestDocument({fileName, fileType, fileSize, buffer})
        I->>DB: INSERT Document (status=PROCESSING)
        I->>E: extractText(buffer, extension)
        E-->>I: { pages, pageCount }
        I->>C: chunkDocument(pages)
        C-->>I: TextChunk[]
        I->>M: generateEmbeddings(chunk texts)
        M-->>I: number[][]
        I->>DB: transaction: INSERT DocumentChunk (with ::vector) x N
        I->>DB: UPDATE Document (status=READY, pageCount)
        I-->>R: Document
        R-->>U: 201 { document }
    end
```

On any error inside `ingestDocument` (extraction failure, embedding API
error, DB error), the `Document` row is updated to `status=FAILED` with
`errorMessage` before the error is re-thrown, and the route returns 500.

## Ask a question

```mermaid
sequenceDiagram
    participant U as Browser (ChatWindow.tsx)
    participant R as POST /api/chat
    participant Val as chatRequestSchema
    participant A as answerQuestion
    participant Emb as generateEmbedding
    participant S as findSimilarChunks
    participant P as buildUserPrompt
    participant G as generateAnswer
    participant DB as PostgreSQL
    participant LLM as OpenAI Chat API

    U->>R: POST { question, conversationId? }
    R->>R: checkRateLimit(clientIP)
    R->>Val: safeParse(body)
    alt invalid
        Val-->>R: { success: false }
        R-->>U: 400 { error }
    else valid
        Val-->>R: { question, conversationId? }
        R->>A: answerQuestion({question, conversationId})
        A->>DB: find or create Conversation
        A->>DB: INSERT Message (role=USER)
        A->>Emb: generateEmbedding(question)
        Emb-->>A: number[]
        A->>S: findSimilarChunks(embedding, topK)
        S->>DB: SELECT ... ORDER BY embedding <=> $1 LIMIT topK
        DB-->>S: rows
        S-->>A: RetrievedChunk[]
        A->>P: buildUserPrompt(question, chunks) (inside generateAnswer)
        A->>G: generateAnswer(question, chunks)
        G->>LLM: chat.completions.create(system + user prompt)
        LLM-->>G: raw answer text
        G->>G: parseModelResponse(rawAnswer, chunks)
        G-->>A: { answer, sources, isGrounded }
        A->>DB: INSERT Message (role=ASSISTANT, sources)
        A-->>R: { conversationId, messageId, answer, sources, isGrounded }
        R-->>U: 200 { ...result }
    end
```

## Delete a document

```mermaid
sequenceDiagram
    participant U as Browser (DocumentList.tsx)
    participant R as DELETE /api/documents/[id]
    participant DB as PostgreSQL

    U->>R: DELETE /api/documents/:id
    R->>DB: DELETE FROM Document WHERE id = :id
    Note over DB: ON DELETE CASCADE removes<br/>all DocumentChunk rows for this document
    alt found
        DB-->>R: deleted
        R-->>U: 200 { success: true }
    else not found
        DB-->>R: error
        R-->>U: 404 { error }
    end
```
