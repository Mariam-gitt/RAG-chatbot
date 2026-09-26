// Shared types used across lib modules, API routes, and components.
// Keeping these in one file avoids each layer inventing its own slightly
// different shape for "a source" or "a chat message".

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
  similarity: number; // 0..1, higher = more similar (cosine similarity)
}

export interface SourceReference {
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  chunkIndex: number;
  snippet: string;
}

export interface ChatAnswer {
  answer: string;
  sources: SourceReference[];
  isGrounded: boolean; // false when the model reported insufficient context
}

export interface ExtractedPage {
  pageNumber: number | null; // null when the source format has no pages (txt)
  text: string;
}

export interface ExtractedDocument {
  pages: ExtractedPage[];
  pageCount: number | null;
}

export interface TextChunk {
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  tokenCount: number;
}
